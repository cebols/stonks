import { createClient } from '@supabase/supabase-js';

// Client de leitura (browser/server components). Usa a chave anon — só SELECT,
// protegido por RLS no banco. A escrita acontece só nos scripts (service role).
//
// IMPORTANTE: o client é criado de forma PREGUIÇOSA (lazy). Se construíssemos no
// topo do módulo, o simples `import` desta lib durante o `next build` (etapa
// "Collecting page data") já tentaria instanciar o client e quebraria com
// "supabaseKey is required" quando as env vars não estão presentes no build.
// Criando sob demanda, o build nunca precisa das chaves — só o runtime (SSR).
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'anon-key-not-set';
  _client = createClient(url, anonKey, { auth: { persistSession: false } });
  return _client;
}

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
  is_opening: boolean | null;
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

export type PoliticianSummary = {
  id: string;
  full_name: string;
  chamber: 'house' | 'senate';
  party: string | null;
  state: string | null;
  committees: string[] | null;
  total_trades: number;
  stock_trades: number;
  scored_trades: number;
  avg_alpha: number | null;
  win_rate: number | null;
  avg_disclosure_delay_days: number | null;
  last_traded: string | null;
};

export type GlobalStats = {
  total_trades: number;
  trades_30d: number;
  politicians: number;
  stocks: number;
  avg_delay: number | null;
  total_volume: number | null;
};

export type TickerSummary = {
  ticker: string;
  asset_description: string | null;
  trade_count: number;
  filer_count: number;
  purchases: number;
  sales: number;
  est_volume: number | null;
  buy_volume: number | null;
  sell_volume: number | null;
  net_volume: number | null;
  scored_trades: number;
  avg_alpha: number | null;
  win_rate: number | null;
  last_traded: string | null;
};
