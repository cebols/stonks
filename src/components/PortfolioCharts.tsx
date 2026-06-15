'use client';
import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import type { Trade } from '@/lib/supabase';
import { assetClass, amountMid, AssetClass, CATEGORY_LABELS } from '@/lib/assetClass';
import { Range, withinRange } from '@/lib/range';
import { Segmented, RangeSelect } from './controls';

const GREEN = '#3fb950';
const RED = '#f85149';
const BLUE = '#58a6ff';
const PIE_COLORS = [BLUE, '#a371f7', '#f0883e'];

function money(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function PortfolioCharts({ trades }: { trades: Trade[] }) {
  const [cat, setCat] = useState<AssetClass | 'all'>('stock');
  const [range, setRange] = useState<Range>('all');

  const ranged = useMemo(
    () => trades.filter((t) => withinRange(t.transaction_date, range)),
    [trades, range],
  );
  const scoped = useMemo(
    () => ranged.filter((t) => cat === 'all' || assetClass(t.asset_type, t.ticker) === cat),
    [ranged, cat],
  );

  // Top tickers por volume estimado (compra + venda).
  const topTickers = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of scoped) {
      if (!t.ticker) continue;
      m.set(t.ticker, (m.get(t.ticker) ?? 0) + amountMid(t.amount_min, t.amount_max));
    }
    return [...m.entries()]
      .map(([ticker, vol]) => ({ ticker, vol }))
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 10);
  }, [scoped]);

  // Compra vs venda por mês.
  const byMonth = useMemo(() => {
    const m = new Map<string, { month: string; buy: number; sell: number }>();
    for (const t of scoped) {
      if (!t.transaction_date) continue;
      const month = t.transaction_date.slice(0, 7);
      const row = m.get(month) ?? { month, buy: 0, sell: 0 };
      const v = amountMid(t.amount_min, t.amount_max);
      if (t.tx_type === 'sale') row.sell += v; else row.buy += v;
      m.set(month, row);
    }
    return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [scoped]);

  // Distribuição por categoria (todas as trades, ignora o filtro).
  const byCategory = useMemo(() => {
    const m = new Map<AssetClass, number>();
    for (const t of ranged) {
      const c = assetClass(t.asset_type, t.ticker);
      m.set(c, (m.get(c) ?? 0) + amountMid(t.amount_min, t.amount_max));
    }
    return [...m.entries()].map(([k, v]) => ({ name: CATEGORY_LABELS[k], value: Math.round(v) }));
  }, [ranged]);

  const axis = { fontSize: 11, fill: '#8b95a7' };
  const tooltipStyle = { background: '#131825', border: '1px solid #232a3b', borderRadius: 8, fontSize: 12 };

  return (
    <>
      <div className="toolbar">
        <Segmented
          value={cat}
          onChange={setCat}
          options={[
            { value: 'stock', label: 'Ações' },
            { value: 'fund', label: 'Fundos' },
            { value: 'other', label: 'Outros' },
            { value: 'all', label: 'Todos' },
          ]}
        />
        <RangeSelect value={range} onChange={setRange} />
      </div>

      <div className="grid2">
        <div className="chartbox">
          <h3>Top posições por volume estimado</h3>
          {topTickers.length === 0 ? <p className="muted">Sem dados nesta categoria.</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topTickers} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={axis} tickFormatter={money} />
                <YAxis type="category" dataKey="ticker" tick={axis} width={56} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
                <Bar dataKey="vol" fill={BLUE} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chartbox">
          <h3>Composição por categoria (volume)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={90} label>
                {byCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chartbox">
        <h3>Compras vs vendas por mês (volume estimado)</h3>
        {byMonth.length === 0 ? <p className="muted">Sem dados nesta categoria.</p> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byMonth} margin={{ left: 8, right: 16 }}>
              <XAxis dataKey="month" tick={axis} />
              <YAxis tick={axis} tickFormatter={money} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="buy" name="Compras" fill={GREEN} radius={[3, 3, 0, 0]} />
              <Bar dataKey="sell" name="Vendas" fill={RED} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
}
