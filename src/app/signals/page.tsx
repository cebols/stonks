import { getSupabase } from '@/lib/supabase';
import Signals, { type SignalTrade, type SignalSummary } from '@/components/Signals';

export const dynamic = 'force-dynamic';

async function getData() {
  const supabase = getSupabase();
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const [trades, sums] = await Promise.all([
    supabase.from('trades')
      .select('ticker, politician_id, asset_type, tx_type, transaction_date, disclosure_delay_days, amount_min, amount_max, is_opening, politician:politicians(full_name)')
      .not('ticker', 'is', null)
      .gte('transaction_date', since)
      .order('transaction_date', { ascending: false }).limit(1000),
    supabase.from('politician_summary').select('id, full_name, avg_alpha, scored_trades, committees'),
  ]);
  return {
    trades: (trades.data ?? []) as unknown as SignalTrade[],
    summaries: (sums.data ?? []) as SignalSummary[],
  };
}

export default async function SignalsPage() {
  const { trades, summaries } = await getData();
  return (
    <>
      <h2>Sinais</h2>
      <p className="muted">
        Sinais de decisão a partir das trades recentes. Filtre por janela, mínimo de políticos e
        <strong> comitê</strong> (ex: ver compras de quem está em Armed Services). Use como ponto de
        partida de pesquisa, não gatilho de compra.
      </p>
      <Signals trades={trades} summaries={summaries} />
    </>
  );
}
