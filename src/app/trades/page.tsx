import { getSupabase } from '@/lib/supabase';
import TradesExplorer, { type TradeRow } from '@/components/TradesExplorer';

export const dynamic = 'force-dynamic';

async function getRecentTrades(): Promise<TradeRow[]> {
  const { data, error } = await getSupabase()
    .from('trades')
    .select('*, politician:politicians(full_name), prices:trade_prices(entry_price, price_now, open_return_pct, realized_return_pct, matched_buy_date)')
    .order('transaction_date', { ascending: false, nullsFirst: false })
    .limit(1500);
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as unknown as TradeRow[];
}

export default async function TradesPage() {
  const rows = await getRecentTrades();
  return (
    <>
      <h2>Recent trades</h2>
      <p className="muted">
        Latest {rows.length} transactions disclosed under the STOCK Act. Filter by category or type,
        and sort by any column. <strong>Delay</strong> = days between the trade and its disclosure.
      </p>
      <TradesExplorer rows={rows} />
    </>
  );
}
