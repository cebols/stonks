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
  fetchCommitteesByName, nameKey, mapPool, fetchYahooDailyCloses, closeOnOrBefore,
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

  // is_opening: marca a 1ª compra de cada (político, ticker) no dataset.
  const firstBuy = new Map();
  for (const t of trades) {
    if (t.tx_type !== 'purchase' || !t.ticker || !t.transaction_date) continue;
    const k = `${t.politician_id}|${t.ticker}`;
    const cur = firstBuy.get(k);
    if (!cur || t.transaction_date < cur) firstBuy.set(k, t.transaction_date);
  }
  for (const t of trades) {
    t.is_opening = t.tx_type === 'purchase' && !!t.ticker && !!t.transaction_date &&
      firstBuy.get(`${t.politician_id}|${t.ticker}`) === t.transaction_date;
  }

  // Comitês do Congresso por político (membros atuais).
  try {
    const byName = await fetchCommitteesByName();
    let n = 0;
    for (const p of politicians) {
      const cs = byName.get(nameKey(p.full_name));
      if (cs) { p.committees = cs; n++; }
    }
    console.log(`→ Comitês casados para ${n}/${politicians.length} políticos.`);
  } catch (e) {
    console.warn(`⚠️  Comitês indisponíveis (${e.message}) — seguindo sem comitês.`);
  }

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

  // Preços reais (Yahoo): preço na trade, resultado até hoje, e realizado (FIFO).
  let tradePrices = [];
  try {
    const stockTrades = trades.filter((t) =>
      t.ticker && t.transaction_date && (t.tx_type === 'purchase' || t.tx_type === 'sale'));
    const tickers = [...new Set(stockTrades.map((t) => t.ticker))];
    console.log(`→ Buscando cotações (Yahoo) de ${tickers.length} tickers...`);
    const seriesList = await mapPool(tickers, 8, (tk) => fetchYahooDailyCloses(tk));
    const seriesByTicker = new Map(tickers.map((tk, i) => [tk, seriesList[i]]));
    const nowByTicker = new Map(
      tickers.map((tk, i) => [tk, seriesList[i]?.length ? seriesList[i][seriesList[i].length - 1].close : null]),
    );

    const priceById = new Map();
    for (const t of stockTrades) {
      const series = seriesByTicker.get(t.ticker);
      if (!series || series.length === 0) continue;
      const entry = closeOnOrBefore(series, t.transaction_date);
      const now = nowByTicker.get(t.ticker);
      if (entry == null) continue;
      priceById.set(t.id, {
        trade_id: t.id, entry_price: round2(entry), price_now: round2(now),
        open_return_pct: t.tx_type === 'purchase' && now != null ? round2((now / entry - 1) * 100) : null,
        realized_return_pct: null, matched_buy_date: null,
        _ticker: t.ticker, _pol: t.politician_id, _date: t.transaction_date, _type: t.tx_type, _entry: entry,
      });
    }

    // FIFO por (político, ticker): casa cada venda com a compra mais antiga aberta.
    const groups = new Map();
    for (const r of priceById.values()) {
      const k = `${r._pol}|${r._ticker}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) => (a._date < b._date ? -1 : 1));
      const queue = [];
      for (const r of rows) {
        if (r._type === 'purchase') queue.push(r);
        else if (r._type === 'sale' && queue.length) {
          const buy = queue.shift();
          r.realized_return_pct = round2((r._entry / buy._entry - 1) * 100);
          r.matched_buy_date = buy._date;
        }
      }
    }
    tradePrices = [...priceById.values()].map(({ _ticker, _pol, _date, _type, _entry, ...row }) => row);
    console.log(`→ Preços calculados para ${tradePrices.length} trades.`);
  } catch (e) {
    console.warn(`⚠️  Cotações indisponíveis (${e.message}) — seguindo sem preços.`);
  }

  const chamberOf = new Map(politicians.map((p) => [p.id, p.chamber]));
  const byChamber = trades.reduce((a, t) => ((a[chamberOf.get(t.politician_id)]++), a), { house: 0, senate: 0 });

  console.log(`\nUpserting ${politicians.length} políticos, ${trades.length} trades ` +
    `(house: ${byChamber.house}, senate: ${byChamber.senate}) e ${perf.length} performances...`);
  await upsertInChunks(supabase, 'politicians', politicians, 'id');
  await upsertInChunks(supabase, 'trades', trades, 'id');
  await upsertInChunks(supabase, 'trade_performance', perf, 'trade_id');
  if (tradePrices.length) await upsertInChunks(supabase, 'trade_prices', tradePrices, 'trade_id');
  console.log('✅ Ingestão concluída.');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
