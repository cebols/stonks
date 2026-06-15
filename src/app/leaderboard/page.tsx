import Link from 'next/link';
import { getSupabase, type TrackRecord } from '@/lib/supabase';
import { fmtPct, pctClass, partyLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function getLeaderboard(): Promise<TrackRecord[]> {
  const { data, error } = await getSupabase()
    .from('politician_track_record')
    .select('*')
    .gte('scored_trades', 5) // ignora amostras pequenas demais p/ ter significado
    .order('avg_alpha', { ascending: false })
    .limit(50);
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as TrackRecord[];
}

export default async function LeaderboardPage() {
  const rows = await getLeaderboard();
  return (
    <>
      <h2>Leaderboard — track record agregado</h2>
      <p className="muted">
        Alpha médio e win rate de <strong>todas</strong> as trades pontuadas (mín. 5), não só as vencedoras.
        Alpha = retorno do ativo menos o S&P no mesmo período, com sinal ajustado para vendas.
        É uma estimativa: a lei só divulga faixas de valor e há atraso na divulgação.
      </p>
      {!rows.length ? (
        <p className="muted">Sem dados ainda. Rode <code>npm run pipeline</code>.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th><th>Político</th><th>Câmara</th><th>Partido</th>
              <th>Trades</th><th>Win rate</th><th>Alpha médio</th><th>Delay médio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="muted mono">{i + 1}</td>
                <td><Link href={`/politicians/${r.id}`}>{r.full_name}</Link></td>
                <td>{r.chamber === 'senate' ? 'Senado' : 'Câmara'}</td>
                <td>{partyLabel(r.party)}</td>
                <td className="mono">{r.scored_trades}</td>
                <td className="mono">{r.win_rate != null ? `${r.win_rate}%` : '—'}</td>
                <td className={`mono ${pctClass(r.avg_alpha)}`}>{fmtPct(r.avg_alpha)}</td>
                <td className="mono">{r.avg_disclosure_delay_days != null ? `${r.avg_disclosure_delay_days}d` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
