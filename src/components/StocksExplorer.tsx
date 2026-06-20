'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { TickerSummary } from '@/lib/supabase';
import { fmtPct, pctClass, fmtMoney } from '@/lib/format';
import { Toolbar, TextFilter, SelectFilter, SortTh, compareBy, Sort } from './controls';

type Col =
  | 'ticker' | 'trade_count' | 'filer_count' | 'purchases' | 'sales'
  | 'buy_volume' | 'sell_volume' | 'net_volume' | 'est_volume' | 'avg_alpha' | 'win_rate' | 'last_traded';

export default function StocksExplorer({ rows }: { rows: TickerSummary[] }) {
  const [q, setQ] = useState('');
  const [minFilers, setMinFilers] = useState('1');
  const [sort, setSort] = useState<Sort<Col>>({ key: 'est_volume', dir: 'desc' });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const min = Number(minFilers) || 1;
    return rows
      .filter((r) => {
        if (r.filer_count < min) return false;
        if (needle && !`${r.ticker} ${r.asset_description ?? ''}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .slice()
      .sort(compareBy(sort.key, sort.dir));
  }, [rows, q, minFilers, sort]);

  return (
    <>
      <Toolbar count={`${filtered.length} of ${rows.length} stocks`}>
        <TextFilter value={q} onChange={setQ} placeholder="Search ticker or company…" />
        <SelectFilter
          label="Min. politicians" value={minFilers} onChange={setMinFilers}
          options={[
            { value: '1', label: '1+' }, { value: '3', label: '3+' },
            { value: '5', label: '5+' }, { value: '10', label: '10+' },
            { value: '25', label: '25+' },
          ]}
        />
      </Toolbar>
      <table>
        <thead>
          <tr>
            <SortTh label="Ticker" col="ticker" sort={sort} setSort={setSort} />
            <SortTh label="Trades" col="trade_count" sort={sort} setSort={setSort} numeric />
            <SortTh label="Politicians" col="filer_count" sort={sort} setSort={setSort} numeric />
            <SortTh label="Buys" col="purchases" sort={sort} setSort={setSort} numeric />
            <SortTh label="Sells" col="sales" sort={sort} setSort={setSort} numeric />
            <SortTh label="Buy vol." col="buy_volume" sort={sort} setSort={setSort} numeric />
            <SortTh label="Sell vol." col="sell_volume" sort={sort} setSort={setSort} numeric />
            <SortTh label="Net flow" col="net_volume" sort={sort} setSort={setSort} numeric />
            <SortTh label="Avg alpha" col="avg_alpha" sort={sort} setSort={setSort} numeric />
            <SortTh label="Win rate" col="win_rate" sort={sort} setSort={setSort} numeric />
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={s.ticker}>
              <td className="mono"><Link href={`/stocks/${s.ticker}`}>{s.ticker}</Link></td>
              <td className="mono">{s.trade_count}</td>
              <td className="mono">{s.filer_count}</td>
              <td className="mono buy">{s.purchases}</td>
              <td className="mono sell">{s.sales}</td>
              <td className="mono">{fmtMoney(s.buy_volume)}</td>
              <td className="mono">{fmtMoney(s.sell_volume)}</td>
              <td className={`mono ${(s.net_volume ?? 0) >= 0 ? 'pos' : 'neg'}`}>
                {(s.net_volume ?? 0) >= 0 ? '+' : '−'}{fmtMoney(Math.abs(s.net_volume ?? 0))}
              </td>
              <td className={`mono ${pctClass(s.avg_alpha)}`}>{fmtPct(s.avg_alpha)}</td>
              <td className="mono">{s.win_rate != null ? `${s.win_rate}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="muted">No stocks match these filters.</p>}
    </>
  );
}
