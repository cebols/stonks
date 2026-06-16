'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { assetClass, amountMid } from '@/lib/assetClass';
import { fmtMoney, fmtPct, pctClass } from '@/lib/format';
import { Segmented } from './controls';

export type SignalBuy = {
  ticker: string;
  politician_id: string;
  asset_type: string | null;
  transaction_date: string | null;
  amount_min: number | null;
  amount_max: number | null;
  politician: { full_name: string } | null;
};
export type SignalSummary = { id: string; full_name: string; avg_alpha: number | null; scored_trades: number };

const WINDOWS = [
  { value: '7', label: '7d' }, { value: '15', label: '15d' },
  { value: '30', label: '30d' }, { value: '90', label: '90d' },
];

export default function Signals({ buys, summaries }: { buys: SignalBuy[]; summaries: SignalSummary[] }) {
  const [win, setWin] = useState('30');
  const [minBuyers, setMinBuyers] = useState('3');

  // Limite de "alto alpha" = 75º percentil entre políticos com ≥10 pontuadas.
  const { alphaOf, smartIds, smartCut } = useMemo(() => {
    const alphaOf = new Map(summaries.map((s) => [s.id, s.avg_alpha]));
    const pool = summaries.filter((s) => s.scored_trades >= 10 && s.avg_alpha != null)
      .map((s) => s.avg_alpha as number).sort((a, b) => a - b);
    const smartCut = pool.length ? pool[Math.floor(pool.length * 0.75)] : 0;
    const smartIds = new Set(
      summaries.filter((s) => s.scored_trades >= 10 && (s.avg_alpha ?? -1e9) >= smartCut).map((s) => s.id),
    );
    return { alphaOf, smartIds, smartCut };
  }, [summaries]);

  const scoped = useMemo(() => {
    const cutoff = new Date(Date.now() - Number(win) * 864e5).toISOString().slice(0, 10);
    return buys.filter((b) =>
      b.transaction_date && b.transaction_date >= cutoff &&
      assetClass(b.asset_type, b.ticker) === 'stock');
  }, [buys, win]);

  // Cluster buys: tickers com mais políticos distintos comprando na janela.
  const clusters = useMemo(() => {
    const m = new Map<string, { buyers: Set<string>; vol: number; names: Set<string> }>();
    for (const b of scoped) {
      const e = m.get(b.ticker) ?? { buyers: new Set(), vol: 0, names: new Set() };
      e.buyers.add(b.politician_id);
      e.vol += amountMid(b.amount_min, b.amount_max);
      if (b.politician?.full_name) e.names.add(b.politician.full_name);
      m.set(b.ticker, e);
    }
    return [...m.entries()]
      .map(([ticker, e]) => ({ ticker, buyers: e.buyers.size, vol: e.vol, names: [...e.names] }))
      .filter((x) => x.buyers >= Number(minBuyers))
      .sort((a, b) => b.buyers - a.buyers).slice(0, 20);
  }, [scoped, minBuyers]);

  // Smart money: compras na janela por políticos de alto alpha.
  const smart = useMemo(() => {
    const m = new Map<string, { buyers: Set<string>; vol: number; names: string[] }>();
    for (const b of scoped) {
      if (!smartIds.has(b.politician_id)) continue;
      const e = m.get(b.ticker) ?? { buyers: new Set(), vol: 0, names: [] };
      if (!e.buyers.has(b.politician_id) && b.politician?.full_name) e.names.push(b.politician.full_name);
      e.buyers.add(b.politician_id);
      e.vol += amountMid(b.amount_min, b.amount_max);
      m.set(b.ticker, e);
    }
    return [...m.entries()]
      .map(([ticker, e]) => ({ ticker, buyers: e.buyers.size, vol: e.vol, names: e.names }))
      .sort((a, b) => b.buyers - a.buyers || b.vol - a.vol).slice(0, 20);
  }, [scoped, smartIds]);

  return (
    <>
      <div className="toolbar">
        <label>Janela <Segmented value={win} onChange={setWin} options={WINDOWS} /></label>
        <label>Mín. políticos
          <select value={minBuyers} onChange={(e) => setMinBuyers(e.target.value)}>
            {['2', '3', '5', '8'].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </label>
        <span className="count">{scoped.length} compras na janela</span>
      </div>

      <div className="grid2">
        <div className="chartbox">
          <h3>🤝 Cluster buys — mesmo ticker comprado por vários políticos</h3>
          {clusters.length === 0 ? <p className="muted">Nenhum cluster nesta janela.</p> : (
            <table>
              <thead><tr><th>Ticker</th><th>Políticos</th><th style={{ textAlign: 'right' }}>Volume</th></tr></thead>
              <tbody>
                {clusters.map((c) => (
                  <tr key={c.ticker}>
                    <td className="mono"><Link href={`/stocks/${c.ticker}`}>{c.ticker}</Link></td>
                    <td>{c.buyers} <span className="muted" style={{ fontSize: 11 }}>· {c.names.slice(0, 3).join(', ')}{c.names.length > 3 ? '…' : ''}</span></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{fmtMoney(c.vol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="chartbox">
          <h3>🧠 Smart money — compras por políticos de alto alpha</h3>
          <p className="muted" style={{ fontSize: 11, marginTop: -4 }}>
            "Alto alpha" = top 25% por alpha médio (mín. 10 trades pontuadas; corte ≥ {smartCut?.toFixed?.(1) ?? '—'}%).
          </p>
          {smart.length === 0 ? <p className="muted">Nenhuma compra de alto alpha nesta janela.</p> : (
            <table>
              <thead><tr><th>Ticker</th><th>Políticos</th><th style={{ textAlign: 'right' }}>Volume</th></tr></thead>
              <tbody>
                {smart.map((c) => (
                  <tr key={c.ticker}>
                    <td className="mono"><Link href={`/stocks/${c.ticker}`}>{c.ticker}</Link></td>
                    <td>{c.buyers} <span className="muted" style={{ fontSize: 11 }}>· {c.names.slice(0, 3).join(', ')}{c.names.length > 3 ? '…' : ''}</span></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{fmtMoney(c.vol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
