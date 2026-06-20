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
      <h2>Compare politicians</h2>
      <p className="muted">
        Compare side by side the track record (alpha, win rate, delay) of any politicians.
        Add at least two.
      </p>
      <Comparator politicians={politicians} />
    </>
  );
}
