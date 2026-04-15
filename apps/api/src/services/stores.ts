import { and, count, eq, ilike } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { stores, type StoreRow } from '../db/schema.js';
import type { StoreQueryBody, Store } from '@market/contracts';
import { buildOrderBy } from '../lib/query-builder.js';
import { storeWhere } from '../lib/id-or-slug.js';

export interface StoresService {
  query(body: StoreQueryBody): Promise<{ data: Store[]; total: number }>;
  getByIdOrSlug(idOrSlug: string): Promise<StoreRow | undefined>;
}

function rowToStore(r: StoreRow): Store {
  return {
    id:          r.id,
    slug:        r.slug,
    vendor:      r.vendor,
    vendorSlug:  r.vendorSlug,
    name:        r.name,
    address:     r.address ?? undefined,
    currency:    r.currency,
    productLine: r.productLine ?? undefined,
    online:      r.online,
    location:    r.lat && r.lon ? { lat: Number(r.lat), lon: Number(r.lon) } : undefined,
  };
}

export function createStoresService(db: DbClient): StoresService {
  return {
    async query(body) {
      const conds = [];
      if (body.vendor) conds.push(eq(stores.vendor, body.vendor));
      if (body.productLine) conds.push(eq(stores.productLine, body.productLine));
      if (body.online != null) conds.push(eq(stores.online, body.online));
      if (body.q) conds.push(ilike(stores.name, `%${body.q}%`));
      const where = conds.length ? and(...conds) : undefined;

      const order = buildOrderBy(body.sort, {
        name: stores.name,
        vendor: stores.vendor,
        productLine: stores.productLine,
        lastSeenAt: stores.lastSeenAt,
      }, stores.name);

      const rows = await db.select().from(stores)
        .where(where)
        .orderBy(...order)
        .limit(body.take ?? 50)
        .offset(body.skip ?? 0);

      const [totalRow] = await db.select({ n: count() }).from(stores).where(where);

      return { data: rows.map(rowToStore), total: Number(totalRow?.n ?? 0) };
    },

    async getByIdOrSlug(idOrSlug) {
      return db.query.stores.findFirst({ where: storeWhere(idOrSlug) });
    },
  };
}
