'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PoliticianSummary } from '@/lib/supabase';
import { fmtPct, pctClass, partyLabel } from '@/lib/format';
import {
  Toolbar, TextFilter, SelectFilter, SortTh, compareBy, Sort,
  chamberOptions, partyOptions,
} from './controls';

type Col =
  | 'full_name' | 'chamber' | 'total_trades' | 'stock_trades' | 'scored_trades'
  | 'avg_alpha' | 'win_rate' | 'avg_disclosure_delay_days' | 'last_traded';

export default function PoliticiansExplorer({
  rows, initialSort,
}: { rows: PoliticianSummary[]; initialSort?: Sort<Col> }) {
  const [q, setQ] = useState('');
  const [chamber, setChamber] = useState('');
  const [party, setParty] = useState('');
  const [sort, setSort] = useState<Sort<Col>>(initialSort ?? { key: 'total_trades', dir: 'desc' });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (chamber && r.chamber !== chamber) return false;
        if (party && r.party !== party) return false;
        if (needle && !`${r.full_name} ${r.state ?? ''}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .slice()
      .sort(compareBy(sort.key, sort.dir));
  }, [rows, q, chamber, party, sort]);

  return (
    <>
      <Toolbar count={`${filtered.length} de ${rows.length} políticos`}>
        <TextFilter value={q} onChange={setQ} placeholder="Buscar nome ou estado…" />
        <SelectFilter label="" value={chamber} onChange={setChamber} options={chamberOptions} />
        <SelectFilter label="" value={party} onChange={setParty} options={partyOptions} />
      </Toolbar>
      <table>
        <thead>
          <tr>
            <SortTh label="Nome" col="full_name" sort={sort} setSort={setSort} />
            <SortTh label="Câmara" col="chamber" sort={sort} setSort={setSort} />
            <th>Partido</th>
            <SortTh label="Trades" col="total_trades" sort={sort} setSort={setSort} numeric />
            <SortTh label="Ações" col="stock_trades" sort={sort} setSort={setSort} numeric />
            <SortTh label="Alpha méd." col="avg_alpha" sort={sort} setSort={setSort} numeric />
            <SortTh label="Win rate" col="win_rate" sort={sort} setSort={setSort} numeric />
            <SortTh label="Última trade" col="last_traded" sort={sort} setSort={setSort} numeric />
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/politicians/${p.id}`}>{p.full_name}</Link></td>
              <td>{p.chamber === 'senate' ? 'Senado' : 'Câmara'}</td>
              <td>{partyLabel(p.party)}{p.state ? <span className="muted"> · {p.state}</span> : ''}</td>
              <td className="mono">{p.total_trades}</td>
              <td className="mono">{p.stock_trades}</td>
              <td className={`mono ${pctClass(p.avg_alpha)}`}>{fmtPct(p.avg_alpha)}</td>
              <td className="mono">{p.win_rate != null ? `${p.win_rate}%` : '—'}</td>
              <td className="mono">{p.last_traded ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="muted">Nenhum político com esses filtros.</p>}
    </>
  );
}
