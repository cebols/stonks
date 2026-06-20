-- ============================================================================
-- Stonks — schema do banco (Supabase / Postgres)
-- ----------------------------------------------------------------------------
-- Rode este arquivo no SQL Editor do Supabase (uma vez) para criar as tabelas.
-- O frontend lê via chave anon (apenas SELECT, garantido por RLS abaixo).
-- Os scripts de ingestão escrevem via service_role (ignora RLS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Políticos (membros da Câmara e do Senado)
-- ---------------------------------------------------------------------------
create table if not exists politicians (
  id          text primary key,            -- slug estável: ex. "nancy-pelosi"
  full_name   text not null,
  chamber     text not null check (chamber in ('house', 'senate')),
  party       text,                         -- 'D' | 'R' | 'I' | null se desconhecido
  state       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trades (Periodic Transaction Reports — PTRs)
-- A lei só exige FAIXA de valor, por isso guardamos amount_min/amount_max.
-- ---------------------------------------------------------------------------
create table if not exists trades (
  id                 text primary key,      -- hash determinístico (ver ingest.mjs)
  politician_id      text not null references politicians (id) on delete cascade,
  transaction_date   date,
  disclosure_date    date,
  ticker             text,                  -- normalizado em maiúsculas, null se "--"
  asset_description  text,
  asset_type         text,                  -- stock | etf | option | bond | crypto | ...
  tx_type            text,                  -- purchase | sale | exchange
  owner              text,                  -- self | spouse | child | joint
  amount_min         numeric,
  amount_max         numeric,
  -- delay de divulgação em dias (a métrica do "Khanna"): quanto tempo entre
  -- a transação e a publicação. Coluna gerada automaticamente.
  disclosure_delay_days int generated always as (
    case
      when disclosure_date is not null and transaction_date is not null
      then (disclosure_date - transaction_date)
      else null
    end
  ) stored,
  raw                jsonb,                 -- registro bruto, pra auditoria
  created_at         timestamptz not null default now()
);

create index if not exists trades_politician_idx on trades (politician_id);
create index if not exists trades_ticker_idx      on trades (ticker);
create index if not exists trades_tx_date_idx      on trades (transaction_date desc);

-- ---------------------------------------------------------------------------
-- Preços históricos (fechamento diário) — fonte: Stooq (gratuita).
-- Usados para calcular retorno das trades e o benchmark (S&P / SPY).
-- ---------------------------------------------------------------------------
create table if not exists prices (
  ticker  text not null,
  date    date not null,
  close   numeric not null,
  primary key (ticker, date)
);

-- ---------------------------------------------------------------------------
-- Performance por trade (track record). Preenchida por compute-performance.mjs.
-- return_pct: retorno do ativo da data da trade até a data de referência.
-- benchmark_return_pct: retorno do S&P no mesmo período.
-- alpha = return_pct - benchmark_return_pct (ajustado por compra/venda).
-- ---------------------------------------------------------------------------
create table if not exists trade_performance (
  trade_id             text primary key references trades (id) on delete cascade,
  price_at_trade       numeric,
  price_reference      numeric,
  reference_date       date,
  return_pct           numeric,
  benchmark_return_pct numeric,
  alpha                numeric,             -- já com sinal ajustado p/ sale
  is_win               boolean,             -- alpha > 0 ?
  computed_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Preços reais por trade (fechamento diário via Yahoo Finance). Preenchida
-- pelo ingest. entry_price = fechamento na data da trade (ou pregão anterior).
-- open_return_pct = resultado de uma COMPRA até hoje.
-- realized_return_pct = resultado de uma VENDA vs a compra que ela fechou (FIFO).
-- ---------------------------------------------------------------------------
create table if not exists trade_prices (
  trade_id             text primary key references trades (id) on delete cascade,
  entry_price          numeric,             -- fechamento na data desta trade
  price_now            numeric,             -- fechamento mais recente do ticker
  open_return_pct      numeric,             -- compra: (price_now/entry - 1)*100
  realized_return_pct  numeric,             -- venda: (venda/compra_casada - 1)*100
  matched_buy_date     date,                -- venda: data da compra casada
  computed_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- View de leaderboard: agrega o track record por político.
-- (win rate e alpha médio de TODAS as trades, não só as vencedoras — a lição
-- do Khanna: olhe o agregado, não o recorte.)
-- ---------------------------------------------------------------------------
create or replace view politician_track_record as
select
  p.id,
  p.full_name,
  p.chamber,
  p.party,
  p.state,
  count(tp.trade_id)                                      as scored_trades,
  round(avg(tp.alpha)::numeric, 2)                        as avg_alpha,
  round((avg(case when tp.is_win then 1 else 0 end) * 100)::numeric, 1) as win_rate,
  round(avg(t.disclosure_delay_days)::numeric, 1)         as avg_disclosure_delay_days
from politicians p
join trades t              on t.politician_id = p.id
join trade_performance tp  on tp.trade_id = t.id
group by p.id, p.full_name, p.chamber, p.party, p.state;

-- ============================================================================
-- Row Level Security: leitura pública (anon), escrita só service_role.
-- ============================================================================
alter table politicians       enable row level security;
alter table trades            enable row level security;
alter table prices            enable row level security;
alter table trade_performance enable row level security;
alter table trade_prices      enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'public read politicians') then
    create policy "public read politicians" on politicians for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'public read trades') then
    create policy "public read trades" on trades for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'public read prices') then
    create policy "public read prices" on prices for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'public read trade_performance') then
    create policy "public read trade_performance" on trade_performance for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'public read trade_prices') then
    create policy "public read trade_prices" on trade_prices for select using (true);
  end if;
