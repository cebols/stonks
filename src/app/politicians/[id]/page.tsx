import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabase, type PoliticianSummary, type Trade } from '@/lib/supabase';
import TradesTable from '@/components/TradesTable';
import PortfolioCharts from '@/components/PortfolioCharts';
import Comparator from '@/components/Comparator';
import { fmtPct, pctClass } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function getData(id: string) {
  const supabase = getSupabase();
  const [summary, trades, all] = await Promise.all([
    supabase.from('politician_summary').select('*').eq('id', id).maybeSingle(),
    supabase.from('trades').select('*').eq('politician_id', id)
      .order('transaction_date', { ascending: false, nullsFirst: false }).limit(2000),
    supabase.from('politician_summary').select('*').gte('scored_trades', 1).order('full_name'),
  ]);
  return {
    summary: summary.data as PoliticianSummary | null,
    trades: (trades.data ?? []) as Trade[],
    all: (all.data ?? []) as PoliticianSummary[],
  };
}

export default async function PoliticianPage({ params }: { params: { id: string } }) {
  const { summary, trades, all } = await getData(params.id);
  if (!summary) notFound();

  return (
    <>
      <p style={{ margin: '0 0 4px' }}><Link href="/politicians" className="muted">← Políticos</Link></p>
      <h2 style={{ marginTop: 0 }}>{summary.full_name}</h2>

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

      <h2>Comparar com outros</h2>
      <Comparator politicians={all} initialIds={[summary.id]} />

      <h2>Histórico de trades</h2>
      <TradesTable rows={trades} showPolitician={false} />
    </>
  );
}
