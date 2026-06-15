import Link from 'next/link';
import type { Trade } from '@/lib/supabase';
import { fmtAmount, fmtDate } from '@/lib/format';

type Row = Trade & { politician?: { full_name: string; chamber: string; party: string | null } | null };

export default function TradesTable({ rows, showPolitician = true }: { rows: Row[]; showPolitician?: boolean }) {
  if (!rows.length) return <p className="muted">Nenhuma trade encontrada. Rode o pipeline de ingestão.</p>;
  return (
    <table>
      <thead>
        <tr>
          {showPolitician && <th>Político</th>}
          <th>Ticker</th>
          <th>Tipo</th>
          <th>Valor</th>
          <th>Data trade</th>
          <th>Divulgado</th>
          <th>Delay</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            {showPolitician && (
              <td>
                {t.politician ? (
                  <Link href={`/politicians/${t.politician_id}`}>{t.politician.full_name}</Link>
                ) : (
                  t.politician_id
                )}
              </td>
            )}
            <td className="mono">{t.ticker ?? <span className="muted">{t.asset_description?.slice(0, 24) ?? '—'}</span>}</td>
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
  );
}
