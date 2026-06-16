import { getSupabase } from '@/lib/supabase';
import Signals, { type SignalBuy, type SignalSummary } from '@/components/Signals';

export const dynamic = 'force-dynamic';

async function getData() {
  const supabase = getSupabase();
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const [buys, sums] = await Promise.all([
    supabase.from('trades')
      .select('ticker, politician_id, asset_type, transaction_date, amount_min, amount_max, politician:politicians(full_name)')
      .eq('tx_type', 'purchase').not('ticker', 'is', null)
      .gte('transaction_date', since)
      .order('transaction_date', { ascending: false }).limit(1000),
    supabase.from('politician_summary').select('id, full_name, avg_alpha, scored_trades'),
  ]);
  return {
    buys: (buys.data ?? []) as unknown as SignalBuy[],
    summaries: (sums.data ?? []) as SignalSummary[],
  };
}

export default async function SignalsPage() {
  const { buys, summaries } = await getData();
  return (
    <>
      <h2>Sinais</h2>
      <p className="muted">
        Sinais de decisão a partir das compras recentes: <strong>cluster buys</strong> (mesma ação
        comprada por vários políticos numa janela curta) e <strong>smart money</strong> (compras
        feitas por políticos de melhor track record). Use como ponto de partida de pesquisa, não
        gatilho de compra.
      </p>
      <Signals buys={buys} summaries={summaries} />
    </>
  );
}
