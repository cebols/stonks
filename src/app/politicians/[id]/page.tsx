import { notFound } from 'next/navigation';
import { getSupabase, type Politician, type Trade, type TrackRecord } from '@/lib/supabase';
import TradesTable from '@/components/TradesTable';
import { fmtPct, pctClass, partyLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function getData(id: string) {
  const supabase = getSupabase();
  const [pol, trades, record] = await Promise.all([
    supabase.from('politicians').select('*').eq('id', id).single(),
    supabase.from('trades').select('*').eq('politician_id', id)
      .order('transaction_date', { ascending: false, nullsFirst: false }).limit(200),
    supabase.from('politician_track_record').select('*').eq('id', id).maybeSingle(),
  ]);
  return {
    politician: pol.data as Politician | null,
    trades: (trades.data ?? []) as Trade[],
    record: record.data as TrackRecord | null,
  };
}

export default async function PoliticianPage({ params }: { params: { id: string } }) {
  const { politician, trades, record } = await getData(params.id);
  if (!politician) notFound();

  return (
    <>
      <h2>
        {politician.full_name}{' '}
        <span className="muted" style={{ fontSize: 13 }}>
          · {politician.chamber === 'senate' ? 'Senado' : 'Câmara'} · {partyLabel(politician.party)}
          {politician.state ? ` · ${politician.state}` : ''}
        </span>
      </h2>

      <div className="cards">
        <div className="card">
          <div className="val">{trades.length}</div>
          <div className="lbl">trades registradas</div>
        </div>
        <div className="card">
          <div className="val">{record?.scored_trades ?? 0}</div>
          <div className="lbl">trades pontuadas</div>
        </div>
        <div className="card">
          <div className={`val ${pctClass(record?.avg_alpha)}`}>{fmtPct(record?.avg_alpha)}</div>
          <div className="lbl">alpha médio vs S&P</div>
        </div>
        <div className="card">
          <div className="val">{record?.win_rate != null ? `${record.win_rate}%` : '—'}</div>
          <div className="lbl">win rate</div>
        </div>
        <div className="card">
          <div className="val">{record?.avg_disclosure_delay_days != null ? `${record.avg_disclosure_delay_days}d` : '—'}</div>
          <div className="lbl">delay médio de divulgação</div>
        </div>
      </div>

      <h2>Histórico de trades</h2>
      <TradesTable rows={trades} showPolitician={false} />
    </>
  );
}
