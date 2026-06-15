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
      <h2>Leaderboard — track record agregado</h2>
      <p className="muted">
        Alpha médio e win rate de <strong>todas</strong> as trades pontuadas (mín. 5), não só as
        vencedoras. Alpha = excesso de retorno do ativo vs benchmark, com sinal ajustado para vendas.
        É estimativa: a lei só divulga faixas de valor e há atraso na divulgação.
      </p>
      <PoliticiansExplorer rows={rows} initialSort={{ key: 'avg_alpha', dir: 'desc' }} />
    </>
  );
}
