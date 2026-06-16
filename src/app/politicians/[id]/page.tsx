import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabase, type PoliticianSummary, type Trade } from '@/lib/supabase';
import TradesExplorer, { type TradeRow } from '@/components/TradesExplorer';
import PortfolioCharts from '@/components/PortfolioCharts';
import PerformanceCurve, { type PerfTrade } from '@/components/PerformanceCurve';
import Comparator from '@/components/Comparator';
import { fmtPct, pctClass } from '@/lib/format';

export const dynamic = 'force-dynamic';

type TradeWithPerf = Trade & {
  perf: { return_pct: number | null; benchmark_return_pct: number | null; cdi_return_pct: number | null } | { return_pct: number | null; benchmark_return_pct: number | null; cdi_return_pct: number | null }[] | null;
};

async function getData(id: string) {
  const supabase = getSupabase();
  const [summary, trades, all] = await Promise.all([
    supabase.from('politician_summary').select('*').eq('id', id).maybeSingle(),
    supabase.from('trades')
      .select('*, perf:trade_performance(return_pct, benchmark_return_pct, cdi_return_pct)')
      .eq('politician_id', id)
      .order('transaction_date', { ascending: false, nullsFirst: false }).limit(2000),
    supabase.from('politician_summary').select('*').gte('scored_trades', 1).order('full_name'),
  ]);
  return {
    summary: summary.data as PoliticianSummary | null,
    trades: (trades.data ?? []) as unknown as TradeWithPerf[],
    all: (all.data ?? []) as PoliticianSummary[],
  };
}

function toPerfTrades(trades: TradeWithPerf[]): PerfTrade[] {
  return trades.map((t) => {
    const p = Array.isArray(t.perf) ? t.perf[0] : t.perf;
    return {
      ticker: t.ticker, asset_type: t.asset_type, tx_type: t.tx_type,
      transaction_date: t.transaction_date, amount_min: t.amount_min, amount_max: t.amount_max,
      return_pct: p?.return_pct ?? null,
      benchmark_return_pct: p?.benchmark_return_pct ?? null,
      cdi_return_pct: p?.cdi_return_pct ?? null,
    };
  });
}

export default async function PoliticianPage({ params }: { params: { id: string } }) {
  const { summary, trades, all } = await getData(params.id);
  if (!summary) notFound();
  const perfTrades = toPerfTrades(trades);

  return (
    <>
      <p style={{ margin: '0 0 4px' }}><Link href="/politicians" className="muted">← Políticos</Link></p>
      <h2 style={{ marginTop: 0, marginBottom: 6 }}>{summary.full_name}</h2>
      {summary.committees && summary.committees.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {summary.committees.map((c) => <span key={c} className="tag">{c}</span>)}
        </div>
      )}

      <div className="cards">
        <div className="card"><div className="val">{summary.total_trades}</div><div className="lbl">trades totais</div></div>
        <div className="card"><div className="val">{summary.stock_trades}</div><div className="lbl">em ações</div></div>
        <div className="card">
          <div className={`val ${pctClass(summary.avg_alpha)}`}>{fmtPct(summary.avg_alpha)}</div>
          <div className="lbl">alpha médio vs benchmark</div>
        </div>
        <div className="card">
          <div className="val">{summary.win_rate != null ? `${summary.win_rate}%` : '—'}</div>
          <div className="lbl">win rate ({summary.scored_trades} pontuadas)</div>
        </div>
        <div className="card">
          <div className="val">{summary.avg_disclosure_delay_days != null ? `${summary.avg_disclosure_delay_days}d` : '—'}</div>
          <div className="lbl">delay médio de divulgação</div>
        </div>
      </div>

      <h2>Carteira</h2>
      <PortfolioCharts trades={trades} />
      <PerformanceCurve trades={perfTrades} />

      <h2>Comparar com outros</h2>
      <Comparator politicians={all} initialIds={[summary.id]} />

      <h2>Histórico de trades</h2>
      <TradesExplorer rows={trades.map((t) => ({ ...t, politician: null })) as TradeRow[]} hidePolitician />
    </>
  );
}
