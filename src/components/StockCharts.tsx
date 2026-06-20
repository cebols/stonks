'use client';
import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { amountMid } from '@/lib/assetClass';
import { Range, withinRange } from '@/lib/range';
import { fmtMonth } from '@/lib/format';
import { RangeSelect } from './controls';

const GREEN = '#3fb950';
const RED = '#f85149';
const BLUE = '#58a6ff';

function money(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export type StockTrade = {
  tx_type: string | null;
  amount_min: number | null;
  amount_max: number | null;
  transaction_date: string | null;
  politician_name: string;
};

export default function StockCharts({ trades }: { trades: StockTrade[] }) {
  const [range, setRange] = useState<Range>('all');
  const ranged = useMemo(
    () => trades.filter((t) => withinRange(t.transaction_date, range)),
    [trades, range],
  );

  const topPols = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of ranged) {
      m.set(t.politician_name, (m.get(t.politician_name) ?? 0) + amountMid(t.amount_min, t.amount_max));
    }
    return [...m.entries()].map(([name, vol]) => ({ name, vol }))
      .sort((a, b) => b.vol - a.vol).slice(0, 10);
  }, [ranged]);

  const byMonth = useMemo(() => {
    const m = new Map<string, { month: string; buy: number; sell: number }>();
    for (const t of ranged) {
      if (!t.transaction_date) continue;
      const month = t.transaction_date.slice(0, 7);
      const row = m.get(month) ?? { month, buy: 0, sell: 0 };
      const v = amountMid(t.amount_min, t.amount_max);
      if (t.tx_type === 'sale') row.sell += v; else row.buy += v;
      m.set(month, row);
    }
    return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [ranged]);

  const axis = { fontSize: 11, fill: '#8b95a7' };
  const tooltipStyle = { background: '#131825', border: '1px solid #232a3b', borderRadius: 8, fontSize: 12 };

  return (
    <>
    <div className="toolbar"><RangeSelect value={range} onChange={setRange} /></div>
    <div className="grid2">
      <div className="chartbox">
        <h3>Largest positions by politician (estimated volume)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={topPols} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" tick={axis} tickFormatter={money} />
            <YAxis type="category" dataKey="name" tick={axis} width={120} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
            <Bar dataKey="vol" radius={[0, 4, 4, 0]}>
              {topPols.map((_, i) => <Cell key={i} fill={BLUE} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chartbox">
        <h3>Buys vs sells by month</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byMonth} margin={{ left: 8, right: 16 }}>
            <XAxis dataKey="month" tick={axis} tickFormatter={fmtMonth} />
            <YAxis tick={axis} tickFormatter={money} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="buy" name="Buys" fill={GREEN} radius={[3, 3, 0, 0]} />
            <Bar dataKey="sell" name="Sells" fill={RED} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    </>
  );
}
