import Link from 'next/link';
import { supabase, type Politician } from '@/lib/supabase';
import { partyLabel } from '@/lib/format';

export const revalidate = 3600;

async function getPoliticians(): Promise<Politician[]> {
  const { data, error } = await supabase
    .from('politicians')
    .select('*')
    .order('full_name', { ascending: true });
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as Politician[];
}

export default async function PoliticiansPage() {
  const rows = await getPoliticians();
  return (
    <>
      <h2>Políticos ({rows.length})</h2>
      {!rows.length ? (
        <p className="muted">Sem dados ainda. Rode <code>npm run ingest</code>.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Nome</th><th>Câmara</th><th>Partido</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/politicians/${p.id}`}>{p.full_name}</Link></td>
                <td>{p.chamber === 'senate' ? 'Senado' : 'Câmara'}</td>
                <td>{partyLabel(p.party)}</td>
                <td>{p.state ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
