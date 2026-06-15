// Helpers compartilhados pelos scripts do pipeline (ingestão, preços, performance).
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Faltam variáveis de ambiente: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// slug estável para o id do político (ex: "Nancy Pelosi" -> "nancy-pelosi")
export function slugify(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// id determinístico de uma trade: mesmo registro nunca duplica entre execuções.
export function tradeId(parts) {
  return createHash('sha1').update(parts.join('|')).digest('hex');
}

// "$1,001 - $15,000" -> { min: 1001, max: 15000 }
export function parseAmountRange(raw) {
  if (!raw) return { min: null, max: null };
  const nums = String(raw)
    .replace(/[$,]/g, '')
    .match(/\d+(\.\d+)?/g);
  if (!nums || nums.length === 0) return { min: null, max: null };
  const min = Number(nums[0]);
  const max = nums.length > 1 ? Number(nums[1]) : min;
  return { min, max };
}

// Normaliza tipo de transação para purchase | sale | exchange.
export function normalizeTxType(raw) {
  const t = String(raw || '').toLowerCase();
  if (t.includes('purchase') || t.includes('buy')) return 'purchase';
  if (t.includes('sale') || t.includes('sell')) return 'sale';
  if (t.includes('exchange')) return 'exchange';
  return t || null;
}

// Normaliza ticker; "--", "", "N/A" viram null.
export function normalizeTicker(raw) {
  const t = String(raw || '').trim().toUpperCase();
  if (!t || t === '--' || t === 'N/A' || t === '-') return null;
  return t;
}

// Converte data em vários formatos (MM/DD/YYYY, YYYY-MM-DD) para ISO YYYY-MM-DD.
export function toISODate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

// Faz upsert em lotes para não estourar limites de payload.
export async function upsertInChunks(supabase, table, rows, conflict, chunk = 500) {
  let total = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from(table).upsert(slice, { onConflict: conflict });
    if (error) throw new Error(`Erro no upsert em ${table}: ${error.message}`);
    total += slice.length;
  }
  return total;
}

export async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'stonks-ingest' } });
  if (!res.ok) throw new Error(`Falha ao buscar ${url}: HTTP ${res.status}`);
  return res.json();
}
