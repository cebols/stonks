'use client';
import { ReactNode } from 'react';
import { Range, RANGE_OPTIONS } from '@/lib/range';

export type SortDir = 'asc' | 'desc';
export type Sort<K extends string> = { key: K; dir: SortDir };

export function Toolbar({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <div className="toolbar">
      {children}
      {count != null && <span className="count">{count}</span>}
    </div>
  );
}

export function TextFilter({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SelectFilter<T extends string>({
  label, value, onChange, options,
}: {
  label: string; value: T; onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

// Segmented control (ex: categoria Ações/Fundos/Todos).
export function Segmented<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Seletor de janela de tempo (Período) para os gráficos.
export function RangeSelect({ value, onChange }: { value: Range; onChange: (v: Range) => void }) {
  return (
    <label>
      Período
      <select value={value} onChange={(e) => onChange(e.target.value as Range)}>
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// <th> clicável que controla a ordenação.
export function SortTh<K extends string>({
  label, col, sort, setSort, align = 'left', numeric = false,
}: {
  label: string; col: K; sort: Sort<K>; setSort: (s: Sort<K>) => void;
  align?: 'left' | 'right'; numeric?: boolean;
}) {
  const active = sort.key === col;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '';
  function toggle() {
    if (active) setSort({ key: col, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    // padrão: numérico começa desc (maiores primeiro); texto começa asc.
    else setSort({ key: col, dir: numeric ? 'desc' : 'asc' });
  }
  return (
    <th className="sortable" style={{ textAlign: align }} onClick={toggle}>
      {label} <span className="arrow">{arrow}</span>
    </th>
  );
}

// Comparador genérico para sort estável (nulls sempre por último).
export function compareBy<T, K extends string>(key: K, dir: SortDir) {
  const mul = dir === 'asc' ? 1 : -1;
  return (a: T, b: T) => {
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls por último, independente da direção
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  };
}

export const partyOptions = [
  { value: '', label: 'Todos partidos' },
  { value: 'D', label: 'Democrata' },
  { value: 'R', label: 'Republicano' },
  { value: 'I', label: 'Independente' },
];

export const chamberOptions = [
  { value: '', label: 'Câmara + Senado' },
  { value: 'house', label: 'Câmara' },
  { value: 'senate', label: 'Senado' },
];
