'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { AssetClass } from '@/lib/assetClass';
import { Range } from '@/lib/range';
import { fmtMonth } from '@/lib/format';
import { Segmented, RangeSelect } from './controls';

type Point = { month: string; port: number; sp: number; cdi: number };

// Curva de EQUITY REAL: $1 investido em cada compra (na data) e mantido
// (buy-and-hold), evoluindo por preços mensais reais — vs investir os mesmos
// aportes no S&P (SPY) e no CDI. Calculada no servidor em /api/equity a partir
// da tabela `prices` (séries mensais por ticker + SPY + CDI).
export default function PerformanceCurve({
  politicianId, ticker, showCategoryFilter = true,
}: { politicianId?: string; ticker?: string; showCategoryFilter?: boolean }) {
  const [cat, setCat] = useState<AssetClass | 'all'>('stock');
  const [range, setRange] = useState<Range>('all');
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = new URLSearchParams({ range });
    if (politicianId) { p.set('id', politicianId); if (showCategoryFilter) p.set('cat', cat); }
    if (ticker) p.set('ticker', ticker);
    setLoading(true);
    let alive = true;
    fetch(`/api/equity?${p}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setData(j.data ?? []); })
      .catch(() => { if (alive) setData([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [politicianId, ticker, cat, range, showCategoryFilter]);

  const axis = { fontSize: 11, fill: '#8b95a7' };
  const tooltipStyle = { background: '#131825', border: '1px solid #232a3b', borderRadius: 8, fontSize: 12 };

  return (
    <div className="chartbox">
      <h3>Growth of $1 invested vs S&amp;P vs CDI (buy-and-hold, real prices)</h3>
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
      {loading ? (
        <p className="muted">Loading…</p>
      ) : data.length < 2 ? (
        <p className="muted">Not enough price history for the curve in this category.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#1c2230" vertical={false} />
            <XAxis dataKey="month" tick={axis} minTickGap={20} tickFormatter={fmtMonth} />
            <YAxis tick={axis} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="port" name="Portfolio" stroke="#58a6ff" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sp" name="S&P (benchmark)" stroke="#8b95a7" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="cdi" name="CDI (Brazil)" stroke="#f0883e" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        Each purchase invests its midpoint amount at that month&apos;s real closing price and is held
        to today. The three lines apply the <em>same</em> contributions to the actual picks, to the
        S&amp;P (SPY) and to the Brazilian CDI — so they grow over calendar time on real prices.
      </p>
    </div>
  );
}
