import { createClient } from '@supabase/supabase-js';

// Client de leitura (browser/server components). Usa a chave anon — só SELECT,
// protegido por RLS no banco. A escrita acontece só nos scripts (service role).
//
// Fallbacks evitam que o `next build` quebre quando as env vars ainda não foram
// configuradas: nesse caso as queries falham e as páginas mostram estado vazio.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'anon-key-not-set';

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});

export type Trade = {
  id: string;
  politician_id: string;
  transaction_date: string | null;
  disclosure_date: string | null;
  ticker: string | null;
  asset_description: string | null;
  asset_type: string | null;
  tx_type: string | null;
  owner: string | null;
  amount_min: number | null;
  amount_max: number | null;
  disclosure_delay_days: number | null;
};

export type Politician = {
  id: string;
  full_name: string;
  chamber: 'house' | 'senate';
  party: string | null;
  state: string | null;
};

export type TrackRecord = {
  id: string;
  full_name: string;
  chamber: string;
  party: string | null;
  state: string | null;
  scored_trades: number;
  avg_alpha: number | null;
  win_rate: number | null;
  avg_disclosure_delay_days: number | null;
};
