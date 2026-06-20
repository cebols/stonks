'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PoliticianSummary } from '@/lib/supabase';
import { fmtPct, pctClass, fmtDate } from '@/lib/format';
import { Toolbar, TextFilter, SortTh, compareBy, Sort } from './controls';

type Col =
  | 'full_name' | 'total_trades' | 'stock_trades' | 'scored_trades'
  | 'avg_alpha' | 'win_rate' | 'avg_disclosure_delay_days' | 'last_traded';

export default function PoliticiansExplorer({
  rows, initialSort,
}: { rows: PoliticianSummary[]; initialSort?: Sort<Col> }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort<Col>>(initialSort ?? { key: 'total_trades', dir: 'desc' });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !needle || r.full_name.toLowerCase().includes(needle))
      .slice()
      .sort(compareBy(sort.key, sort.dir));
  }, [rows, q, sort]);

  return (
    <>
      <Toolbar count={`${filtered.length} of ${rows.length} politicians`}>
        <TextFilter value={q} onChange={setQ} placeholder="Search name…" />
      </Toolbar>
      <table>
        <thead>
          <tr>
            <SortTh label="Name" col="full_name" sort={sort} setSort={setSort} />
            <SortTh label="Trades" col="total_trades" sort={sort} setSort={setSort} numeric />
            <SortTh label="Stocks" col="stock_trades" sort={sort} setSort={setSort} numeric />
            <SortTh label="Avg alpha" col="avg_alpha" sort={sort} setSort={setSort} numeric />
            <SortTh label="Win rate" col="win_rate" sort={sort} setSort={setSort} numeric />
            <SortTh label="Last trade" col="last_traded" sort={sort} setSort={setSort} numeric />
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/politicians/${p.id}`}>{p.full_name}</Link></td>
              <td className="mono">{p.total_trades}</td>
              <td className="mono">{p.stock_trades}</td>
              <td className={`mono ${pctClass(p.avg_alpha)}`}>{fmtPct(p.avg_alpha)}</td>
              <td className="mono">{p.win_rate != null ? `${p.win_rate}%` : '—'}</td>
              <td className="mono">{fmtDate(p.last_traded)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="muted">No politicians match these filters.</p>}
    </>
  );
}
