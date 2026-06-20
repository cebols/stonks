import Link from 'next/link';
import { getSupabase, type PoliticianSummary, type TickerSummary, type Trade, type GlobalStats } from '@/lib/supabase';
import { fmtPct, pctClass, fmtMoney } from '@/lib/format';
import RecentTradesTable, { type RecentRow } from '@/components/RecentTradesTable';

export const dynamic = 'force-dynamic';

async function getDashboard() {
  const supabase = getSupabase();
  const since90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const [topPols, mostBought, bestStocks, recent, recentBuys, stats, netFlow] = await Promise.all([
    supabase.from('politician_summary').select('*').gte('scored_trades', 10)
      .not('avg_alpha', 'is', null)
      .order('avg_alpha', { ascending: false, nullsFirst: false }).limit(6),
    supabase.from('ticker_summary').select('*').not('buy_volume', 'is', null)
      .order('buy_volume', { ascending: false, nullsFirst: false }).limit(8),
    supabase.from('ticker_summary').select('*').gte('filer_count', 5)
      .not('avg_alpha', 'is', null)
      .order('avg_alpha', { ascending: false, nullsFirst: false }).limit(8),
    supabase.from('trades').select('*, politician:politicians(full_name)')
      .not('ticker', 'is', null)
      .order('transaction_date', { ascending: false, nullsFirst: false }).limit(12),
    supabase.from('trades').select('ticker, politician_id, transaction_date, tx_type')
      .eq('tx_type', 'purchase').not('ticker', 'is', null)
      .gte('transaction_date', since90).limit(1000),
    supabase.from('global_stats').select('*').maybeSingle(),
    supabase.from('ticker_summary').select('*').not('net_volume', 'is', null)
      .order('net_volume', { ascending: false, nullsFirst: false }).limit(8),
  ]);

  const buyers = new Map<string, Set<string>>();
  for (const t of (recentBuys.data ?? []) as { ticker: string; politician_id: string }[]) {
    if (!buyers.has(t.ticker)) buyers.set(t.ticker, new Set());
    buyers.get(t.ticker)!.add(t.politician_id);
  }
  const hot = [...buyers.entries()]
    .map(([ticker, s]) => ({ ticker, n: s.size }))
    .sort((a, b) => b.n - a.n).slice(0, 8);

  return {
    topPols: (topPols.data ?? []) as PoliticianSummary[],
    mostBought: (mostBought.data ?? []) as TickerSummary[],
    bestStocks: (bestStocks.data ?? []) as TickerSummary[],
    recent: (recent.data ?? []) as unknown as RecentRow[],
    hot,
    stats: stats.data as GlobalStats | null,
    netFlow: (netFlow.data ?? []) as TickerSummary[],
  };
}

function TickerRow({ s, metric }: { s: TickerSummary; metric: 'buy' | 'alpha' }) {
  return (
    <tr>
      <td className="mono"><Link href={`/stocks/${s.ticker}`}>{s.ticker}</Link></td>
      <td className="mono muted">{s.filer_count} pol.</td>
      <td className="mono" style={{ textAlign: 'right' }}>
        {metric === 'buy'
          ? fmtMoney(s.buy_volume)
          : <span className={pctClass(s.avg_alpha)}>{fmtPct(s.avg_alpha)}</span>}
      </td>
    </tr>
  );
}

export default async function HomePage() {
  const { topPols, mostBought, bestStocks, recent, hot, stats, netFlow } = await getDashboard();
  const empty = topPols.length === 0 && mostBought.length === 0;

  return (
    <>
      <h2>Overview</h2>
      {empty && (
        <p className="muted">
          No aggregated data yet — run <code>schema.sql</code> in Supabase to create the views.
        </p>
      )}

      {stats && (
        <div className="cards" style={{ marginBottom: 16 }}>
          <div className="card"><div className="val">{stats.total_trades.toLocaleString('en-US')}</div><div className="lbl">trades tracked</div></div>
          <div className="card"><div className="val">{stats.trades_30d}</div><div className="lbl">trades (last 30d)</div></div>
          <div className="card"><div className="val">{stats.politicians}</div><div className="lbl">politicians</div></div>
          <div className="card"><div className="val">{stats.stocks}</div><div className="lbl">distinct stocks</div></div>
          <div className="card"><div className="val">{fmtMoney(stats.total_volume)}</div><div className="lbl">est. volume</div></div>
          <div className="card"><div className="val">{stats.avg_delay != null ? `${stats.avg_delay}d` : '—'}</div><div className="lbl">avg delay</div></div>
        </div>
      )}

      <div className="grid2">
        <div className="chartbox">
          <h3>🏆 Politicians to follow (top alpha, min. 10 scored)</h3>
          <table>
            <tbody>
              {topPols.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/politicians/${p.id}`}>{p.full_name}</Link></td>
                  <td className="mono muted">{p.win_rate}% win</td>
                  <td className={`mono ${pctClass(p.avg_alpha)}`} style={{ textAlign: 'right' }}>{fmtPct(p.avg_alpha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0' }}><Link href="/leaderboard" className="muted">See full leaderboard →</Link></p>
        </div>

        <div className="chartbox">
          <h3>🔥 Most bought stocks (est. volume)</h3>
          <table><tbody>{mostBought.map((s) => <TickerRow key={s.ticker} s={s} metric="buy" />)}</tbody></table>
          <p style={{ margin: '8px 0 0' }}><Link href="/stocks" className="muted">See all stocks →</Link></p>
        </div>

        <div className="chartbox">
          <h3>📈 Best-performing stocks (avg alpha, min. 5 politicians)</h3>
          <table><tbody>{bestStocks.map((s) => <TickerRow key={s.ticker} s={s} metric="alpha" />)}</tbody></table>
        </div>

        <div className="chartbox">
          <h3>🚀 Trending — most bought in the last 90 days</h3>
          {hot.length === 0 ? <p className="muted">No recent buys.</p> : (
            <table>
              <tbody>
                {hot.map((h) => (
                  <tr key={h.ticker}>
                    <td className="mono"><Link href={`/stocks/${h.ticker}`}>{h.ticker}</Link></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{h.n} politicians buying</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="chartbox">
          <h3>💸 Largest net buying (buys − sells, all-time)</h3>
          <table>
            <tbody>
              {netFlow.map((s) => (
                <tr key={s.ticker}>
                  <td className="mono"><Link href={`/stocks/${s.ticker}`}>{s.ticker}</Link></td>
                  <td className="mono muted">{s.filer_count} pol.</td>
                  <td className="mono pos" style={{ textAlign: 'right' }}>+{fmtMoney(s.net_volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0' }}><Link href="/signals" className="muted">See signals (cluster buys, smart money) →</Link></p>
        </div>

        <div className="chartbox" style={{ gridColumn: '1 / -1' }}>
          <h3>🕒 Recent trades</h3>
          <RecentTradesTable rows={recent} />
          <p style={{ margin: '8px 0 0' }}><Link href="/trades" className="muted">See all trades →</Link></p>
        </div>
      </div>
    </>
  );
}
