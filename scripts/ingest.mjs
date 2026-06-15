// ============================================================================
// Ingestão das trades públicas (Câmara + Senado) + track record, para o Supabase.
//
// Fonte: kadoa-org/congress-trading-monitor — um único JSON combinado e já
// normalizado, derivado dos filings oficiais do STOCK Act (House Clerk +
// Senate EFD). Além das trades, traz retorno e alpha pré-calculados por trade
// (ret_since = retorno desde a transação; excess_since = excesso vs benchmark
// = alpha), que populam a tabela trade_performance — sem precisar de preços
// externos. URL configurável via TRADES_URL (lista separada por vírgula).
//
// Rodar: npm run ingest
// ============================================================================
import {
  getServiceClient, slugify, normalizeTxType, normalizeTicker, toISODate,
  upsertInChunks, fetchJSON, fetchCDIIndex, cdiReturnSince,
} from './lib.mjs';

const DEFAULT_URL =
  'https://raw.githubusercontent.com/kadoa-org/congress-trading-monitor/main/public/data/trades.json';
const TRADES_URLS = (process.env.TRADES_URL || DEFAULT_URL)
  .split(',').map((u) => u.trim()).filter(Boolean);

const round2 = (n) => (n == null ? null : Number(Number(n).toFixed(2)));
const cleanText = (s) => String(s || '').replace(/\s+/g, ' ').trim() || null;

// Mapeia um registro bruto -> { politician, trade, perf }. Retorna null se
// inválido ou se não for Câmara/Senado (descarta executivo).
function mapRecord(raw) {
  const chamber = String(raw.chamber || '').toLowerCase();
  if (chamber !== 'house' && chamber !== 'senate') return null;

  const name = raw.filer_name || raw.name;
  if (!name) return null;
  const politicianId = raw.filer_id || slugify(name);
  const tradeId = raw.id ||
    `${politicianId}:${raw.transaction_date}:${raw.ticker}:${raw.row_index ?? ''}`;
  const txType = normalizeTxType(raw.transaction_type || raw.type);

  // Sinal: numa COMPRA o acerto é o ativo subir; numa VENDA, cair. Invertendo
  // o sinal nas vendas, alpha > 0 sempre significa "boa decisão".
  const dir = txType === 'sale' ? -1 : 1;
  const retSince = raw.ret_since;
  const excess = raw.excess_since;

  // Só cria linha de performance quando há alpha (excess_since) disponível.
  const perf = excess == null ? null : {
    trade_id: tradeId,
    price_at_trade: null,
    price_reference: null,
    reference_date: null,
    return_pct: retSince == null ? null : round2(dir * retSince),
    benchmark_return_pct: retSince == null ? null : round2(dir * (retSince - excess)),
    alpha: round2(dir * excess),
    is_win: dir * excess > 0,
  };

  return {
    politician: {
      id: politicianId,
      full_name: name,
      chamber,
      party: raw.party || null,
      state: raw.state || null,
    },
    trade: {
      id: tradeId,
      politician_id: politicianId,
      transaction_date: toISODate(raw.transaction_date),
      disclosure_date: toISODate(raw.filing_date || raw.disclosure_date),
      ticker: normalizeTicker(raw.ticker),
      asset_description: cleanText(raw.asset_name || raw.asset_description),
      asset_type: (raw.asset_type || '').toString().toLowerCase() || null,
      tx_type: txType,
      owner: (raw.owner || 'self').toString().toLowerCase(),
      amount_min: raw.amount_range_low ?? null,
      amount_max: raw.amount_range_high ?? null,
      raw,
    },
    perf,
  };
}

async function loadSource(url) {
  console.log(`→ Baixando: ${url}`);
  try {
    const data = await fetchJSON(url);
    const records = Array.isArray(data) ? data : data.trades || data.transactions || data.data || [];
    console.log(`  ${records.length} registros brutos`);
    return records.map(mapRecord).filter(Boolean);
  } catch (e) {
    console.warn(`  ⚠️  ${e.message} — pulando esta fonte.`);
    return [];
  }
}

async function main() {
  const supabase = getServiceClient();

  const mapped = [];
  for (const url of TRADES_URLS) mapped.push(...(await loadSource(url)));

  if (mapped.length === 0) {
    console.error('❌ Nenhum registro válido obtido de nenhuma fonte.');
    process.exit(1);
  }

  // Dedup por id.
  const politicians = [...new Map(mapped.map((m) => [m.politician.id, m.politician])).values()];
  const trades = [...new Map(mapped.map((m) => [m.trade.id, m.trade])).values()];
  const perf = [...new Map(
    mapped.filter((m) => m.perf).map((m) => [m.perf.trade_id, m.perf])
  ).values()];

  // CDI (Banco Central) por trade: retorno acumulado da data da trade até hoje.
  try {
    const cdi = await fetchCDIIndex();
    const dateById = new Map(trades.map((t) => [t.id, t.transaction_date]));
    let n = 0;
    for (const row of perf) {
      const r = cdiReturnSince(cdi, dateById.get(row.trade_id));
      if (r != null) { row.cdi_return_pct = round2(r); n++; }
    }
    console.log(`→ CDI aplicado a ${n} performances (série BCB com ${cdi.length} pontos).`);
  } catch (e) {
    console.warn(`⚠️  CDI indisponível (${e.message}) — seguindo sem CDI.`);
  }

  const chamberOf = new Map(politicians.map((p) => [p.id, p.chamber]));
  const byChamber = trades.reduce((a, t) => ((a[chamberOf.get(t.politician_id)]++), a), { house: 0, senate: 0 });

  console.log(`\nUpserting ${politicians.length} políticos, ${trades.length} trades ` +
    `(house: ${byChamber.house}, senate: ${byChamber.senate}) e ${perf.length} performances...`);
  await upsertInChunks(supabase, 'politicians', politicians, 'id');
  await upsertInChunks(supabase, 'trades', trades, 'id');
  await upsertInChunks(supabase, 'trade_performance', perf, 'trade_id');
  console.log('✅ Ingestão concluída.');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
