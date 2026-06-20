import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { cutoffISO, Range } from '@/lib/range';
import { Buy, Lot, loadPrices, toLots, aggregateAt, endMonth, monthsBetween } from '@/lib/equity';

export const dynamic = 'force-dynamic';

// Curva de EQUITY REAL para vários políticos: uma linha (growth of $1,
// buy-and-hold sobre preços mensais reais) por político, mais S&P (SPY) e CDI
// calculados sobre a UNIÃO de todos os aportes. Mesma base da rota /api/equity.

type Row = Buy & { politician_id: string };

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const ids = (params.get('ids') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (ids.length === 0) return NextResponse.json({ data: [], ids: [] });
  const cutoff = cutoffISO((params.get('range') as Range) ?? 'all');

  const sb = getSupabase();
  let q = sb
    .from('trades')
    .select('politician_id, ticker, transaction_date, amount_min, amount_max')
    .in('politician_id', ids)
    .eq('tx_type', 'purchase')
    .not('ticker', 'is', null)
    .not('transaction_date', 'is', null)
    .limit(5000);
  if (cutoff) q = q.gte('transaction_date', cutoff);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const buys = (data ?? []) as Row[];
  if (buys.length === 0) return NextResponse.json({ data: [], ids });

  const tickers = [...new Set(buys.map((b) => b.ticker))];
  let prices;
  try {
    prices = await loadPrices(sb, tickers);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Lotes por político + lotes da união (para SP/CDI e linha do tempo).
  const lotsByPol = new Map<string, Lot[]>();
  const allLots: Lot[] = [];
  for (const id of ids) {
    const lots = toLots(buys.filter((b) => b.politician_id === id), prices.priceAt);
    lotsByPol.set(id, lots);
    allLots.push(...lots);
  }
  if (allLots.length === 0) return NextResponse.json({ data: [], ids });

  allLots.sort((a, b) => (a.month < b.month ? -1 : 1));
  const timeline = monthsBetween(allLots[0].month, endMonth(prices.spyMonths, allLots));

  const data2 = timeline.map((month) => {
    const row: Record<string, string | number | null> = { month };
    for (const id of ids) {
      const agg = aggregateAt(lotsByPol.get(id)!, prices!.priceAt, month);
      row[id] = agg ? agg.port : null;
    }
    const union = aggregateAt(allLots, prices.priceAt, month);
    row.sp = union ? union.sp : null;
    row.cdi = union ? union.cdi : null;
    return row;
  });

  return NextResponse.json({ data: data2, ids });
}
