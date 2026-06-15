// ============================================================================
// Ingestão das trades públicas (Câmara + Senado) para o Supabase.
//
// Fontes: JSONs públicos já normalizados (STOCK Act / PTRs). As URLs vêm do
// .env (SENATE_TRADES_URL / HOUSE_TRADES_URL). Os formatos dos dois repos
// diferem um pouco, então cada um tem seu mapper abaixo.
//
// Rodar: npm run ingest
// ============================================================================
import {
  getServiceClient, slugify, tradeId, parseAmountRange, normalizeTxType,
  normalizeTicker, toISODate, upsertInChunks, fetchJSON,
} from './lib.mjs';

const SENATE_URL = process.env.SENATE_TRADES_URL;
const HOUSE_URL = process.env.HOUSE_TRADES_URL;

// Mapeia um registro bruto -> { politician, trade }. Retorna null se inválido.
function mapRecord(raw, chamber) {
  // Os repos usam nomes de campo ligeiramente diferentes; cobrimos os comuns.
  const name =
    raw.senator || raw.representative || raw.member || raw.name ||
    [raw.first_name, raw.last_name].filter(Boolean).join(' ');
  if (!name) return null;

  const politicianId = slugify(name);
  const txDate = toISODate(raw.transaction_date || raw.transactionDate);
  const discDate = toISODate(
    raw.disclosure_date || raw.disclosureDate || raw.date_received || raw.report_date
  );
  const ticker = normalizeTicker(raw.ticker);
  const { min, max } = parseAmountRange(raw.amount || raw.amount_range);
  const txType = normalizeTxType(raw.type || raw.transaction_type);
  const owner = (raw.owner || 'self').toString().toLowerCase();

  const id = tradeId([
    politicianId, txDate || '', ticker || raw.asset_description || '', txType || '',
    raw.amount || '', owner,
  ]);

  return {
    politician: {
      id: politicianId,
      full_name: name,
      chamber,
      party: raw.party || null,
      state: raw.state || null,
    },
    trade: {
      id,
      politician_id: politicianId,
      transaction_date: txDate,
      disclosure_date: discDate,
      ticker,
      asset_description: raw.asset_description || raw.description || null,
      asset_type: (raw.asset_type || 'stock').toString().toLowerCase(),
      tx_type: txType,
      owner,
      amount_min: min,
      amount_max: max,
      raw,
    },
  };
}

async function loadSource(url, chamber) {
  if (!url) {
    console.warn(`⚠️  URL da ${chamber} não configurada — pulando.`);
    return [];
  }
  console.log(`→ Baixando ${chamber}: ${url}`);
  const data = await fetchJSON(url);
  const records = Array.isArray(data) ? data : data.transactions || data.data || [];
  console.log(`  ${records.length} registros brutos`);
  return records.map((r) => mapRecord(r, chamber)).filter(Boolean);
}

async function main() {
  const supabase = getServiceClient();

  const mapped = [
    ...(await loadSource(SENATE_URL, 'senate')),
    ...(await loadSource(HOUSE_URL, 'house')),
  ];

  // Dedup de políticos por id.
  const politicians = [...new Map(mapped.map((m) => [m.politician.id, m.politician])).values()];
  // Dedup de trades por id.
  const trades = [...new Map(mapped.map((m) => [m.trade.id, m.trade])).values()];

  console.log(`\nUpserting ${politicians.length} políticos e ${trades.length} trades...`);
  await upsertInChunks(supabase, 'politicians', politicians, 'id');
  await upsertInChunks(supabase, 'trades', trades, 'id');
  console.log('✅ Ingestão concluída.');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
