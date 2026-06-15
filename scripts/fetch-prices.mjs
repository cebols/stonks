// ============================================================================
// Baixa preços históricos (fechamento diário) da Stooq — gratuito, sem chave.
// Pega todos os tickers distintos presentes em `trades` + o benchmark (SPY),
// e faz upsert em `prices`. Usado depois para calcular retorno/alpha.
//
// Endpoint: https://stooq.com/q/d/l/?s={TICKER}.US&i=d  (CSV: Date,Open,High,Low,Close,Volume)
//
// Rodar: npm run fetch-prices
// ============================================================================
import { getServiceClient, upsertInChunks } from './lib.mjs';

const BENCHMARK = process.env.PRICE_BENCHMARK_TICKER || 'SPY';

async function fetchStooqCSV(ticker) {
  const url = `https://stooq.com/q/d/l/?s=${ticker.toLowerCase()}.us&i=d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'stonks-prices' } });
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2 || !lines[0].toLowerCase().startsWith('date')) return [];
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const date = cols[0];
    const close = Number(cols[4]);
    if (date && Number.isFinite(close)) rows.push({ ticker, date, close });
  }
  return rows;
}

async function main() {
  const supabase = getServiceClient();

  // Tickers distintos com transação registrada.
  const { data: tickerRows, error } = await supabase
    .from('trades')
    .select('ticker')
    .not('ticker', 'is', null);
  if (error) throw new Error(error.message);

  const tickers = [...new Set(tickerRows.map((r) => r.ticker))].filter(Boolean);
  tickers.push(BENCHMARK);
  const unique = [...new Set(tickers)];
  console.log(`→ Buscando preços de ${unique.length} tickers (inclui benchmark ${BENCHMARK})`);

  let ok = 0;
  for (const ticker of unique) {
    try {
      const rows = await fetchStooqCSV(ticker);
      if (rows.length) {
        await upsertInChunks(supabase, 'prices', rows, 'ticker,date', 1000);
        ok++;
      }
      // Stooq é generoso, mas evitamos martelar: pequena pausa.
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      console.warn(`  ⚠️  ${ticker}: ${e.message}`);
    }
  }
  console.log(`✅ Preços atualizados para ${ok}/${unique.length} tickers.`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
