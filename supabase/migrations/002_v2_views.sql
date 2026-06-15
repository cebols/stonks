-- ============================================================================
-- Stonks v2 — funções e views de agregação (rode uma vez no SQL Editor).
-- Não altera dados nem exige re-ingestão: tudo deriva das tabelas existentes
-- (trades + trade_performance). Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Classificação de ativo a partir do código do disclosure (House/Senate).
-- stock = ações; fund = fundos (ETF/mútuo/hedge/anuidade); other = bonds,
-- títulos públicos/municipais, opções, etc. (ou sem ticker).
-- ---------------------------------------------------------------------------
create or replace function asset_class(p_asset_type text, p_ticker text)
returns text language sql immutable as $$
  select case
    when upper(coalesce(p_asset_type,'')) in
         ('ET','EF','ETF','MF','MUTUAL FUND','HN','PE','VA','FN','MA') then 'fund'
    when upper(coalesce(p_asset_type,'')) in
         ('CB','CORPORATE BOND','GS','MUNICIPAL SECURITY','MS','OP','OPTION',
          'OT','OI','CT','AB','OL','OTHER') then 'other'
    when p_ticker is null then 'other'
    -- ST, Stock, CS (common), PS (preferred), RS (restricted), Non-Public Stock…
    else 'stock'
  end;
$$;

-- midpoint da faixa de valor (a lei só divulga faixa; usamos o ponto médio).
create or replace function amount_mid(p_min numeric, p_max numeric)
returns numeric language sql immutable as $$
  select (coalesce(p_min,0) + coalesce(p_max, p_min, 0)) / 2.0;
$$;

-- ---------------------------------------------------------------------------
-- Resumo por político (todas as categorias). Inclui TODOS os políticos
-- (mesmo sem trade pontuada), com contagens totais e só-stock.
-- ---------------------------------------------------------------------------
create or replace view politician_summary as
select
  p.id, p.full_name, p.chamber, p.party, p.state,
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
group by p.id, p.full_name, p.chamber, p.party, p.state;

-- ---------------------------------------------------------------------------
-- Resumo por ticker (apenas ações). Volume de compra/venda (estimado pelo
-- midpoint), nº de políticos, e desempenho (alpha/win rate) agregado.
-- ---------------------------------------------------------------------------
create or replace view ticker_summary as
select
  t.ticker,
  max(t.asset_description)                                             as asset_description,
  count(*)                                                             as trade_count,
  count(distinct t.politician_id)                                     as filer_count,
  count(*) filter (where t.tx_type = 'purchase')                       as purchases,
  count(*) filter (where t.tx_type = 'sale')                           as sales,
  round(sum(amount_mid(t.amount_min, t.amount_max))::numeric, 0)       as est_volume,
  round(sum(amount_mid(t.amount_min, t.amount_max))
        filter (where t.tx_type = 'purchase')::numeric, 0)             as buy_volume,
  round(sum(amount_mid(t.amount_min, t.amount_max))
        filter (where t.tx_type = 'sale')::numeric, 0)                 as sell_volume,
  count(tp.trade_id)                                                   as scored_trades,
  round(avg(tp.alpha)::numeric, 2)                                     as avg_alpha,
  round((avg(case when tp.is_win then 1 else 0 end) * 100)::numeric, 1) as win_rate,
  max(t.transaction_date)                                              as last_traded
from trades t
left join trade_performance tp on tp.trade_id = t.id
where t.ticker is not null
  and asset_class(t.asset_type, t.ticker) = 'stock'
group by t.ticker;
