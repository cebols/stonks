'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Trade } from '@/lib/supabase';
import { assetClass, amountMid, AssetClass } from '@/lib/assetClass';
import { fmtAmount, fmtDate } from '@/lib/format';
import {
  Toolbar, TextFilter, SelectFilter, Segmented, SortTh, compareBy, Sort,
} from './controls';

export type TradeRow = Trade & {
  politician: { full_name: string } | null;
};

type Col = 'politician' | 'ticker' | 'tx_type' | 'amount' | 'transaction_date' | 'disclosure_date' | 'disclosure_delay_days';

export default function TradesExplorer({
  rows, hidePolitician = false,
}: { rows: TradeRow[]; hidePolitician?: boolean }) {
  const [q, setQ] = useState('');
  const [tx, setTx] = useState('');
  const [cat, setCat] = useState<AssetClass | 'all'>('stock');
  const [sort, setSort] = useState<Sort<Col>>({ key: 'transaction_date', dir: 'desc' });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const enriched = rows.map((r) => ({ ...r, _mid: amountMid(r.amount_min, r.amount_max) }));
    let out = enriched.filter((r) => {
      if (cat !== 'all' && assetClass(r.asset_type, r.ticker) !== cat) return false;
      if (tx && r.tx_type !== tx) return false;
      if (needle) {
        const hay = `${r.politician?.full_name ?? ''} ${r.ticker ?? ''} ${r.asset_description ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const key = sort.key === 'amount' ? '_mid' : sort.key === 'politician' ? '_pol' : sort.key;
    if (sort.key === 'politician') out = out.map((r) => ({ ...r, _pol: r.politician?.full_name ?? '' }));
    return out.sort(compareBy(key, sort.dir));
  }, [rows, q, tx, cat, sort]);

  return (
    <>
      <Toolbar count={`${filtered.length} de ${rows.length} trades`}>
        <TextFilter value={q} onChange={setQ} placeholder="Buscar político, ticker, ativo…" />
        <Segmented
          value={cat}
          onChange={setCat}
          options={[
            { value: 'stock', label: 'Ações' },
            { value: 'fund', label: 'Fundos' },
            { value: 'other', label: 'Outros' },
            { value: 'all', label: 'Todos' },
          ]}
        />
        <SelectFilter
          label="" value={tx} onChange={setTx}
          options={[
            { value: '', label: 'Compra + Venda' },
            { value: 'purchase', label: 'Compras' },
            { value: 'sale', label: 'Vendas' },
          ]}
        />
      </Toolbar>

      <table>
        <thead>
          <tr>
            {!hidePolitician && <SortTh label="Político" col="politician" sort={sort} setSort={setSort} />}
            <SortTh label="Ticker" col="ticker" sort={sort} setSort={setSort} />
            <SortTh label="Tipo" col="tx_type" sort={sort} setSort={setSort} />
            <SortTh label="Valor" col="amount" sort={sort} setSort={setSort} numeric />
            <SortTh label="Data trade" col="transaction_date" sort={sort} setSort={setSort} numeric />
            <SortTh label="Divulgado" col="disclosure_date" sort={sort} setSort={setSort} numeric />
            <SortTh label="Delay" col="disclosure_delay_days" sort={sort} setSort={setSort} numeric />
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
                {t.tx_type === 'purchase' ? 'Compra' : t.tx_type === 'sale' ? 'Venda' : t.tx_type ?? '—'}
              </td>
              <td className="mono">{fmtAmount(t.amount_min, t.amount_max)}</td>
              <td className="mono">{fmtDate(t.transaction_date)}</td>
              <td className="mono">{fmtDate(t.disclosure_date)}</td>
              <td className="mono">{t.disclosure_delay_days != null ? `${t.disclosure_delay_days}d` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="muted">Nenhuma trade com esses filtros.</p>}
    </>
  );
}
