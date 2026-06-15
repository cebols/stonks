import Link from 'next/link';
import { getSupabase, type PoliticianSummary, type TickerSummary, type Trade } from '@/lib/supabase';
import { fmtPct, pctClass, fmtMoney, fmtAmount } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function getDashboard() {
  const supabase = getSupabase();
  const [topPols, mostBought, bestStocks, recent] = await Promise.all([
    supabase.from('politician_summary').select('*').gte('scored_trades', 10)
      .order('avg_alpha', { ascending: false }).limit(6),
    supabase.from('ticker_summary').select('*').order('buy_volume', { ascending: false }).limit(8),
    supabase.from('ticker_summary').select('*').gte('filer_count', 5)
      .order('avg_alpha', { ascending: false }).limit(8),
    supabase.from('trades').select('*, politician:politicians(full_name)')
      .not('ticker', 'is', null)
      .order('transaction_date', { ascending: false, nullsFirst: false }).limit(10),
  ]);
  return {
    topPols: (topPols.data ?? []) as PoliticianSummary[],
    mostBought: (mostBought.data ?? []) as TickerSummary[],
    bestStocks: (bestStocks.data ?? []) as TickerSummary[],
    recent: (recent.data ?? []) as unknown as (Trade & { politician: { full_name: string } | null })[],
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
  const { topPols, mostBought, bestStocks, recent } = await getDashboard();
  const empty = topPols.length === 0 && mostBought.length === 0;

  return (
    <>
      <h2>Visão geral</h2>
      {empty && (
        <p className="muted">
          Sem dados agregados ainda — rode o <code>schema.sql</code> no Supabase para criar as views.
        </p>
      )}

      <div className="grid2">
        <div className="chartbox">
          <h3>🏆 Políticos pra seguir (maior alpha, mín. 10 pontuadas)</h3>
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
          <p style={{ margin: '8px 0 0' }}><Link href="/leaderboard" className="muted">Ver leaderboard completo →</Link></p>
        </div>

        <div className="chartbox">
          <h3>🔥 Ações mais compradas (volume estimado)</h3>
          <table><tbody>{mostBought.map((s) => <TickerRow key={s.ticker} s={s} metric="buy" />)}</tbody></table>
          <p style={{ margin: '8px 0 0' }}><Link href="/stocks" className="muted">Ver todas as ações →</Link></p>
        </div>

        <div className="chartbox">
          <h3>📈 Ações de melhor resultado (alpha méd., mín. 5 políticos)</h3>
          <table><tbody>{bestStocks.map((s) => <TickerRow key={s.ticker} s={s} metric="alpha" />)}</tbody></table>
        </div>

        <div className="chartbox">
          <h3>🕒 Trades recentes</h3>
          <table>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td className="mono"><Link href={`/stocks/${t.ticker}`}>{t.ticker}</Link></td>
                  <td className={t.tx_type === 'purchase' ? 'buy' : 'sell'}>
                    {t.tx_type === 'purchase' ? 'Compra' : 'Venda'}
                  </td>
                  <td className="muted" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.politician?.full_name}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmtAmount(t.amount_min, t.amount_max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0' }}><Link href="/trades" className="muted">Ver todas as trades →</Link></p>
        </div>
      </div>
    </>
  );
}
