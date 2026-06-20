import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { cutoffISO, Range } from '@/lib/range';
import { assetClass, AssetClass } from '@/lib/assetClass';
import { Buy, loadPrices, toLots, aggregateAt, endMonth, monthsBetween } from '@/lib/equity';

export const dynamic = 'force-dynamic';

// Curva de EQUITY REAL de um escopo único (1 político ou 1 ticker): $1 investido
// em cada compra (no fechamento do mês) e mantido, evoluindo por preços mensais
// reais. As três linhas — carteira, S&P (SPY) e CDI — usam os mesmos aportes.

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  const ticker = params.get('ticker');
  const cat = (params.get('cat') as AssetClass | 'all') ?? 'stock';
  const cutoff = cutoffISO((params.get('range') as Range) ?? 'all');
  if (!id && !ticker) return NextResponse.json({ data: [] });

  const sb = getSupabase();

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

  let buys = (rawBuys ?? []) as (Buy & { asset_type: string | null })[];
  if (id && cat !== 'all') buys = buys.filter((b) => assetClass(b.asset_type, b.ticker) === cat);
  if (buys.length === 0) return NextResponse.json({ data: [] });

  const tickers = [...new Set(buys.map((b) => b.ticker))];
  let prices;
  try {
    prices = await loadPrices(sb, tickers);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const lots = toLots(buys, prices.priceAt);
  if (lots.length === 0) return NextResponse.json({ data: [] });

  lots.sort((a, b) => (a.month < b.month ? -1 : 1));
  const timeline = monthsBetween(lots[0].month, endMonth(prices.spyMonths, lots));
  const data = timeline
    .map((month) => {
      const agg = aggregateAt(lots, prices!.priceAt, month);
      return agg ? { month, ...agg } : null;
    })
    .filter((r): r is { month: string; port: number; sp: number; cdi: number } => r != null);

  return NextResponse.json({ data });
}
