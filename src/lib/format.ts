export function fmtDate(d: string | null): string {
  if (!d) return '—';
  return d;
}

export function fmtAmount(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—';
  const f = (n: number) => '$' + n.toLocaleString('en-US');
  if (min != null && max != null && min !== max) return `${f(min)} – ${f(max)}`;
  return f((min ?? max) as number);
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  const s = n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

export function pctClass(n: number | null | undefined): string {
  if (n == null) return 'muted';
  return n >= 0 ? 'pos' : 'neg';
}

export function partyLabel(p: string | null): string {
  if (!p) return '—';
  const m: Record<string, string> = { D: 'Dem', R: 'Rep', I: 'Ind' };
  return m[p] ?? p;
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
