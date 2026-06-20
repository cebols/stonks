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

// Executa fn sobre items com concorrência limitada.
export async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// Fechamentos diários de um ticker via Yahoo Finance (grátis, sem chave).
// Retorna [{ date:'YYYY-MM-DD', close }] em ordem crescente, ou [] se falhar.
export async function fetchYahooDailyCloses(ticker, startISO = '2012-01-01') {
  const p1 = Math.floor(new Date(startISO + 'T00:00:00Z').getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  // Yahoo usa '-' no lugar de '.' (ex.: BRK.B -> BRK-B).
  const symbols = [ticker, ticker.replace(/\./g, '-')].filter((s, i, a) => a.indexOf(s) === i);
  for (const sym of symbols) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=1d`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      const ts = r?.timestamp;
      const cl = r?.indicators?.quote?.[0]?.close;
      if (!ts || !cl) continue;
      const out = [];
      for (let i = 0; i < ts.length; i++) {
        const c = cl[i];
        if (c == null) continue;
        out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
      }
      if (out.length) return out;
    } catch { /* tenta próximo símbolo */ }
  }
  return [];
}

// Último fechamento com date <= alvo (busca binária; série crescente).
export function closeOnOrBefore(series, targetISO) {
  if (!series || series.length === 0) return null;
  let lo = 0, hi = series.length - 1, pos = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= targetISO) { pos = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return pos >= 0 ? series[pos].close : series[0].close;
}

// Normaliza um nome para "primeiro último" (sem acentos/pontuação/sufixos),
// usado para casar nossos filer_name com a base de legisladores.
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
export function nameKey(name) {
  const toks = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/)
    .filter((t) => t && !SUFFIXES.has(t));
  if (toks.length < 2) return toks.join(' ');
  return `${toks[0]} ${toks[toks.length - 1]}`;
}

// Mapa "primeiro último" -> [nomes de comitês] a partir de
// unitedstates/congress-legislators (membros atuais). Gratuito, sem chave.
export async function fetchCommitteesByName() {
  const BASE = 'https://unitedstates.github.io/congress-legislators';
  const [legs, committees, membership] = await Promise.all([
    fetchJSON(`${BASE}/legislators-current.json`),
    fetchJSON(`${BASE}/committees-current.json`),
    fetchJSON(`${BASE}/committee-membership-current.json`),
  ]);

  // code -> nome do comitê
  const nameByCode = new Map();
  for (const c of committees) {
    const code = c.thomas_id || c.house_committee_id || c.senate_committee_id;
    if (code) nameByCode.set(code, c.name);
  }
  // bioguide -> Set(nomes de comitês) — só comitês "raiz" (ignora subcomitês,
  // cujos códigos têm mais de 4 chars).
  const byBioguide = new Map();
  for (const [code, members] of Object.entries(membership)) {
    const cname = nameByCode.get(code);
    if (!cname || code.length > 4) continue;
    for (const m of members) {
      if (!m.bioguide) continue;
      if (!byBioguide.has(m.bioguide)) byBioguide.set(m.bioguide, new Set());
      byBioguide.get(m.bioguide).add(cname);
    }
  }
  // nome normalizado -> bioguide
  const byName = new Map();
  for (const l of legs) {
    const full = l.name.official_full || `${l.name.first} ${l.name.last}`;
    const bg = l.id && l.id.bioguide;
    if (!bg) continue;
    const cs = byBioguide.get(bg);
    if (cs) byName.set(nameKey(full), [...cs].sort());
  }
  return byName;
}

// Série diária do CDI (Banco Central — SGS 12), como índice acumulado.
// Retorna [{ date: 'YYYY-MM-DD', cum }] em ordem crescente. cum = fator
// acumulado (produto de 1 + taxa_diária). Gratuito, sem chave.
export async function fetchCDIIndex(startISO = '2012-01-01') {
  const startYear = Number(startISO.slice(0, 4));
  const nowYear = new Date().getUTCFullYear();
  const base = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados';
  const seen = new Map(); // dataISO -> valor (dedup entre janelas)

  // A API limita cada request a ~10 anos; buscamos em janelas de 9 anos.
  for (let y = startYear; y <= nowYear; y += 9) {
    const end = Math.min(y + 9, nowYear);
    const url = `${base}?formato=json&dataInicial=01/01/${y}&dataFinal=31/12/${end}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) continue;
    for (const r of await res.json()) {
      const [dd, mm, yy] = String(r.data).split('/');
      const v = Number(r.valor);
      if (dd && Number.isFinite(v)) seen.set(`${yy}-${mm}-${dd}`, v);
    }
    if (end >= nowYear) break;
  }

  const out = [];
  let cum = 1;
  for (const date of [...seen.keys()].sort()) {
    cum *= 1 + seen.get(date) / 100;
    out.push({ date, cum });
  }
  if (out.length === 0) throw new Error('série CDI vazia');
  return out;
}

// Retorno % do CDI acumulado da data `fromISO` até o fim da série (≈ hoje).
export function cdiReturnSince(index, fromISO) {
  if (!index || index.length === 0 || !fromISO) return null;
  const last = index[index.length - 1].cum;
  // busca binária: último ponto com date <= fromISO.
  let lo = 0, hi = index.length - 1, pos = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (index[mid].date <= fromISO) { pos = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const base = pos >= 0 ? index[pos].cum : index[0].cum;
  return (last / base - 1) * 100;
}
