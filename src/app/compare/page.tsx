import { getSupabase, type PoliticianSummary } from '@/lib/supabase';
import Comparator from '@/components/Comparator';

export const dynamic = 'force-dynamic';

async function getPoliticians(): Promise<PoliticianSummary[]> {
  const { data, error } = await getSupabase()
    .from('politician_summary')
    .select('*')
    .gte('scored_trades', 1)
    .order('full_name', { ascending: true });
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as PoliticianSummary[];
}

export default async function ComparePage() {
  const politicians = await getPoliticians();
  return (
    <>
      <h2>Comparador de políticos</h2>
      <p className="muted">
        Compare lado a lado o track record (alpha, win rate, delay) de quaisquer políticos.
        Adicione pelo menos dois.
      </p>
      <Comparator politicians={politicians} />
    </>
  );
}
