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
end $$;
