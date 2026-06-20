import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabase, type TickerSummary } from '@/lib/supabase';
import StockCharts, { type StockTrade } from '@/components/StockCharts';
import PerformanceCurve, { type PerfTrade } from '@/components/PerformanceCurve';
import TradingViewChart from '@/components/TradingViewChart';
import { fmtAmount, fmtDate, fmtPct, pctClass, fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

type PerfEmbed = { return_pct: number | null; benchmark_return_pct: number | null; cdi_return_pct: number | null };
type PriceEmbed = { entry_price: number | null; price_now: number | null; open_return_pct: number | null; realized_return_pct: number | null; matched_buy_date: string | null };
type Row = {
  id: string; politician_id: string; ticker: string | null; asset_type: string | null;
  tx_type: string | null; amount_min: number | null; amount_max: number | null;
  transaction_date: string | null; disclosure_date: string | null;
  politician: { full_name: string } | null;
  perf: PerfEmbed | PerfEmbed[] | null;
  prices: PriceEmbed | PriceEmbed[] | null;
};

async function getData(ticker: string) {
  const supabase = getSupabase();
  const [summary, trades] = await Promise.all([
    supabase.from('ticker_summary').select('*').eq('ticker', ticker).maybeSingle(),
    supabase.from('trades')
      .select('id, politician_id, ticker, asset_type, tx_type, amount_min, amount_max, transaction_date, disclosure_date, politician:politicians(full_name), perf:trade_performance(return_pct, benchmark_return_pct, cdi_return_pct), prices:trade_prices(entry_price, price_now, open_return_pct, realized_return_pct, matched_buy_date)')
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
      <p style={{ margin: '0 0 4px' }}><Link href="/stocks" className="muted">← Stocks</Link></p>
      <h2 style={{ marginTop: 0 }}>
        <span className="mono">{summary.ticker}</span>
        {summary.asset_description && (
          <span className="muted" style={{ fontSize: 13 }}> · {summary.asset_description.slice(0, 60)}</span>
        )}
      </h2>

      <div className="cards">
        <div className="card"><div className="val">{summary.trade_count}</div><div className="lbl">trades</div></div>
        <div className="card"><div className="val">{summary.filer_count}</div><div className="lbl">politicians</div></div>
        <div className="card"><div className="val buy">{summary.purchases}</div><div className="lbl">buys · {fmtMoney(summary.buy_volume)}</div></div>
        <div className="card"><div className="val sell">{summary.sales}</div><div className="lbl">sells · {fmtMoney(summary.sell_volume)}</div></div>
        <div className="card">
          <div className={`val ${pctClass(summary.avg_alpha)}`}>{fmtPct(summary.avg_alpha)}</div>
          <div className="lbl">avg alpha ({summary.scored_trades} scored)</div>
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
            <h3>Result since the earliest purchase by a politician ({fmtDate(oldest.transaction_date)})</h3>
            <div className="cards">
              <div className="card">
                <div className={`val ${pctClass(oldest.return_pct)}`}>{fmtPct(oldest.return_pct)}</div>
                <div className="lbl">asset return</div>
              </div>
              <div className="card">
                <div className={`val ${pctClass(oldest.benchmark_return_pct)}`}>{fmtPct(oldest.benchmark_return_pct)}</div>
                <div className="lbl">S&P over the period</div>
              </div>
              <div className="card">
                <div className={`val ${pctClass(oldest.cdi_return_pct)}`}>{fmtPct(oldest.cdi_return_pct)}</div>
                <div className="lbl">CDI over the period</div>
              </div>
            </div>
          </div>
        );
      })()}

      <StockCharts trades={chartTrades} />
      <PerformanceCurve trades={perfTrades} showCategoryFilter={false} />

      <h2>Trades in this asset</h2>
      <table>
        <thead>
          <tr><th>Politician</th><th>Type</th><th>Amount</th><th>Trade date</th><th>Price</th><th>Result</th></tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const pr = Array.isArray(t.prices) ? t.prices[0] : t.prices;
            const result = t.tx_type === 'sale' ? pr?.realized_return_pct ?? null : pr?.open_return_pct ?? null;
            return (
              <tr key={t.id}>
                <td>
                  <Link href={`/politicians/${t.politician_id}`}>{t.politician?.full_name ?? t.politician_id}</Link>
                </td>
                <td className={t.tx_type === 'purchase' ? 'buy' : t.tx_type === 'sale' ? 'sell' : ''}>
                  {t.tx_type === 'purchase' ? 'Buy' : t.tx_type === 'sale' ? 'Sell' : t.tx_type ?? '—'}
                </td>
                <td className="mono">{fmtAmount(t.amount_min, t.amount_max)}</td>
                <td className="mono">{fmtDate(t.transaction_date)}</td>
                <td className="mono">{pr?.entry_price != null ? `$${pr.entry_price.toFixed(2)}` : '—'}</td>
                <td className={`mono ${pctClass(result)}`}>
                  {result != null
                    ? <>{fmtPct(result)} <span className="muted" style={{ fontSize: 10 }}>{t.tx_type === 'sale' ? 'realized' : 'open'}</span></>
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
