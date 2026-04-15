import { eq } from 'drizzle-orm';
import { items, plans, stores } from '../db/schema.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export function storeWhere(idOrSlug: string) {
  return isUuid(idOrSlug) ? eq(stores.id, idOrSlug) : eq(stores.slug, idOrSlug);
}

export function itemWhere(idOrSlug: string) {
  return isUuid(idOrSlug) ? eq(items.id, idOrSlug) : eq(items.slug, idOrSlug);
}

export function planWhere(idOrSlug: string) {
  return isUuid(idOrSlug) ? eq(plans.id, idOrSlug) : eq(plans.slug, idOrSlug);
}
