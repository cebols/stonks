import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabase, type TickerSummary } from '@/lib/supabase';
import StockCharts, { type StockTrade } from '@/components/StockCharts';
import PerformanceCurve, { type PerfTrade } from '@/components/PerformanceCurve';
import TradingViewChart from '@/components/TradingViewChart';
import { fmtAmount, fmtDate, fmtPct, pctClass, fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

type PerfEmbed = { return_pct: number | null; benchmark_return_pct: number | null; cdi_return_pct: number | null };
type Row = {
  id: string; politician_id: string; ticker: string | null; asset_type: string | null;
  tx_type: string | null; amount_min: number | null; amount_max: number | null;
  transaction_date: string | null; disclosure_date: string | null;
  politician: { full_name: string } | null;
  perf: PerfEmbed | PerfEmbed[] | null;
};

async function getData(ticker: string) {
  const supabase = getSupabase();
  const [summary, trades] = await Promise.all([
    supabase.from('ticker_summary').select('*').eq('ticker', ticker).maybeSingle(),
    supabase.from('trades')
      .select('id, politician_id, ticker, asset_type, tx_type, amount_min, amount_max, transaction_date, disclosure_date, politician:politicians(full_name), perf:trade_performance(return_pct, benchmark_return_pct, cdi_return_pct)')
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
  const perfTrades: PerfTrade[] = trades.map((t) => {
    const p = Array.isArray(t.perf) ? t.perf[0] : t.perf;
    return {
      ticker: t.ticker, asset_type: t.asset_type, tx_type: t.tx_type,
      transaction_date: t.transaction_date, amount_min: t.amount_min, amount_max: t.amount_max,
      return_pct: p?.return_pct ?? null, benchmark_return_pct: p?.benchmark_return_pct ?? null,
      cdi_return_pct: p?.cdi_return_pct ?? null,
    };
  });

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

      <TradingViewChart symbol={summary.ticker} />

      {(() => {
        const oldest = perfTrades
          .filter((t) => t.tx_type === 'purchase' && t.return_pct != null && t.transaction_date)
          .sort((a, b) => (a.transaction_date! < b.transaction_date! ? -1 : 1))[0];
        if (!oldest) return null;
        return (
          <div className="chartbox">
            <h3>Resultado desde a compra mais antiga por um político ({oldest.transaction_date})</h3>
            <div className="cards">
              <div className="card">
                <div className={`val ${pctClass(oldest.return_pct)}`}>{fmtPct(oldest.return_pct)}</div>
                <div className="lbl">retorno do ativo</div>
              </div>
              <div className="card">
                <div className={`val ${pctClass(oldest.benchmark_return_pct)}`}>{fmtPct(oldest.benchmark_return_pct)}</div>
                <div className="lbl">S&P no período</div>
              </div>
              <div className="card">
                <div className={`val ${pctClass(oldest.cdi_return_pct)}`}>{fmtPct(oldest.cdi_return_pct)}</div>
                <div className="lbl">CDI no período</div>
              </div>
            </div>
          </div>
        );
      })()}

      <StockCharts trades={chartTrades} />
      <PerformanceCurve trades={perfTrades} showCategoryFilter={false} />

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