end $$;

-- ============================================================================
-- v2 — funções e views de agregação (para filtros, ações e comparador).
-- Tudo idempotente: este arquivo é a fonte única; recopie-o inteiro no SQL
-- Editor sempre que o schema mudar.
-- ============================================================================

-- Retorno do CDI (Brasil) acumulado da data da trade até hoje — referência de
-- "risk-free brasileiro". Preenchido pelo ingest (fonte: API do Banco Central).
alter table trade_performance add column if not exists cdi_return_pct numeric;

-- Marca se a trade é a PRIMEIRA compra daquele ticker por aquele político
-- (abertura de posição) dentro do dataset. Preenchido pelo ingest.
alter table trades add column if not exists is_opening boolean;

-- Comitês do Congresso a que o político pertence (membros atuais). Preenchido
-- pelo ingest a partir de unitedstates/congress-legislators.
alter table politicians add column if not exists committees text[];

-- Classificação de ativo a partir do código do disclosure (House/Senate).
-- stock = ações; fund = fundos (ETF/mútuo/hedge/anuidade); other = bonds,
-- títulos públicos/municipais, opções, etc. (ou sem ticker).
create or replace function asset_class(p_asset_type text, p_ticker text)
returns text language sql immutable as $$
  select case
    when upper(coalesce(p_asset_type,'')) in
         ('ET','EF','ETF','MF','MUTUAL FUND','HN','PE','VA','FN','MA') then 'fund'
    when upper(coalesce(p_asset_type,'')) in
         ('CB','CORPORATE BOND','GS','MUNICIPAL SECURITY','MS','OP','OPTION',
          'OT','OI','CT','AB','OL','OTHER') then 'other'
    when p_ticker is null then 'other'
    else 'stock'
  end;
$$;

-- midpoint da faixa de valor (a lei só divulga faixa; usamos o ponto médio).
create or replace function amount_mid(p_min numeric, p_max numeric)
returns numeric language sql immutable as $$
  select (coalesce(p_min,0) + coalesce(p_max, p_min, 0)) / 2.0;
$$;

-- Resumo por político (todas as categorias): inclui TODOS os políticos, com
-- contagens totais e só-stock, alpha médio e win rate.
-- (drop + create: permite mudar a ordem/conjunto de colunas ao re-rodar.)
drop view if exists politician_summary cascade;
create view politician_summary as
select
  p.id, p.full_name, p.chamber, p.party, p.state, p.committees,
  count(t.id)                                                          as total_trades,
  count(t.id) filter (where asset_class(t.asset_type, t.ticker) = 'stock') as stock_trades,
  count(tp.trade_id)                                                   as scored_trades,
  round(avg(tp.alpha)::numeric, 2)                                     as avg_alpha,
  round((avg(case when tp.is_win then 1 else 0 end) * 100)::numeric, 1) as win_rate,
  round(avg(t.disclosure_delay_days)::numeric, 1)                      as avg_disclosure_delay_days,
  max(t.transaction_date)                                              as last_traded
from politicians p
left join trades t             on t.politician_id = p.id
left join trade_performance tp on tp.trade_id = t.id
group by p.id, p.full_name, p.chamber, p.party, p.state, p.committees;

-- Resumo por ticker (apenas ações): volume de compra/venda (estimado pelo
-- midpoint), nº de políticos, e desempenho (alpha/win rate) agregado.
drop view if exists ticker_summary cascade;
create view ticker_summary as
select
  t.ticker,
  max(t.asset_description)                                             as asset_description,
  count(*)                                                             as trade_count,
  count(distinct t.politician_id)                                     as filer_count,
  count(*) filter (where t.tx_type = 'purchase')                       as purchases,
  count(*) filter (where t.tx_type = 'sale')                           as sales,
  round(sum(amount_mid(t.amount_min, t.amount_max))::numeric, 0)       as est_volume,
  round((sum(amount_mid(t.amount_min, t.amount_max))
         filter (where t.tx_type = 'purchase'))::numeric, 0)           as buy_volume,
  round((sum(amount_mid(t.amount_min, t.amount_max))
         filter (where t.tx_type = 'sale'))::numeric, 0)               as sell_volume,
  round((coalesce(sum(amount_mid(t.amount_min, t.amount_max))
            filter (where t.tx_type = 'purchase'), 0)
       - coalesce(sum(amount_mid(t.amount_min, t.amount_max))
            filter (where t.tx_type = 'sale'), 0))::numeric, 0)        as net_volume,
  count(tp.trade_id)                                                   as scored_trades,
  round(avg(tp.alpha)::numeric, 2)                                     as avg_alpha,
  round((avg(case when tp.is_win then 1 else 0 end) * 100)::numeric, 1) as win_rate,
  max(t.transaction_date)                                              as last_traded
from trades t
left join trade_performance tp on tp.trade_id = t.id
where t.ticker is not null
  and asset_class(t.asset_type, t.ticker) = 'stock'
group by t.ticker;

-- Estatísticas globais (uma linha) para o cabeçalho da home.
create or replace view global_stats as
select
  count(*)                                                              as total_trades,
  count(*) filter (where transaction_date >= current_date - 30)         as trades_30d,
  count(distinct politician_id)                                        as politicians,
  count(distinct ticker) filter
    (where ticker is not null and asset_class(asset_type, ticker) = 'stock') as stocks,
  round(avg(disclosure_delay_days)::numeric, 1)                        as avg_delay,
  round(sum(amount_mid(amount_min, amount_max))::numeric, 0)           as total_volume
from trades;
