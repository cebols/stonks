'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { assetClass, amountMid } from '@/lib/assetClass';
import { fmtMoney, fmtDate } from '@/lib/format';
import { Segmented } from './controls';

export type SignalTrade = {
  ticker: string;
  politician_id: string;
  asset_type: string | null;
  tx_type: string | null;
  transaction_date: string | null;
  disclosure_delay_days: number | null;
  amount_min: number | null;
  amount_max: number | null;
  is_opening: boolean | null;
  politician: { full_name: string } | null;
};
export type SignalSummary = {
  id: string; full_name: string; avg_alpha: number | null;
  scored_trades: number; committees: string[] | null;
};

const WINDOWS = [
  { value: '7', label: '7d' }, { value: '15', label: '15d' },
  { value: '30', label: '30d' }, { value: '90', label: '90d' },
];

function Buyers({ names }: { names: string[] }) {
  return (
    <span className="muted" style={{ fontSize: 11 }}>
      · {names.slice(0, 3).join(', ')}{names.length > 3 ? `… +${names.length - 3}` : ''}
    </span>
  );
}

export default function Signals({ trades, summaries }: { trades: SignalTrade[]; summaries: SignalSummary[] }) {
  const [win, setWin] = useState('30');
  const [minBuyers, setMinBuyers] = useState('3');
  const [committee, setCommittee] = useState('');

  const alphaOf = useMemo(() => new Map(summaries.map((s) => [s.id, s.avg_alpha])), [summaries]);
  const committeesOf = useMemo(() => new Map(summaries.map((s) => [s.id, s.committees ?? []])), [summaries]);

  // Lista de comitês (para o filtro).
  const allCommittees = useMemo(() => {
    const set = new Set<string>();
    for (const s of summaries) for (const c of s.committees ?? []) set.add(c);
    return [...set].sort();
  }, [summaries]);

  // "Alto alpha" = top 25% por alpha médio (mín. 10 pontuadas).
  const { smartIds, smartCut } = useMemo(() => {
    const pool = summaries.filter((s) => s.scored_trades >= 10 && s.avg_alpha != null)
      .map((s) => s.avg_alpha as number).sort((a, b) => a - b);
    const smartCut = pool.length ? pool[Math.floor(pool.length * 0.75)] : 0;
    const smartIds = new Set(
      summaries.filter((s) => s.scored_trades >= 10 && (s.avg_alpha ?? -1e9) >= smartCut).map((s) => s.id),
    );
    return { smartIds, smartCut };
  }, [summaries]);

  const scoped = useMemo(() => {
    const cutoff = new Date(Date.now() - Number(win) * 864e5).toISOString().slice(0, 10);
    return trades.filter((t) =>
      t.ticker && t.transaction_date && t.transaction_date >= cutoff &&
      assetClass(t.asset_type, t.ticker) === 'stock' &&
      (!committee || (committeesOf.get(t.politician_id) ?? []).includes(committee)));
  }, [trades, win, committee, committeesOf]);

  const min = Number(minBuyers);

  // Agrega por ticker: compradores, vendedores, smart, aberturas, volumes.
  const byTicker = useMemo(() => {
    type Agg = {
      buyers: Set<string>; sellers: Set<string>; smart: Set<string>;
      openings: Set<string>; buyVol: number; sellVol: number; buyerNames: Set<string>;
      smartNames: Set<string>; sellerNames: Set<string>; openerNames: Set<string>;
    };
    const m = new Map<string, Agg>();
    const get = (k: string): Agg => {
      let a = m.get(k);
      if (!a) { a = { buyers: new Set(), sellers: new Set(), smart: new Set(), openings: new Set(), buyVol: 0, sellVol: 0, buyerNames: new Set(), smartNames: new Set(), sellerNames: new Set(), openerNames: new Set() }; m.set(k, a); }
      return a;
    };
    for (const t of scoped) {
      const a = get(t.ticker);
      const name = t.politician?.full_name ?? t.politician_id;
      const vol = amountMid(t.amount_min, t.amount_max);
      if (t.tx_type === 'sale') {
        a.sellers.add(t.politician_id); a.sellVol += vol; a.sellerNames.add(name);
      } else {
        a.buyers.add(t.politician_id); a.buyVol += vol; a.buyerNames.add(name);
        if (smartIds.has(t.politician_id)) { a.smart.add(t.politician_id); a.smartNames.add(name); }
        if (t.is_opening) { a.openings.add(t.politician_id); a.openerNames.add(name); }
      }
    }
    return m;
  }, [scoped, smartIds]);

  // Conviction score: combina compradores, smart money, aberturas e fluxo líquido.
  const conviction = useMemo(() => {
    return [...byTicker.entries()].map(([ticker, a]) => {
      const buyers = a.buyers.size, smart = a.smart.size, openings = a.openings.size;
      const net = a.buyVol - a.sellVol;
      const alphas = [...a.buyers].map((id) => alphaOf.get(id)).filter((x): x is number => x != null);
      const avgAlpha = alphas.length ? alphas.reduce((s, x) => s + x, 0) / alphas.length : 0;
      const score = +(buyers + 1.5 * smart + openings + (net > 0 ? 1 : 0) + Math.max(-5, Math.min(5, avgAlpha / 5))).toFixed(1);
      return { ticker, buyers, smart, openings, net, avgAlpha: +avgAlpha.toFixed(1), score };
    }).filter((x) => x.buyers >= min).sort((a, b) => b.score - a.score).slice(0, 20);
  }, [byTicker, alphaOf, min]);

  const clusterBuys = useMemo(() =>
    [...byTicker.entries()].map(([ticker, a]) => ({ ticker, n: a.buyers.size, vol: a.buyVol, names: [...a.buyerNames] }))
      .filter((x) => x.n >= min).sort((a, b) => b.n - a.n).slice(0, 15), [byTicker, min]);

  const sellPressure = useMemo(() =>
    [...byTicker.entries()].map(([ticker, a]) => ({ ticker, n: a.sellers.size, vol: a.sellVol, names: [...a.sellerNames] }))
      .filter((x) => x.n >= min).sort((a, b) => b.n - a.n).slice(0, 15), [byTicker, min]);

  const smartMoney = useMemo(() =>
    [...byTicker.entries()].map(([ticker, a]) => ({ ticker, n: a.smart.size, vol: a.buyVol, names: [...a.smartNames] }))
      .filter((x) => x.n >= 1).sort((a, b) => b.n - a.n || b.vol - a.vol).slice(0, 15), [byTicker]);

  const firstTime = useMemo(() =>
    [...byTicker.entries()].map(([ticker, a]) => ({ ticker, n: a.openings.size, names: [...a.openerNames] }))
      .filter((x) => x.n >= 1).sort((a, b) => b.n - a.n).slice(0, 15), [byTicker]);

  // Divulgação rápida: compras divulgadas em ≤ 7 dias (sinal mais fresco).
  const fast = useMemo(() =>
    scoped.filter((t) => t.tx_type !== 'sale' && t.disclosure_delay_days != null && t.disclosure_delay_days <= 7)
      .sort((a, b) => (a.disclosure_delay_days! - b.disclosure_delay_days!))
      .slice(0, 15), [scoped]);

  const SignalTable = ({ rows }: { rows: { ticker: string; n: number; vol?: number; names: string[] }[] }) => (
    <table>
      <thead><tr><th>Ticker</th><th>Politicians</th><th style={{ textAlign: 'right' }}>Volume</th></tr></thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.ticker}>
            <td className="mono"><Link href={`/stocks/${c.ticker}`}>{c.ticker}</Link></td>
            <td>{c.n} <Buyers names={c.names} /></td>
            <td className="mono" style={{ textAlign: 'right' }}>{c.vol != null ? fmtMoney(c.vol) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="toolbar">
        <label>Window <Segmented value={win} onChange={setWin} options={WINDOWS} /></label>
        <label>Min. politicians
          <select value={minBuyers} onChange={(e) => setMinBuyers(e.target.value)}>
            {['2', '3', '5', '8'].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </label>
        <label>Committee
          <select value={committee} onChange={(e) => setCommittee(e.target.value)}>
            <option value="">All</option>
            {allCommittees.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <span className="count">{scoped.length} trades in window</span>
      </div>

      <div className="chartbox">
        <h3>⭐ Conviction score</h3>
        <p className="muted" style={{ fontSize: 11, marginTop: -4 }}>
          Score = buyers + 1.5×smart money + position openings + positive net flow + average buyer alpha.
        </p>
        {conviction.length === 0 ? <p className="muted">Nothing in this window/filter.</p> : (
          <table>
            <thead>
              <tr>
                <th>Ticker</th><th style={{ textAlign: 'right' }}>Score</th><th style={{ textAlign: 'right' }}>Buyers</th>
                <th style={{ textAlign: 'right' }}>Smart</th><th style={{ textAlign: 'right' }}>Openings</th>
                <th style={{ textAlign: 'right' }}>Net flow</th><th style={{ textAlign: 'right' }}>Avg α</th>
              </tr>
            </thead>
            <tbody>
              {conviction.map((c) => (
                <tr key={c.ticker}>
                  <td className="mono"><Link href={`/stocks/${c.ticker}`}>{c.ticker}</Link></td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{c.score}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{c.buyers}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{c.smart}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{c.openings}</td>
                  <td className={`mono ${c.net >= 0 ? 'pos' : 'neg'}`} style={{ textAlign: 'right' }}>{c.net >= 0 ? '+' : '−'}{fmtMoney(Math.abs(c.net))}</td>
                  <td className={`mono ${c.avgAlpha >= 0 ? 'pos' : 'neg'}`} style={{ textAlign: 'right' }}>{c.avgAlpha > 0 ? '+' : ''}{c.avgAlpha}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid2">
        <div className="chartbox">
          <h3>🤝 Cluster buys — bought by several politicians</h3>
          {clusterBuys.length === 0 ? <p className="muted">No clusters.</p> : <SignalTable rows={clusterBuys} />}
        </div>
        <div className="chartbox">
          <h3>📉 Sell pressure — sold by several politicians</h3>
          {sellPressure.length === 0 ? <p className="muted">No sell pressure.</p> : <SignalTable rows={sellPressure} />}
        </div>
        <div className="chartbox">
          <h3>🧠 Smart money — buys by high-alpha politicians</h3>
          <p className="muted" style={{ fontSize: 11, marginTop: -4 }}>Top 25% by alpha (cutoff ≥ {smartCut?.toFixed?.(1) ?? '—'}%).</p>
          {smartMoney.length === 0 ? <p className="muted">No high-alpha buys.</p> : <SignalTable rows={smartMoney} />}
        </div>
        <div className="chartbox">
          <h3>🌱 First-time buys — new position openings</h3>
          {firstTime.length === 0 ? <p className="muted">No new openings.</p> : (
            <table>
              <thead><tr><th>Ticker</th><th>Politicians opening</th></tr></thead>
              <tbody>
                {firstTime.map((c) => (
                  <tr key={c.ticker}>
                    <td className="mono"><Link href={`/stocks/${c.ticker}`}>{c.ticker}</Link></td>
                    <td>{c.n} <Buyers names={c.names} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="chartbox">
        <h3>⚡ Fast disclosure — buys disclosed within 7 days (freshest signal)</h3>
        {fast.length === 0 ? <p className="muted">No fast disclosures in this window.</p> : (
          <table>
            <thead><tr><th>Ticker</th><th>Politician</th><th>Trade date</th><th style={{ textAlign: 'right' }}>Delay</th></tr></thead>
            <tbody>
              {fast.map((t, i) => (
                <tr key={i}>
                  <td className="mono"><Link href={`/stocks/${t.ticker}`}>{t.ticker}</Link></td>
                  <td><Link href={`/politicians/${t.politician_id}`}>{t.politician?.full_name}</Link></td>
                  <td className="mono">{fmtDate(t.transaction_date)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{t.disclosure_delay_days}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
