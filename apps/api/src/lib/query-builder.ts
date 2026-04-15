import type { AnyColumn, SQL } from 'drizzle-orm';
import { asc, desc } from 'drizzle-orm';

export interface SortItem {
  field: string;
  direction: 'asc' | 'desc';
}

export type SortMap<F extends string> = Record<F, AnyColumn | SQL>;

export function buildOrderBy<F extends string>(
  sort: SortItem[] | undefined,
  map: SortMap<F>,
  fallback: SQL | AnyColumn,
): Array<SQL | AnyColumn> {
  if (!sort || sort.length === 0) return [fallback];
  const out: Array<SQL | AnyColumn> = [];
  for (const s of sort) {
    const col = map[s.field as F];
    if (!col) continue;
    out.push(s.direction === 'desc' ? desc(col) : asc(col));
  }
  return out.length > 0 ? out : [fallback];
}
