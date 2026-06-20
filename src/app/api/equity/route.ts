import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { cutoffISO, Range } from '@/lib/range';
import { assetClass, AssetClass } from '@/lib/assetClass';

export const dynamic = 'force-dynamic';

// Curva de EQUITY REAL: $1 investido em cada compra (na data, ao fechamento do
// mês) e mantido (buy-and-hold), evoluindo por preços mensais reais. As três
// linhas — carteira, S&P (SPY) e CDI — usam os MESMOS aportes e pesos, então
// medem o mesmo capital sob três alocações. Cada ponto é o retorno acumulado
// (média ponderada por valor) até aquele mês, usando o preço daquele mês.

type Buy = {
  ticker: string;
  asset_type: string | null;
  transaction_date: string;
  amount_min: number | null;
  amount_max: number | null;
};

const mid = (a: number | null, b: number | null) => Math.max(((a ?? 0) + (b ?? a ?? 0)) / 2, 1);

// Enumera meses 'YYYY-MM' de a até b (inclusive).
function monthsBetween(a: string, b: string): string[] {
  const out: string[] = [];
  let [y, m] = a.split('-').map(Number);
  const [ey, em] = b.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// Busca todas as linhas de uma query paginando (Supabase limita ~1000/req).
async function fetchAllPrices(tickers: string[]) {
  const sb = getSupabase();
  const out: { ticker: string; date: string; close: number }[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', tickers)
      .order('date')
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { ticker: string; date: string; close: number }[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  const ticker = params.get('ticker');
  const cat = (params.get('cat') as AssetClass | 'all') ?? 'stock';
  const cutoff = cutoffISO((params.get('range') as Range) ?? 'all');
  if (!id && !ticker) return NextResponse.json({ data: [] });

  const sb = getSupabase();

  // 1. Compras no escopo (político ou ticker).
  let q = sb
    .from('trades')
    .select('ticker, asset_type, transaction_date, amount_min, amount_max')
    .eq('tx_type', 'purchase')
    .not('ticker', 'is', null)
    .not('transaction_date', 'is', null);
  if (id) q = q.eq('politician_id', id);
  if (ticker) q = q.eq('ticker', ticker);
  if (cutoff) q = q.gte('transaction_date', cutoff);
  const { data: rawBuys, error: be } = await q.limit(5000);
  if (be) return NextResponse.json({ error: be.message }, { status: 500 });

  let buys = (rawBuys ?? []) as Buy[];
  if (id && cat !== 'all') buys = buys.filter((b) => assetClass(b.asset_type, b.ticker) === cat);
  if (buys.length === 0) return NextResponse.json({ data: [] });

  const tickers = [...new Set(buys.map((b) => b.ticker))];

  // 2. Séries mensais (tabela prices): tickers da carteira + SPY + CDI.
  let priceRows: { ticker: string; date: string; close: number }[];
  try {
    priceRows = await fetchAllPrices([...tickers, 'SPY', '__CDI__']);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const byTicker = new Map<string, Map<string, number>>();
  for (const r of priceRows) {
    const m = r.date.slice(0, 7);
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, new Map());
    byTicker.get(r.ticker)!.set(m, Number(r.close));
  }
  const sortedMonths = new Map<string, string[]>();
  for (const [tk, m] of byTicker) sortedMonths.set(tk, [...m.keys()].sort());

  // Preço de tk no mês `month` (ou no último mês disponível antes dele).
  const priceAt = (tk: string, month: string): number | null => {
    const m = byTicker.get(tk);
    if (!m) return null;
    if (m.has(month)) return m.get(month)!;
    const months = sortedMonths.get(tk)!;
    let lo = 0, hi = months.length - 1, ans = -1;
    while (lo <= hi) {
      const k = (lo + hi) >> 1;
      if (months[k] <= month) { ans = k; lo = k + 1; } else hi = k - 1;
    }
    return ans >= 0 ? m.get(months[ans])! : null;
  };

  // 3. Aportes válidos: precisa ter preço do ticker, do SPY e do CDI na compra.
  type Lot = { tk: string; month: string; w: number; eT: number; eS: number; eC: number };
  const lots: Lot[] = [];
  for (const b of buys) {
    const month = b.transaction_date.slice(0, 7);
    const eT = priceAt(b.ticker, month);
    const eS = priceAt('SPY', month);
    const eC = priceAt('__CDI__', month);
    if (eT == null || eS == null || eC == null) continue;
    lots.push({ tk: b.ticker, month, w: mid(b.amount_min, b.amount_max), eT, eS, eC });
  }
  if (lots.length === 0) return NextResponse.json({ data: [] });

  // 4. Linha do tempo: do primeiro aporte ao último mês com preço (SPY).
  lots.sort((a, b) => (a.month < b.month ? -1 : 1));
  const spyMonths = sortedMonths.get('SPY') ?? [];
  const endMonth = spyMonths.length ? spyMonths[spyMonths.length - 1] : lots[lots.length - 1].month;
  const timeline = monthsBetween(lots[0].month, endMonth);

  const data = timeline.map((t) => {
    let den = 0, num = 0, sp = 0, cdi = 0;
    for (const lot of lots) {
      if (lot.month > t) continue;
      const pT = priceAt(lot.tk, t);
      const pS = priceAt('SPY', t);
      const pC = priceAt('__CDI__', t);
      if (pT == null || pS == null || pC == null) continue;
      den += lot.w;
      num += lot.w * (pT / lot.eT);
      sp += lot.w * (pS / lot.eS);
      cdi += lot.w * (pC / lot.eC);
    }
    if (den === 0) return { month: t, port: null, sp: null, cdi: null };
    return {
      month: t,
      port: +((num / den - 1) * 100).toFixed(1),
      sp: +((sp / den - 1) * 100).toFixed(1),
      cdi: +((cdi / den - 1) * 100).toFixed(1),
    };
  }).filter((r) => r.port != null);

  return NextResponse.json({ data });
}
