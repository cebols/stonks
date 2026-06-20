import { getSupabase, type PoliticianSummary } from '@/lib/supabase';
import PoliticiansExplorer from '@/components/PoliticiansExplorer';

export const dynamic = 'force-dynamic';

async function getPoliticians(): Promise<PoliticianSummary[]> {
  const { data, error } = await getSupabase()
    .from('politician_summary')
    .select('*')
    .order('total_trades', { ascending: false });
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as PoliticianSummary[];
}

export default async function PoliticiansPage() {
  const rows = await getPoliticians();
  return (
    <>
      <h2>Politicians</h2>
      <p className="muted">
        Filter and sort by trade volume, average alpha or win rate. Click a name to see the
        portfolio and history. <a href="/compare">Compare politicians →</a>
      </p>
      <PoliticiansExplorer rows={rows} />
    </>
  );
}
