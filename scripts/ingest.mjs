// ============================================================================
// Ingestão das trades públicas (Câmara + Senado) para o Supabase.
//
// Fonte: kadoa-org/congress-trading-monitor — um único JSON combinado e já
// normalizado, derivado dos filings oficiais do STOCK Act (House Clerk +
// Senate EFD). URL configurável via TRADES_URL (aceita lista separada por
// vírgula, caso queira somar fontes).
//
// Rodar: npm run ingest
// ============================================================================
import {
  getServiceClient, slugify, normalizeTxType, normalizeTicker, toISODate,
  upsertInChunks, fetchJSON,
} from './lib.mjs';

const DEFAULT_URL =
  'https://raw.githubusercontent.com/kadoa-org/congress-trading-monitor/main/public/data/trades.json';
const TRADES_URLS = (process.env.TRADES_URL || DEFAULT_URL)
  .split(',').map((u) => u.trim()).filter(Boolean);

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim() || null;
}

// Mapeia um registro bruto -> { politician, trade }. Retorna null se inválido
// ou se não for Câmara/Senado (descarta executivo).
function mapRecord(raw) {
  const chamber = String(raw.chamber || '').toLowerCase();
  if (chamber !== 'house' && chamber !== 'senate') return null;

  const name = raw.filer_name || raw.name;
  if (!name) return null;
  const politicianId = raw.filer_id || slugify(name);

  return {
    politician: {
      id: politicianId,
      full_name: name,
      chamber,
      party: raw.party || null,
      state: raw.state || null,
    },
    trade: {
      // a fonte já fornece um id único por transação; cai para hash se faltar.
      id: raw.id || `${politicianId}:${raw.transaction_date}:${raw.ticker}:${raw.row_index ?? ''}`,
      politician_id: politicianId,
      transaction_date: toISODate(raw.transaction_date),
      disclosure_date: toISODate(raw.filing_date || raw.disclosure_date),
      ticker: normalizeTicker(raw.ticker),
      asset_description: cleanText(raw.asset_name || raw.asset_description),
      asset_type: (raw.asset_type || '').toString().toLowerCase() || null,
      tx_type: normalizeTxType(raw.transaction_type || raw.type),
      owner: (raw.owner || 'self').toString().toLowerCase(),
      amount_min: raw.amount_range_low ?? null,
      amount_max: raw.amount_range_high ?? null,
      raw,
    },
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
    // Uma fonte com problema não deve derrubar a ingestão inteira.
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

  const chamberOf = new Map(politicians.map((p) => [p.id, p.chamber]));
  const byChamber = trades.reduce((a, t) => ((a[chamberOf.get(t.politician_id)]++), a), { house: 0, senate: 0 });
  console.log(`\nUpserting ${politicians.length} políticos e ${trades.length} trades (house: ${byChamber.house}, senate: ${byChamber.senate})...`);
  await upsertInChunks(supabase, 'politicians', politicians, 'id');
  await upsertInChunks(supabase, 'trades', trades, 'id');
  console.log('✅ Ingestão concluída.');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
