'use client';
import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { assetClass, amountMid, AssetClass } from '@/lib/assetClass';
import { Range, withinRange } from '@/lib/range';
import { Segmented, RangeSelect } from './controls';

export type PerfTrade = {
  ticker: string | null;
  asset_type: string | null;
  tx_type: string | null;
  transaction_date: string | null;
  amount_min: number | null;
  amount_max: number | null;
  return_pct: number | null;
  benchmark_return_pct: number | null;
  cdi_return_pct: number | null;
};

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

// Curve: volume-weighted cumulative return of PURCHASES opened up to each
// month, measured to today — vs benchmark (S&P) and the Brazilian CDI.
export default function PerformanceCurve({
  trades, showCategoryFilter = true,
}: { trades: PerfTrade[]; showCategoryFilter?: boolean }) {
  const [cat, setCat] = useState<AssetClass | 'all'>('stock');
  const [range, setRange] = useState<Range>('all');

  const data = useMemo(() => {
    const buys = trades
      .filter((t) =>
        t.tx_type === 'purchase' &&
        t.transaction_date &&
        t.return_pct != null &&
        withinRange(t.transaction_date, range) &&
        (!showCategoryFilter || cat === 'all' || assetClass(t.asset_type, t.ticker) === cat))
      .sort((a, b) => (a.transaction_date! < b.transaction_date! ? -1 : 1));

    let w = 0, wRet = 0, wBench = 0, wCdi = 0, wCdiW = 0;
    const atMonth = new Map<string, { port: number; bench: number | null; cdi: number | null }>();
    for (const t of buys) {
      const weight = Math.max(amountMid(t.amount_min, t.amount_max), 1);
      w += weight;
      wRet += weight * (t.return_pct ?? 0);
      if (t.benchmark_return_pct != null) wBench += weight * t.benchmark_return_pct;
      if (t.cdi_return_pct != null) { wCdi += weight * t.cdi_return_pct; wCdiW += weight; }
      atMonth.set(t.transaction_date!.slice(0, 7), {
        port: +(wRet / w).toFixed(1),
        bench: +(wBench / w).toFixed(1),
        cdi: wCdiW > 0 ? +(wCdi / wCdiW).toFixed(1) : null,
      });
    }
    if (atMonth.size === 0) return [];

    // Forward-fill: um ponto por mês entre o primeiro e o último (curva contínua).
    const keys = [...atMonth.keys()].sort();
    let last = { port: 0, bench: 0 as number | null, cdi: null as number | null };
    return monthsBetween(keys[0], keys[keys.length - 1]).map((month) => {
      if (atMonth.has(month)) last = atMonth.get(month)!;
      return { month, ...last };
    });
  }, [trades, cat, range, showCategoryFilter]);

  const axis = { fontSize: 11, fill: '#8b95a7' };
  const tooltipStyle = { background: '#131825', border: '1px solid #232a3b', borderRadius: 8, fontSize: 12 };

  return (
    <div className="chartbox">
      <h3>Cumulative return of purchases (to date) vs benchmark vs CDI</h3>
      <div className="toolbar" style={{ margin: '0 0 8px' }}>
        {showCategoryFilter && (
          <Segmented
            value={cat} onChange={setCat}
            options={[
              { value: 'stock', label: 'Stocks' },
              { value: 'fund', label: 'Funds' },
              { value: 'all', label: 'All' },
            ]}
          />
        )}
        <RangeSelect value={range} onChange={setRange} />
      </div>
      {data.length < 2 ? (
        <p className="muted">Not enough data for the curve in this category.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#1c2230" vertical={false} />
            <XAxis dataKey="month" tick={axis} minTickGap={20} />
            <YAxis tick={axis} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="port" name="Portfolio" stroke="#58a6ff" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="bench" name="S&P (benchmark)" stroke="#8b95a7" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="cdi" name="CDI (Brazil)" stroke="#f0883e" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        Each point = volume-weighted average return of purchases made up to that month, measured to
        today. It is not a daily price curve (public data has no prices) — it shows how the aggregate
        result of the positions evolves.
      </p>
    </div>
  );
}
