import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type PerfEmbed = { return_pct: number | null; benchmark_return_pct: number | null; cdi_return_pct: number | null };
type Row = {
  politician_id: string; transaction_date: string | null; tx_type: string | null;
  amount_min: number | null; amount_max: number | null;
  perf: PerfEmbed | PerfEmbed[] | null;
};

const mid = (a: number | null, b: number | null) => ((a ?? 0) + (b ?? a ?? 0)) / 2;

// Série cumulativa (média ponderada por valor) por mês a partir de uma lista de
// trades de compra. fn extrai o valor (retorno / benchmark / cdi) de cada trade.
function cumulativeByMonth(rows: Row[], fn: (p: PerfEmbed) => number | null): Map<string, number> {
  const sorted = rows
    .filter((r) => r.transaction_date)
    .sort((a, b) => (a.transaction_date! < b.transaction_date! ? -1 : 1));
  let w = 0, wv = 0;
  const out = new Map<string, number>();
  for (const r of sorted) {
    const p = Array.isArray(r.perf) ? r.perf[0] : r.perf;
    const v = p ? fn(p) : null;
    if (v == null) continue;
    const weight = Math.max(mid(r.amount_min, r.amount_max), 1);
    w += weight; wv += weight * v;
    out.set(r.transaction_date!.slice(0, 7), +(wv / w).toFixed(1));
  }
  return out;
}

export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (ids.length === 0) return NextResponse.json({ data: [], series: [] });

  const { data, error } = await getSupabase()
    .from('trades')
    .select('politician_id, transaction_date, tx_type, amount_min, amount_max, perf:trade_performance(return_pct, benchmark_return_pct, cdi_return_pct)')
    .in('politician_id', ids)
    .eq('tx_type', 'purchase')
    .limit(3000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Row[];

  // uma série por político (retorno da carteira) + S&P e CDI sobre a união.
  const perPol = new Map<string, Map<string, number>>();
  for (const id of ids) {
    perPol.set(id, cumulativeByMonth(rows.filter((r) => r.politician_id === id), (p) => p.return_pct));
  }
  const sp = cumulativeByMonth(rows, (p) => p.benchmark_return_pct);
  const cdi = cumulativeByMonth(rows, (p) => p.cdi_return_pct);

  // todos os meses, ordenados; forward-fill para linhas contínuas.
  const months = [...new Set([
    ...ids.flatMap((id) => [...perPol.get(id)!.keys()]),
    ...sp.keys(), ...cdi.keys(),
  ])].sort();

  const last: Record<string, number | null> = {};
  const data2 = months.map((month) => {
    const row: Record<string, string | number | null> = { month };
    for (const id of ids) {
      if (perPol.get(id)!.has(month)) last[id] = perPol.get(id)!.get(month)!;
      row[id] = last[id] ?? null;
    }
    if (sp.has(month)) last.sp = sp.get(month)!;
    if (cdi.has(month)) last.cdi = cdi.get(month)!;
    row.sp = last.sp ?? null;
    row.cdi = last.cdi ?? null;
    return row;
  });

  return NextResponse.json({ data: data2, ids });
}
