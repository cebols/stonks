import { getSupabase, type PoliticianSummary } from '@/lib/supabase';
import PoliticiansExplorer from '@/components/PoliticiansExplorer';

export const dynamic = 'force-dynamic';

async function getLeaderboard(): Promise<PoliticianSummary[]> {
  const { data, error } = await getSupabase()
    .from('politician_summary')
    .select('*')
    .gte('scored_trades', 5) // amostra mínima para ter significado
    .order('avg_alpha', { ascending: false });
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as PoliticianSummary[];
}

export default async function LeaderboardPage() {
  const rows = await getLeaderboard();
  return (
    <>
      <h2>Leaderboard — aggregate track record</h2>
      <p className="muted">
        Average alpha and win rate across <strong>all</strong> scored trades (min. 5), not just the
        winners. Alpha = asset excess return vs benchmark, sign-adjusted for sells. It's an estimate:
        the law only discloses value ranges and there's a disclosure delay.
      </p>
      <PoliticiansExplorer rows={rows} initialSort={{ key: 'avg_alpha', dir: 'desc' }} />
    </>
  );
}
