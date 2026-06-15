import { getSupabase } from '@/lib/supabase';
import TradesExplorer, { type TradeRow } from '@/components/TradesExplorer';

export const dynamic = 'force-dynamic';

async function getRecentTrades(): Promise<TradeRow[]> {
  const { data, error } = await getSupabase()
    .from('trades')
    .select('*, politician:politicians(full_name)')
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
      <h2>Trades recentes</h2>
      <p className="muted">
        Últimas {rows.length} transações divulgadas sob o STOCK Act. Filtre por categoria ou tipo,
        e ordene por qualquer coluna. <strong>Delay</strong> = dias entre a transação e a divulgação.
      </p>
      <TradesExplorer rows={rows} />
    </>
  );
}
