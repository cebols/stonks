import { supabase, type Trade } from '@/lib/supabase';
import TradesTable from '@/components/TradesTable';

export const revalidate = 3600; // revalida de hora em hora

type Row = Trade & { politician: { full_name: string; chamber: string; party: string | null } | null };

async function getRecentTrades(): Promise<Row[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*, politician:politicians(full_name, chamber, party)')
    .order('transaction_date', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as unknown as Row[];
}

export default async function HomePage() {
  const rows = await getRecentTrades();
  return (
    <>
      <h2>Trades mais recentes</h2>
      <p className="muted">
        100 transações mais recentes divulgadas sob o STOCK Act. A coluna <strong>Delay</strong> mostra
        quantos dias se passaram entre a transação e a divulgação — quanto maior, menos útil como sinal.
      </p>
      <TradesTable rows={rows} />
    </>
  );
}
