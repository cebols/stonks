'use client';
import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { PoliticianSummary } from '@/lib/supabase';
import { fmtPct, pctClass, partyLabel } from '@/lib/format';

const GREEN = '#3fb950';
const RED = '#f85149';
const BLUE = '#58a6ff';

export default function Comparator({ politicians }: { politicians: PoliticianSummary[] }) {
  const [ids, setIds] = useState<string[]>([]);
  const [pick, setPick] = useState('');

  const byId = useMemo(() => new Map(politicians.map((p) => [p.id, p])), [politicians]);
  const selected = ids.map((id) => byId.get(id)).filter(Boolean) as PoliticianSummary[];

  function add(id: string) {
    if (id && !ids.includes(id)) setIds([...ids, id]);
    setPick('');
  }
  const remove = (id: string) => setIds(ids.filter((x) => x !== id));

  const available = politicians.filter((p) => !ids.includes(p.id));
  const alphaData = selected.map((p) => ({ name: p.full_name, alpha: p.avg_alpha ?? 0 }));
  const winData = selected.map((p) => ({ name: p.full_name, win: p.win_rate ?? 0 }));

  const axis = { fontSize: 11, fill: '#8b95a7' };
  const tooltipStyle = { background: '#131825', border: '1px solid #232a3b', borderRadius: 8, fontSize: 12 };
  const shortName = (n: string) => n.split(' ').slice(-1)[0];

  return (
    <>
      <div className="toolbar">
        <label>
          Adicionar político
          <select value={pick} onChange={(e) => add(e.target.value)}>
            <option value="">Selecione…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({partyLabel(p.party)}, {p.scored_trades} pontuadas)
              </option>
            ))}
          </select>
        </label>
        {ids.length > 0 && <button className="btn" onClick={() => setIds([])}>Limpar</button>}
      </div>

      {selected.length === 0 ? (
        <p className="muted">Adicione 2 ou mais políticos para comparar.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Político</th><th>Câmara</th><th>Partido</th>
                <th>Trades</th><th>Ações</th><th>Pontuadas</th><th>Alpha méd.</th><th>Win rate</th><th>Delay méd.</th><th></th>
              </tr>
            </thead>
            <tbody>
              {selected.map((p) => (
                <tr key={p.id}>
                  <td>{p.full_name}</td>
                  <td>{p.chamber === 'senate' ? 'Senado' : 'Câmara'}</td>
                  <td>{partyLabel(p.party)}</td>
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

          <div className="grid2" style={{ marginTop: 16 }}>
            <div className="chartbox">
              <h3>Alpha médio vs benchmark</h3>
              <ResponsiveContainer width="100%" height={260}>
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
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={winData} margin={{ left: 8, right: 16 }}>
                  <XAxis dataKey="name" tick={axis} tickFormatter={shortName} />
                  <YAxis tick={axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="win" fill={BLUE} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </>
  );
}
