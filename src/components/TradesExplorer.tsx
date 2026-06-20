'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Trade } from '@/lib/supabase';
import { assetClass, amountMid, AssetClass } from '@/lib/assetClass';
import { fmtAmount, fmtDate, fmtPct, pctClass } from '@/lib/format';
import {
  Toolbar, TextFilter, SelectFilter, Segmented, SortTh, compareBy, Sort,
} from './controls';

export type PriceEmbed = {
  entry_price: number | null; price_now: number | null;
  open_return_pct: number | null; realized_return_pct: number | null; matched_buy_date: string | null;
};
export type TradeRow = Trade & {
  politician: { full_name: string } | null;
  prices?: PriceEmbed | PriceEmbed[] | null;
};

type Col = 'politician' | 'ticker' | 'tx_type' | 'amount' | 'transaction_date'
  | 'disclosure_date' | 'disclosure_delay_days' | 'entry' | 'result';

const priceOf = (p: TradeRow['prices']): PriceEmbed | null => (Array.isArray(p) ? p[0] ?? null : p ?? null);

export default function TradesExplorer({
  rows, hidePolitician = false,
}: { rows: TradeRow[]; hidePolitician?: boolean }) {
  const [q, setQ] = useState('');
  const [tx, setTx] = useState('');
  const [cat, setCat] = useState<AssetClass | 'all'>('stock');
  const [sort, setSort] = useState<Sort<Col>>({ key: 'transaction_date', dir: 'desc' });

  const hasPrices = useMemo(() => rows.some((r) => priceOf(r.prices)), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const enriched = rows.map((r) => {
      const pr = priceOf(r.prices);
      const result = r.tx_type === 'sale' ? pr?.realized_return_pct ?? null : pr?.open_return_pct ?? null;
      return { ...r, _mid: amountMid(r.amount_min, r.amount_max), _entry: pr?.entry_price ?? null, _result: result, _matched: pr?.matched_buy_date ?? null };
    });
    let out = enriched.filter((r) => {
      if (cat !== 'all' && assetClass(r.asset_type, r.ticker) !== cat) return false;
      if (tx && r.tx_type !== tx) return false;
      if (needle) {
        const hay = `${r.politician?.full_name ?? ''} ${r.ticker ?? ''} ${r.asset_description ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const map: Partial<Record<Col, string>> = { amount: '_mid', politician: '_pol', entry: '_entry', result: '_result' };
    const key = map[sort.key] ?? sort.key;
    if (sort.key === 'politician') out = out.map((r) => ({ ...r, _pol: r.politician?.full_name ?? '' }));
    return out.sort(compareBy(key, sort.dir));
  }, [rows, q, tx, cat, sort]);

  return (
    <>
      <Toolbar count={`${filtered.length} of ${rows.length} trades`}>
        <TextFilter value={q} onChange={setQ} placeholder="Search politician, ticker, asset…" />
        <Segmented
          value={cat}
          onChange={setCat}
          options={[
            { value: 'stock', label: 'Stocks' },
            { value: 'fund', label: 'Funds' },
            { value: 'other', label: 'Other' },
            { value: 'all', label: 'All' },
          ]}
        />
        <SelectFilter
          label="" value={tx} onChange={setTx}
          options={[
            { value: '', label: 'Buy + Sell' },
            { value: 'purchase', label: 'Buys' },
            { value: 'sale', label: 'Sells' },
          ]}
        />
      </Toolbar>

      <table>
        <thead>
          <tr>
            {!hidePolitician && <SortTh label="Politician" col="politician" sort={sort} setSort={setSort} />}
            <SortTh label="Ticker" col="ticker" sort={sort} setSort={setSort} />
            <SortTh label="Type" col="tx_type" sort={sort} setSort={setSort} />
            <SortTh label="Amount" col="amount" sort={sort} setSort={setSort} numeric />
            <SortTh label="Trade date" col="transaction_date" sort={sort} setSort={setSort} numeric />
            <SortTh label="Disclosed" col="disclosure_date" sort={sort} setSort={setSort} numeric />
            <SortTh label="Delay" col="disclosure_delay_days" sort={sort} setSort={setSort} numeric />
            {hasPrices && <SortTh label="Price" col="entry" sort={sort} setSort={setSort} numeric />}
            {hasPrices && <SortTh label="Result" col="result" sort={sort} setSort={setSort} numeric />}
          </tr>
        </thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={t.id}>
              {!hidePolitician && (
                <td>
                  {t.politician ? (
                    <Link href={`/politicians/${t.politician_id}`}>{t.politician.full_name}</Link>
                  ) : t.politician_id}
                </td>
              )}
              <td className="mono">
                {t.ticker
                  ? <Link href={`/stocks/${t.ticker}`}>{t.ticker}</Link>
                  : <span className="muted">{t.asset_description?.slice(0, 22) ?? '—'}</span>}
              </td>
              <td className={t.tx_type === 'purchase' ? 'buy' : t.tx_type === 'sale' ? 'sell' : ''}>
                {t.tx_type === 'purchase' ? 'Buy' : t.tx_type === 'sale' ? 'Sell' : t.tx_type ?? '—'}
              </td>
              <td className="mono">{fmtAmount(t.amount_min, t.amount_max)}</td>
              <td className="mono">{fmtDate(t.transaction_date)}</td>
              <td className="mono">{fmtDate(t.disclosure_date)}</td>
              <td className="mono">{t.disclosure_delay_days != null ? `${t.disclosure_delay_days}d` : '—'}</td>
              {hasPrices && <td className="mono">{t._entry != null ? `$${t._entry.toFixed(2)}` : '—'}</td>}
              {hasPrices && (
                <td className={`mono ${pctClass(t._result)}`}>
                  {t._result != null
                    ? <>{fmtPct(t._result)} <span className="muted" style={{ fontSize: 10 }}>{t.tx_type === 'sale' ? 'realized' : 'open'}</span></>
                    : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="muted">No trades match these filters.</p>}
    </>
  );
}
