// Janelas de tempo para cortar os gráficos por data da transação.
// Usado tanto no cliente (componentes de gráfico) quanto no servidor (/api/curve).
export type Range = '7' | '15' | '30' | '90' | '180' | '360' | 'ytd' | 'all';

export const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: '7', label: '7d' },
  { value: '15', label: '15d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '180', label: '180d' },
  { value: '360', label: '360d' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All' },
];

// Data de corte (YYYY-MM-DD) ou null para "tudo".
export function cutoffISO(range: Range): string | null {
  if (range === 'all') return null;
  if (range === 'ytd') return `${new Date().getUTCFullYear()}-01-01`;
  const days = Number(range);
  if (!Number.isFinite(days)) return null;
  return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
}

export function withinRange(dateISO: string | null, range: Range): boolean {
  const c = cutoffISO(range);
  if (!c) return true;
  if (!dateISO) return false;
  return dateISO >= c;
}
