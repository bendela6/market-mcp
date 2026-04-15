import { asc, desc, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

export interface SortItem {
  field: string;
  direction: 'asc' | 'desc';
}

export type OrderByArg = SQL | PgColumn;
export type SortMap<F extends string> = Record<F, OrderByArg>;

export function buildOrderBy<F extends string>(
  sort: SortItem[] | undefined,
  map: SortMap<F>,
  fallback: OrderByArg,
): OrderByArg[] {
  if (!sort || sort.length === 0) return [fallback];
  const out: OrderByArg[] = [];
  for (const s of sort) {
    const col = map[s.field as F];
    if (!col) continue;
    out.push(s.direction === 'desc' ? desc(col) : asc(col));
  }
  return out.length > 0 ? out : [fallback];
}
