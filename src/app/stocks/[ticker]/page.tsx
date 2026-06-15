import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabase, type TickerSummary } from '@/lib/supabase';
import StockCharts, { type StockTrade } from '@/components/StockCharts';
import { fmtAmount, fmtDate, fmtPct, pctClass, fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; politician_id: string; tx_type: string | null;
  amount_min: number | null; amount_max: number | null;
  transaction_date: string | null; disclosure_date: string | null;
  politician: { full_name: string; party: string | null; chamber: string } | null;
};

async function getData(ticker: string) {
  const supabase = getSupabase();
  const [summary, trades] = await Promise.all([
    supabase.from('ticker_summary').select('*').eq('ticker', ticker).maybeSingle(),
    supabase.from('trades')
      .select('id, politician_id, tx_type, amount_min, amount_max, transaction_date, disclosure_date, politician:politicians(full_name, party, chamber)')
      .eq('ticker', ticker)
      .order('transaction_date', { ascending: false, nullsFirst: false })
      .limit(1000),
  ]);
  return {
    summary: summary.data as TickerSummary | null,
    trades: (trades.data ?? []) as unknown as Row[],
  };
}

export default async function StockPage({ params }: { params: { ticker: string } }) {
  const ticker = decodeURIComponent(params.ticker).toUpperCase();
  const { summary, trades } = await getData(ticker);
  if (!summary) notFound();

  const chartTrades: StockTrade[] = trades.map((t) => ({
    tx_type: t.tx_type, amount_min: t.amount_min, amount_max: t.amount_max,
    transaction_date: t.transaction_date, politician_name: t.politician?.full_name ?? t.politician_id,
  }));

  return (
    <>
      <p style={{ margin: '0 0 4px' }}><Link href="/stocks" className="muted">← Ações</Link></p>
      <h2 style={{ marginTop: 0 }}>
        <span className="mono">{summary.ticker}</span>
        {summary.asset_description && (
          <span className="muted" style={{ fontSize: 13 }}> · {summary.asset_description.slice(0, 60)}</span>
        )}
      </h2>

      <div className="cards">
        <div className="card"><div className="val">{summary.trade_count}</div><div className="lbl">trades</div></div>
        <div className="card"><div className="val">{summary.filer_count}</div><div className="lbl">políticos</div></div>
        <div className="card"><div className="val buy">{summary.purchases}</div><div className="lbl">compras · {fmtMoney(summary.buy_volume)}</div></div>
        <div className="card"><div className="val sell">{summary.sales}</div><div className="lbl">vendas · {fmtMoney(summary.sell_volume)}</div></div>
        <div className="card">
          <div className={`val ${pctClass(summary.avg_alpha)}`}>{fmtPct(summary.avg_alpha)}</div>
          <div className="lbl">alpha médio ({summary.scored_trades} pontuadas)</div>
        </div>
        <div className="card">
          <div className="val">{summary.win_rate != null ? `${summary.win_rate}%` : '—'}</div>
          <div className="lbl">win rate</div>
        </div>
      </div>

      <StockCharts trades={chartTrades} />

      <h2>Trades neste ativo</h2>
      <table>
        <thead>
          <tr><th>Político</th><th>Tipo</th><th>Valor</th><th>Data trade</th><th>Divulgado</th></tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/politicians/${t.politician_id}`}>{t.politician?.full_name ?? t.politician_id}</Link>
              </td>
              <td className={t.tx_type === 'purchase' ? 'buy' : t.tx_type === 'sale' ? 'sell' : ''}>
                {t.tx_type === 'purchase' ? 'Compra' : t.tx_type === 'sale' ? 'Venda' : t.tx_type ?? '—'}
              </td>
              <td className="mono">{fmtAmount(t.amount_min, t.amount_max)}</td>
              <td className="mono">{fmtDate(t.transaction_date)}</td>
              <td className="mono">{fmtDate(t.disclosure_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
