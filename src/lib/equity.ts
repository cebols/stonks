// Núcleo da curva de EQUITY REAL (growth of $1, buy-and-hold) a partir das
// séries mensais da tabela `prices`. Compartilhado por /api/equity (escopo
// único: 1 político ou 1 ticker) e /api/curve (vários políticos).
import type { SupabaseClient } from '@supabase/supabase-js';

export type Buy = {
  ticker: string;
  transaction_date: string;
  amount_min: number | null;
  amount_max: number | null;
};

export type Lot = { ticker: string; month: string; w: number; eT: number; eS: number; eC: number };

export const SPY = 'SPY';
export const CDI = '__CDI__';

export const lotWeight = (a: number | null, b: number | null) =>
  Math.max(((a ?? 0) + (b ?? a ?? 0)) / 2, 1);

// Enumera meses 'YYYY-MM' de a até b (inclusive).
export function monthsBetween(a: string, b: string): string[] {
  const out: string[] = [];
  let [y, m] = a.split('-').map(Number);
  const [ey, em] = b.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export type PriceLookup = { priceAt: (ticker: string, month: string) => number | null; spyMonths: string[] };

// Carrega as séries mensais (paginando o limite ~1000 do Supabase) e devolve um
// lookup que retorna o preço de um ticker no mês (ou no último mês anterior).
export async function loadPrices(sb: SupabaseClient, tickers: string[]): Promise<PriceLookup> {
  const wanted = [...new Set([...tickers, SPY, CDI])];
  const rows: { ticker: string; date: string; close: number }[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', wanted)
      .order('date')
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const got = (data ?? []) as { ticker: string; date: string; close: number }[];
    rows.push(...got);
    if (got.length < page) break;
  }

  const byTicker = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, new Map());
    byTicker.get(r.ticker)!.set(m, Number(r.close));
  }
  const sorted = new Map<string, string[]>();
  for (const [tk, m] of byTicker) sorted.set(tk, [...m.keys()].sort());

  const priceAt = (ticker: string, month: string): number | null => {
    const m = byTicker.get(ticker);
    if (!m) return null;
    if (m.has(month)) return m.get(month)!;
    const months = sorted.get(ticker)!;
    let lo = 0, hi = months.length - 1, ans = -1;
    while (lo <= hi) {
      const k = (lo + hi) >> 1;
      if (months[k] <= month) { ans = k; lo = k + 1; } else hi = k - 1;
    }
    return ans >= 0 ? m.get(months[ans])! : null;
  };
  return { priceAt, spyMonths: sorted.get(SPY) ?? [] };
}

// Converte compras em lotes válidos (precisam de preço do ticker, SPY e CDI na
// data da compra). Cada lote guarda o preço de entrada de cada série.
export function toLots(buys: Buy[], priceAt: PriceLookup['priceAt']): Lot[] {
  const lots: Lot[] = [];
  for (const b of buys) {
    const month = b.transaction_date.slice(0, 7);
    const eT = priceAt(b.ticker, month);
    const eS = priceAt(SPY, month);
    const eC = priceAt(CDI, month);
    if (eT == null || eS == null || eC == null) continue;
    lots.push({ ticker: b.ticker, month, w: lotWeight(b.amount_min, b.amount_max), eT, eS, eC });
  }
  return lots;
}

// Retorno acumulado (média ponderada por valor) dos lotes ativos até `month`,
// usando o preço daquele mês. Devolve null quando nenhum lote está ativo.
export function aggregateAt(lots: Lot[], priceAt: PriceLookup['priceAt'], month: string) {
  let den = 0, num = 0, sp = 0, cdi = 0;
  for (const lot of lots) {
    if (lot.month > month) continue;
    const pT = priceAt(lot.ticker, month);
    const pS = priceAt(SPY, month);
    const pC = priceAt(CDI, month);
    if (pT == null || pS == null || pC == null) continue;
    den += lot.w;
    num += lot.w * (pT / lot.eT);
    sp += lot.w * (pS / lot.eS);
    cdi += lot.w * (pC / lot.eC);
  }
  if (den === 0) return null;
  const pct = (x: number) => +((x / den - 1) * 100).toFixed(1);
  return { port: pct(num), sp: pct(sp), cdi: pct(cdi) };
}

// Mês final da linha do tempo: último mês com preço de SPY (fallback: último lote).
export function endMonth(spyMonths: string[], lots: Lot[]): string {
  if (spyMonths.length) return spyMonths[spyMonths.length - 1];
  return lots.reduce((mx, l) => (l.month > mx ? l.month : mx), lots[0].month);
}
