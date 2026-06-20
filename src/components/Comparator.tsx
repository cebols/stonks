'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend, CartesianGrid,
} from 'recharts';
import type { PoliticianSummary } from '@/lib/supabase';
import { fmtPct, pctClass } from '@/lib/format';
import { Range } from '@/lib/range';
import { RangeSelect } from './controls';

const GREEN = '#3fb950';
const RED = '#f85149';
const BLUE = '#58a6ff';
const PALETTE = ['#58a6ff', '#a371f7', '#3fb950', '#e3b341', '#f778ba', '#56d4dd'];

export default function Comparator({
  politicians, initialIds = [], embedded = false,
}: { politicians: PoliticianSummary[]; initialIds?: string[]; embedded?: boolean }) {
  const [ids, setIds] = useState<string[]>(initialIds);
  const [q, setQ] = useState('');

  const byId = useMemo(() => new Map(politicians.map((p) => [p.id, p])), [politicians]);
  const selected = ids.map((id) => byId.get(id)).filter(Boolean) as PoliticianSummary[];

  function add(id: string) {
    if (id && !ids.includes(id)) setIds([...ids, id]);
    setQ('');
  }
  const remove = (id: string) => setIds(ids.filter((x) => x !== id));

  // Sugestões da busca (autocomplete).
  const suggestions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return politicians
      .filter((p) => !ids.includes(p.id) && p.full_name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [politicians, ids, q]);

  // Curva de performance (carteira de cada político + S&P + CDI), via API.
  const [curve, setCurve] = useState<Record<string, number | null>[]>([]);
  const [range, setRange] = useState<Range>('all');
  useEffect(() => {
    if (ids.length === 0) { setCurve([]); return; }
    let alive = true;
    fetch(`/api/curve?ids=${encodeURIComponent(ids.join(','))}&range=${range}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setCurve(j.data ?? []); })
      .catch(() => { if (alive) setCurve([]); });
    return () => { alive = false; };
  }, [ids, range]);

  const alphaData = selected.map((p) => ({ name: p.full_name, alpha: p.avg_alpha ?? 0 }));
  const winData = selected.map((p) => ({ name: p.full_name, win: p.win_rate ?? 0 }));
  const axis = { fontSize: 11, fill: '#8b95a7' };
  const tooltipStyle = { background: '#131825', border: '1px solid #232a3b', borderRadius: 8, fontSize: 12 };
  const shortName = (n: string) => n.split(' ').slice(-1)[0];

  return (
    <>
      <div className="toolbar" style={{ position: 'relative', display: 'block' }}>
        <input
          type="text"
          value={q}
          placeholder="Search a politician to add…"
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 280 }}
        />
        {suggestions.length > 0 && (
          <div style={{
            position: 'absolute', zIndex: 10, marginTop: 4, background: 'var(--panel)',
            border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', minWidth: 280,
          }}>
            {suggestions.map((p) => (
              <button
                key={p.id}
                className="btn"
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderRadius: 0 }}
                onClick={() => add(p.id)}
              >
                {p.full_name} <span className="muted">· {p.scored_trades} scored</span>
              </button>
            ))}
          </div>
        )}
        {ids.length > 0 && (
          <button className="btn" style={{ marginLeft: 8 }} onClick={() => setIds(initialIds)}>Clear</button>
        )}
      </div>

      {selected.length === 0 ? (
        <p className="muted">Search and add politicians to compare.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Politician</th><th>Trades</th><th>Stocks</th><th>Scored</th>
                <th>Avg alpha</th><th>Win rate</th><th>Avg delay</th><th></th>
              </tr>
            </thead>
            <tbody>
              {selected.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/politicians/${p.id}`}>{p.full_name}</Link></td>
                  <td className="mono">{p.total_trades}</td>
                  <td className="mono">{p.stock_trades}</td>
                  <td className="mono">{p.scored_trades}</td>
                  <td className={`mono ${pctClass(p.avg_alpha)}`}>{fmtPct(p.avg_alpha)}</td>
                  <td className="mono">{p.win_rate != null ? `${p.win_rate}%` : '—'}</td>
                  <td className="mono">{p.avg_disclosure_delay_days != null ? `${p.avg_disclosure_delay_days}d` : '—'}</td>
                  <td><button className="btn" onClick={() => remove(p.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="chartbox" style={{ marginTop: 16 }}>
            <h3>Cumulative return of purchases vs S&P vs CDI</h3>
            <div className="toolbar" style={{ margin: '0 0 8px' }}>
              <RangeSelect value={range} onChange={setRange} />
            </div>
            {curve.length < 2 ? (
              <p className="muted">Loading / not enough data for the curve.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={curve} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#1c2230" vertical={false} />
                  <XAxis dataKey="month" tick={axis} minTickGap={28} />
                  <YAxis tick={axis} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {selected.map((p, i) => (
                    <Line key={p.id} type="monotone" dataKey={p.id} name={shortName(p.full_name)}
                      stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                  <Line type="monotone" dataKey="sp" name="S&P" stroke="#8b95a7" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
                  <Line type="monotone" dataKey="cdi" name="CDI" stroke="#f0883e" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {selected.length >= 2 && (
            <div className="grid2" style={{ marginTop: 16 }}>
              <div className="chartbox">
                <h3>Average alpha vs benchmark</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={alphaData} margin={{ left: 8, right: 16 }}>
                    <XAxis dataKey="name" tick={axis} tickFormatter={shortName} />
                    <YAxis tick={axis} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="alpha" radius={[3, 3, 0, 0]}>
                      {alphaData.map((d, i) => <Cell key={i} fill={d.alpha >= 0 ? GREEN : RED} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chartbox">
                <h3>Win rate</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={winData} margin={{ left: 8, right: 16 }}>
                    <XAxis dataKey="name" tick={axis} tickFormatter={shortName} />
                    <YAxis tick={axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="win" fill={BLUE} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
