import { getSupabase, type Trade } from '@/lib/supabase';
import TradesExplorer, { type TradeRow } from '@/components/TradesExplorer';

export const dynamic = 'force-dynamic'; // SSR a cada request (dados sempre frescos)

async function getRecentTrades(): Promise<TradeRow[]> {
  const { data, error } = await getSupabase()
    .from('trades')
    .select('*, politician:politicians(full_name, chamber, party)')
    .order('transaction_date', { ascending: false, nullsFirst: false })
    .limit(1500);
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as unknown as TradeRow[];
}

export default async function HomePage() {
  const rows = await getRecentTrades();
  return (
    <>
      <h2>Trades recentes</h2>
      <p className="muted">
        Últimas {rows.length} transações divulgadas sob o STOCK Act. Filtre por categoria, câmara,
        partido ou tipo, e ordene por qualquer coluna. <strong>Delay</strong> = dias entre a
        transação e a divulgação (quanto maior, menos útil como sinal).
      </p>
      <TradesExplorer rows={rows} />
    </>
  );
}
