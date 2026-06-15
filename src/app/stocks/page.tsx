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
      <h2>Ações</h2>
      <p className="muted">
        Volume estimado de compra/venda por ação, quantos políticos negociaram, e o desempenho
        agregado (alpha/win rate). Ordene por <strong>Vol. compra</strong> para ver as mais compradas,
        ou por <strong>Alpha méd.</strong> (com mín. de políticos) para as de melhor resultado.
      </p>
      <StocksExplorer rows={rows} />
    </>
  );
}
