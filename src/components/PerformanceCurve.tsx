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

// Curva: retorno médio acumulado (ponderado por volume) das COMPRAS abertas até
// cada mês, medido até hoje — comparado ao benchmark (S&P) e ao CDI (Brasil).
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
    const byMonth = new Map<string, { month: string; port: number; bench: number | null; cdi: number | null }>();
    for (const t of buys) {
      const weight = Math.max(amountMid(t.amount_min, t.amount_max), 1);
      w += weight;
      wRet += weight * (t.return_pct ?? 0);
      if (t.benchmark_return_pct != null) wBench += weight * t.benchmark_return_pct;
      if (t.cdi_return_pct != null) { wCdi += weight * t.cdi_return_pct; wCdiW += weight; }
      const month = t.transaction_date!.slice(0, 7);
      byMonth.set(month, {
        month,
        port: +(wRet / w).toFixed(1),
        bench: +(wBench / w).toFixed(1),
        cdi: wCdiW > 0 ? +(wCdi / wCdiW).toFixed(1) : null,
      });
    }
    return [...byMonth.values()];
  }, [trades, cat, range, showCategoryFilter]);

  const axis = { fontSize: 11, fill: '#8b95a7' };
  const tooltipStyle = { background: '#131825', border: '1px solid #232a3b', borderRadius: 8, fontSize: 12 };

  return (
    <div className="chartbox">
      <h3>Retorno acumulado das compras (medido até hoje) vs benchmark vs CDI</h3>
      <div className="toolbar" style={{ margin: '0 0 8px' }}>
        {showCategoryFilter && (
          <Segmented
            value={cat} onChange={setCat}
            options={[
              { value: 'stock', label: 'Ações' },
              { value: 'fund', label: 'Fundos' },
              { value: 'all', label: 'Todos' },
            ]}
          />
        )}
        <RangeSelect value={range} onChange={setRange} />
      </div>
      {data.length < 2 ? (
        <p className="muted">Dados insuficientes para a curva nesta categoria.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#1c2230" vertical={false} />
            <XAxis dataKey="month" tick={axis} minTickGap={28} />
            <YAxis tick={axis} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="port" name="Carteira" stroke="#58a6ff" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="bench" name="S&P (benchmark)" stroke="#8b95a7" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="cdi" name="CDI (Brasil)" stroke="#f0883e" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        Cada ponto = retorno médio (ponderado por valor) das compras feitas até aquele mês, medido
        até hoje. Não é uma curva de cotação diária (dado público não tem preços), e sim a evolução
        do resultado agregado das posições.
      </p>
    </div>
  );
}
