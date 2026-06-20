'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { amountMid } from '@/lib/assetClass';
import { fmtAmount, fmtDate } from '@/lib/format';
import { SortTh, compareBy, Sort } from './controls';

export type RecentRow = {
  id: string;
  ticker: string | null;
  politician_id: string;
  tx_type: string | null;
  amount_min: number | null;
  amount_max: number | null;
  transaction_date: string | null;
  disclosure_delay_days: number | null;
  politician: { full_name: string } | null;
};

type Col = 'ticker' | 'tx_type' | 'politician' | 'amount' | 'transaction_date' | 'disclosure_delay_days';

export default function RecentTradesTable({ rows }: { rows: RecentRow[] }) {
  const [sort, setSort] = useState<Sort<Col>>({ key: 'transaction_date', dir: 'desc' });

  const sorted = useMemo(() => {
    const map: Partial<Record<Col, string>> = { amount: '_mid', politician: '_pol' };
    const enriched = rows.map((r) => ({ ...r, _mid: amountMid(r.amount_min, r.amount_max), _pol: r.politician?.full_name ?? '' }));
    return enriched.sort(compareBy(map[sort.key] ?? sort.key, sort.dir));
  }, [rows, sort]);

  return (
    <table>
      <thead>
        <tr>
          <SortTh label="Ticker" col="ticker" sort={sort} setSort={setSort} />
          <SortTh label="Type" col="tx_type" sort={sort} setSort={setSort} />
          <SortTh label="Politician" col="politician" sort={sort} setSort={setSort} />
          <SortTh label="Amount" col="amount" sort={sort} setSort={setSort} numeric align="right" />
          <SortTh label="Date" col="transaction_date" sort={sort} setSort={setSort} numeric align="right" />
          <SortTh label="Delay" col="disclosure_delay_days" sort={sort} setSort={setSort} numeric align="right" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((t) => (
          <tr key={t.id}>
            <td className="mono"><Link href={`/stocks/${t.ticker}`}>{t.ticker}</Link></td>
            <td className={t.tx_type === 'purchase' ? 'buy' : 'sell'}>{t.tx_type === 'purchase' ? 'Buy' : 'Sell'}</td>
            <td><Link href={`/politicians/${t.politician_id}`}>{t.politician?.full_name}</Link></td>
            <td className="mono" style={{ textAlign: 'right' }}>{fmtAmount(t.amount_min, t.amount_max)}</td>
            <td className="mono" style={{ textAlign: 'right' }}>{fmtDate(t.transaction_date)}</td>
            <td className="mono" style={{ textAlign: 'right' }}>{t.disclosure_delay_days != null ? `${t.disclosure_delay_days}d` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
