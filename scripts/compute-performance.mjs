// ============================================================================
// Calcula o track record por trade: retorno do ativo desde a data da transação
// até a data de referência (preço mais recente disponível), o retorno do
// benchmark (S&P/SPY) no mesmo período, e o alpha.
//
// Ajuste de sinal: numa COMPRA, ganho do político = retorno do ativo. Numa
// VENDA, o político se livrou do ativo, então o "acerto" é o ativo cair —
// invertemos o sinal. Assim alpha > 0 sempre significa "boa decisão".
//
// Rodar: npm run compute-performance
// ============================================================================
import { getServiceClient, upsertInChunks } from './lib.mjs';

const BENCHMARK = process.env.PRICE_BENCHMARK_TICKER || 'SPY';

// Carrega a série de preços de um ticker como mapa { date -> close } + datas ordenadas.
async function loadPriceSeries(supabase, ticker) {
  const { data, error } = await supabase
    .from('prices')
    .select('date, close')
    .eq('ticker', ticker)
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);
  const map = new Map(data.map((r) => [r.date, Number(r.close)]));
  return { map, dates: data.map((r) => r.date) };
}

// Primeiro preço com data >= alvo (a transação pode cair num fim de semana).
function priceOnOrAfter(series, targetDate) {
  for (const d of series.dates) {
    if (d >= targetDate) return { date: d, close: series.map.get(d) };
  }
  return null;
}

function lastPrice(series) {
  if (series.dates.length === 0) return null;
  const d = series.dates[series.dates.length - 1];
  return { date: d, close: series.map.get(d) };
}

async function main() {
  const supabase = getServiceClient();

  const spy = await loadPriceSeries(supabase, BENCHMARK);
  const spyLast = lastPrice(spy);
  if (!spyLast) throw new Error(`Sem preços do benchmark ${BENCHMARK}. Rode fetch-prices antes.`);

  // Trades com ticker e data de transação.
  const { data: trades, error } = await supabase
    .from('trades')
    .select('id, ticker, tx_type, transaction_date')
    .not('ticker', 'is', null)
    .not('transaction_date', 'is', null);
  if (error) throw new Error(error.message);

  const seriesCache = new Map();
  const out = [];

  for (const t of trades) {
    let series = seriesCache.get(t.ticker);
    if (!series) {
      series = await loadPriceSeries(supabase, t.ticker);
      seriesCache.set(t.ticker, series);
    }
    if (series.dates.length === 0) continue;

    const entry = priceOnOrAfter(series, t.transaction_date);
    const exit = lastPrice(series);
    const spyEntry = priceOnOrAfter(spy, t.transaction_date);
    if (!entry || !exit || !spyEntry || !entry.close || !spyEntry.close) continue;

    const assetReturn = (exit.close - entry.close) / entry.close * 100;
    const benchReturn = (spyLast.close - spyEntry.close) / spyEntry.close * 100;

    // Inverte sinal para vendas (acertar a venda = ativo cair).
    const sign = t.tx_type === 'sale' ? -1 : 1;
    const alpha = sign * (assetReturn - benchReturn);

    out.push({
      trade_id: t.id,
      price_at_trade: entry.close,
      price_reference: exit.close,
      reference_date: exit.date,
      return_pct: Number((sign * assetReturn).toFixed(2)),
      benchmark_return_pct: Number((sign * benchReturn).toFixed(2)),
      alpha: Number(alpha.toFixed(2)),
      is_win: alpha > 0,
    });
  }

  console.log(`Calculado performance de ${out.length} trades. Gravando...`);
  await upsertInChunks(supabase, 'trade_performance', out, 'trade_id');
  console.log('✅ Track record atualizado.');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
