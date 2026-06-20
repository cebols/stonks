import { getSupabase, type TickerSummary } from '@/lib/supabase';
import StocksExplorer from '@/components/StocksExplorer';

export const dynamic = 'force-dynamic';

async function getTickers(): Promise<TickerSummary[]> {
  const { data, error } = await getSupabase()
    .from('ticker_summary')
    .select('*')
    .order('est_volume', { ascending: false })
    .limit(1000);
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as TickerSummary[];
}

export default async function StocksPage() {
  const rows = await getTickers();
  return (
    <>
      <h2>Stocks</h2>
      <p className="muted">
        Estimated buy/sell volume per stock, how many politicians traded it, and aggregate
        performance (alpha/win rate). Sort by <strong>Buy vol.</strong> to see the most bought, or by
        <strong> Avg alpha</strong> (with a min. number of politicians) for the best performers.
      </p>
      <StocksExplorer rows={rows} />
    </>
  );
}
