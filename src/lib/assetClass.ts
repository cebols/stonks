// Classificação de ativo no cliente — espelha a função asset_class() do SQL
// (supabase/migrations/002_v2_views.sql). Usada no filtro de categoria.
export type AssetClass = 'stock' | 'fund' | 'other';

const FUND = new Set(['ET', 'EF', 'ETF', 'MF', 'MUTUAL FUND', 'HN', 'PE', 'VA', 'FN', 'MA']);
const OTHER = new Set([
  'CB', 'CORPORATE BOND', 'GS', 'MUNICIPAL SECURITY', 'MS', 'OP', 'OPTION',
  'OT', 'OI', 'CT', 'AB', 'OL', 'OTHER',
]);

export function assetClass(assetType: string | null, ticker: string | null): AssetClass {
  const t = (assetType ?? '').toUpperCase();
  if (FUND.has(t)) return 'fund';
  if (OTHER.has(t)) return 'other';
  if (!ticker) return 'other';
  return 'stock';
}

export const CATEGORY_LABELS: Record<AssetClass, string> = {
  stock: 'Ações',
  fund: 'Fundos',
  other: 'Outros',
};

// midpoint da faixa de valor (estimativa de volume por trade).
export function amountMid(min: number | null, max: number | null): number {
  return (min ?? 0) + ((max ?? min ?? 0) - (min ?? 0)) / 2;
}
