import { and, count, eq, ilike, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { stores, type StoreRow } from '../db/schema.js';
import type { StoreQueryBody, Store } from '@market/contracts';
import { buildOrderBy } from '../lib/query-builder.js';
import { environment } from '../environment.js';

export interface StoresService {
  query(body: StoreQueryBody): Promise<{ data: Store[]; total: number }>;
  getById(id: string): Promise<StoreRow | undefined>;
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
    vendorData:  r.rawContent ?? undefined,
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

      const refLat = body.lat ?? environment.WOLT_LAT;
      const refLon = body.lon ?? environment.WOLT_LON;

      // Squared-degree distance is monotonic with haversine over a single city
      // and far cheaper. COALESCE large so missing-location rows sink on ASC.
      const distanceExpr = sql`COALESCE(
        (NULLIF(${stores.lat}, '')::float - ${refLat})
          * (NULLIF(${stores.lat}, '')::float - ${refLat})
        + (NULLIF(${stores.lon}, '')::float - ${refLon})
          * (NULLIF(${stores.lon}, '')::float - ${refLon}),
        1e18
      )`;
      const ratingScoreExpr = sql`COALESCE((${stores.rawContent}->'rating'->>'score')::float, 0)`;
      const popularityExpr  = sql`COALESCE((${stores.rawContent}->'rating'->>'volume')::int, 0)`;
      const priceRangeExpr  = sql`COALESCE((${stores.rawContent}->>'price_range')::int, 999)`;
      const etaExpr         = sql`COALESCE((${stores.rawContent}->>'estimate')::int, 99999)`;

      const order = buildOrderBy(body.sort, {
        name: stores.name,
        vendor: stores.vendor,
        productLine: stores.productLine,
        lastSeenAt: stores.lastSeenAt,
        distance: distanceExpr,
        ratingScore: ratingScoreExpr,
        popularity: popularityExpr,
        priceRange: priceRangeExpr,
        eta: etaExpr,
      }, stores.name);

      const rows = await db.select().from(stores)
        .where(where)
        .orderBy(...order)
        .limit(body.take ?? 50)
        .offset(body.skip ?? 0);

      const [totalRow] = await db.select({ n: count() }).from(stores).where(where);

      return { data: rows.map(rowToStore), total: Number(totalRow?.n ?? 0) };
    },

    async getById(id) {
      return db.query.stores.findFirst({ where: eq(stores.id, id) });
    },
  };
}
