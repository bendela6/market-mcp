import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import type {
  AssortmentCategory,
  Product,
  Venue as VendorVenue,
  VendorId,
} from '@market/vendor-core';
import { buildStoreSlug, buildCategorySlug, buildItemSlug } from '@market/vendor-core';
import type { DbClient } from '../db/client.js';
import {
  categories,
  embeddingJobs,
  itemEmbeddings,
  items,
  priceObservations,
  stores,
  type StoreRow,
} from '../db/schema.js';
import type { Embedder } from '../embeddings/index.js';
import type { ItemQueryBody, Item, CatalogStatsResponse } from '@market/contracts';
import { buildOrderBy } from '../lib/query-builder.js';
import { itemWhere, isUuid } from '../lib/id-or-slug.js';

export interface HybridItemHit {
  id: string;
  slug: string;
  vendor: VendorId;
  storeId: string;
  storeSlug: string;
  storeName: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  gtin: string | null;
  imageUrl: string | null;
  available: boolean;
  deliveryPriceInt: number | null;
  score: number | null;
}

export interface CatalogService {
  upsertStores(vendor: VendorId, list: VendorVenue[]): Promise<void>;
  upsertCategories(vendor: VendorId, storeVendorSlug: string, cats: AssortmentCategory[]): Promise<void>;
  upsertItems(vendor: VendorId, storeVendorSlug: string, products: Product[]): Promise<number>;
  touchStoreAssortmentRefresh(vendor: VendorId, storeVendorSlug: string): Promise<void>;

  queryItems(body: ItemQueryBody, embedder: Embedder): Promise<{ data: Item[]; total: number }>;
  getItemByIdOrSlug(idOrSlug: string): Promise<Item | undefined>;
  searchItemsForPlan(query: string, embedder: Embedder, limit: number): Promise<HybridItemHit[]>;
  searchItemsByBarcodeForPlan(gtin: string): Promise<HybridItemHit[]>;
  stats(): Promise<CatalogStatsResponse>;
}

function mapVendorToStoreInsert(vendor: VendorId, v: VendorVenue) {
  return {
    vendor,
    slug: buildStoreSlug(vendor, v.slug),
    vendorSlug: v.slug,
    name: v.name,
    productLine: (v.productLine ?? null) as StoreRow['productLine'],
    online: v.online ?? false,
    currency: v.currency ?? 'GEL',
    lat: v.location?.lat != null ? String(v.location.lat) : null,
    lon: v.location?.lon != null ? String(v.location.lon) : null,
    address: v.address ?? null,
    rawContent: (v.raw ?? null) as unknown as object | null,
    lastSeenAt: new Date(),
  };
}

function hydrateHit(row: Record<string, unknown>): HybridItemHit {
  return {
    id: row.id as string,
    slug: row.slug as string,
    vendor: row.vendor as VendorId,
    storeId: row.store_id as string,
    storeSlug: row.store_slug as string,
    storeName: (row.store_name as string) ?? '',
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    priceMinor: Number(row.price_minor),
    currency: row.currency as string,
    gtin: (row.gtin as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    available: Boolean(row.available),
    deliveryPriceInt: null,
    score: row.score != null ? Number(row.score) : null,
  };
}

function hitToItem(h: HybridItemHit): Item {
  return {
    id: h.id,
    slug: h.slug,
    vendor: h.vendor,
    storeId: h.storeId,
    storeSlug: h.storeSlug,
    storeName: h.storeName,
    name: h.name,
    description: h.description ?? undefined,
    priceMinor: h.priceMinor,
    currency: h.currency,
    gtin: h.gtin ?? undefined,
    imageUrl: h.imageUrl ?? undefined,
    available: h.available,
    score: h.score ?? undefined,
  };
}

export function createCatalogService(db: DbClient): CatalogService {
  return {
    async upsertStores(vendor, list) {
      if (list.length === 0) return;
      const rows = list.map((v) => mapVendorToStoreInsert(vendor, v));
      await db
        .insert(stores)
        .values(rows)
        .onConflictDoUpdate({
          target: [stores.vendor, stores.vendorSlug],
          set: {
            slug: sql`excluded.slug`,
            name: sql`excluded.name`,
            productLine: sql`excluded.product_line`,
            online: sql`excluded.online`,
            currency: sql`excluded.currency`,
            lat: sql`excluded.lat`,
            lon: sql`excluded.lon`,
            address: sql`excluded.address`,
            rawContent: sql`excluded.raw_content`,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        });
    },

    async upsertCategories(vendor, storeVendorSlug, cats) {
      const storeRow = await db.query.stores.findFirst({
        where: and(eq(stores.vendor, vendor), eq(stores.vendorSlug, storeVendorSlug)),
      });
      if (!storeRow) return;
      const flat: Array<{
        storeId: string;
        slug: string;
        vendorSlug: string;
        parentSlug: string | null;
        name: string;
        position: number | null;
      }> = [];
      let pos = 0;
      const walk = (list: AssortmentCategory[], parent: string | null) => {
        for (const c of list) {
          flat.push({
            storeId: storeRow.id,
            slug: buildCategorySlug(storeRow.slug, c.slug),
            vendorSlug: c.slug,
            parentSlug: parent,
            name: c.name,
            position: pos++,
          });
          if (c.subcategories?.length) walk(c.subcategories, c.slug);
        }
      };
      walk(cats, null);
      if (flat.length === 0) return;
      await db
        .insert(categories)
        .values(flat)
        .onConflictDoUpdate({
          target: [categories.storeId, categories.vendorSlug],
          set: {
            slug: sql`excluded.slug`,
            parentSlug: sql`excluded.parent_slug`,
            name: sql`excluded.name`,
            position: sql`excluded.position`,
          },
        });
    },

    async upsertItems(vendor, storeVendorSlug, products) {
      if (products.length === 0) return 0;
      const storeRow = await db.query.stores.findFirst({
        where: and(eq(stores.vendor, vendor), eq(stores.vendorSlug, storeVendorSlug)),
      });
      if (!storeRow) return 0;

      const rows = products.map((p) => ({
        storeId: storeRow.id,
        slug: buildItemSlug(storeRow.slug, p.name, p.id),
        vendor,
        vendorItemId: p.id,
        name: p.name,
        description: p.description ?? null,
        gtin: p.gtin ?? null,
        imageUrl: p.images[0] ?? null,
        priceMinor: p.price,
        currency: p.currency,
        available: !p.disabled,
        tags: p.tags ?? [],
        lastSeenAt: new Date(),
      }));

      const inserted = await db
        .insert(items)
        .values(rows)
        .onConflictDoUpdate({
          target: [items.storeId, items.vendorItemId],
          set: {
            slug: sql`excluded.slug`,
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            gtin: sql`excluded.gtin`,
            imageUrl: sql`excluded.image_url`,
            priceMinor: sql`excluded.price_minor`,
            currency: sql`excluded.currency`,
            available: sql`excluded.available`,
            tags: sql`excluded.tags`,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        })
        .returning({ id: items.id, priceMinor: items.priceMinor, currency: items.currency, available: items.available });

      if (inserted.length > 0) {
        await db.insert(priceObservations).values(
          inserted.map((r) => ({
            itemId: r.id,
            priceMinor: r.priceMinor,
            currency: r.currency,
            available: r.available,
          })),
        );
        await db
          .insert(embeddingJobs)
          .values(inserted.map((r) => ({ itemId: r.id })))
          .onConflictDoNothing();
      }
      return inserted.length;
    },

    async touchStoreAssortmentRefresh(vendor, storeVendorSlug) {
      await db
        .update(stores)
        .set({ lastAssortmentRefreshAt: new Date() })
        .where(and(eq(stores.vendor, vendor), eq(stores.vendorSlug, storeVendorSlug)));
    },

    async queryItems(body, embedder) {
      const hasQ = !!(body.q && body.q.trim().length > 0);

      if (hasQ) {
        const q = body.q!.trim();
        const mode = body.mode ?? 'hybrid';
        const limit = body.take ?? 50;
        const offset = body.skip ?? 0;

        let hits: HybridItemHit[];
        if (mode === 'keyword') {
          hits = await searchKeyword(db, q, limit + offset);
        } else {
          hits = await searchHybrid(db, embedder, q, limit + offset);
        }
        const paged = hits.slice(offset, offset + limit);
        return {
          data: paged.map(hitToItem),
          total: hits.length,
        };
      }

      const conds = [];
      if (body.vendor) conds.push(eq(items.vendor, body.vendor));
      if (body.available != null) conds.push(eq(items.available, body.available));
      if (body.minPriceMinor != null) conds.push(sql`${items.priceMinor} >= ${body.minPriceMinor}`);
      if (body.maxPriceMinor != null) conds.push(sql`${items.priceMinor} <= ${body.maxPriceMinor}`);
      if (body.storeIdOrSlug) {
        const storeId = await resolveStoreId(db, body.storeIdOrSlug);
        if (!storeId) return { data: [], total: 0 };
        conds.push(eq(items.storeId, storeId));
      }
      if (body.categoryIdOrSlug) {
        const catId = await resolveCategoryId(db, body.categoryIdOrSlug);
        if (!catId) return { data: [], total: 0 };
        conds.push(eq(items.categoryId, catId));
      }
      const where = conds.length ? and(...conds) : undefined;

      const order = buildOrderBy(body.sort, {
        name: items.name,
        priceMinor: items.priceMinor,
        relevance: items.name,
      }, items.name);

      const rows = await db
        .select({
          id: items.id,
          slug: items.slug,
          vendor: items.vendor,
          storeId: items.storeId,
          storeSlug: stores.slug,
          storeName: stores.name,
          name: items.name,
          description: items.description,
          priceMinor: items.priceMinor,
          currency: items.currency,
          gtin: items.gtin,
          imageUrl: items.imageUrl,
          available: items.available,
        })
        .from(items)
        .innerJoin(stores, eq(stores.id, items.storeId))
        .where(where)
        .orderBy(...order)
        .limit(body.take ?? 50)
        .offset(body.skip ?? 0);

      const [{ n }] = await db.select({ n: count() }).from(items).where(where);

      return {
        data: rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          vendor: r.vendor,
          storeId: r.storeId,
          storeSlug: r.storeSlug,
          storeName: r.storeName,
          name: r.name,
          description: r.description ?? undefined,
          priceMinor: r.priceMinor,
          currency: r.currency,
          gtin: r.gtin ?? undefined,
          imageUrl: r.imageUrl ?? undefined,
          available: r.available,
        })),
        total: Number(n),
      };
    },

    async getItemByIdOrSlug(idOrSlug) {
      const row = await db
        .select({
          id: items.id,
          slug: items.slug,
          vendor: items.vendor,
          storeId: items.storeId,
          storeSlug: stores.slug,
          storeName: stores.name,
          name: items.name,
          description: items.description,
          priceMinor: items.priceMinor,
          currency: items.currency,
          gtin: items.gtin,
          imageUrl: items.imageUrl,
          available: items.available,
        })
        .from(items)
        .innerJoin(stores, eq(stores.id, items.storeId))
        .where(itemWhere(idOrSlug))
        .limit(1);
      const r = row[0];
      if (!r) return undefined;
      return {
        id: r.id,
        slug: r.slug,
        vendor: r.vendor,
        storeId: r.storeId,
        storeSlug: r.storeSlug,
        storeName: r.storeName,
        name: r.name,
        description: r.description ?? undefined,
        priceMinor: r.priceMinor,
        currency: r.currency,
        gtin: r.gtin ?? undefined,
        imageUrl: r.imageUrl ?? undefined,
        available: r.available,
      };
    },

    async searchItemsForPlan(query, embedder, limit) {
      return searchHybrid(db, embedder, query, limit);
    },

    async searchItemsByBarcodeForPlan(gtin) {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT
          i.id, i.slug, i.vendor, i.store_id, i.name, i.description, i.price_minor, i.currency,
          i.gtin, i.image_url, i.available,
          s.slug AS store_slug, s.name AS store_name,
          NULL::double precision AS score
        FROM items i
        JOIN stores s ON s.id = i.store_id
        WHERE i.gtin = ${gtin} AND i.available = true
        ORDER BY i.price_minor ASC;
      `);
      return rows.rows.map(hydrateHit);
    },

    async stats() {
      const [storeCount] = await db.select({ n: count() }).from(stores);
      const [catCount] = await db.select({ n: count() }).from(categories);
      const [itemCount] = await db.select({ n: count() }).from(items);
      const [embCount] = await db.select({ n: count() }).from(itemEmbeddings);
      const [freshCount] = await db
        .select({ n: count() })
        .from(stores)
        .where(isNotNull(stores.lastAssortmentRefreshAt));
      return {
        stores: Number(storeCount?.n ?? 0),
        categories: Number(catCount?.n ?? 0),
        items: Number(itemCount?.n ?? 0),
        itemsWithEmbedding: Number(embCount?.n ?? 0),
        storesWithAssortment: Number(freshCount?.n ?? 0),
      };
    },
  };
}

async function searchHybrid(db: DbClient, embedder: Embedder, query: string, limit: number): Promise<HybridItemHit[]> {
  const [vec] = await embedder.embed([query]);
  if (!vec) return [];
  const vecLiteral = `[${vec.join(',')}]`;
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH
      q AS (SELECT ${query}::text AS qtext, ${vecLiteral}::vector(1024) AS qvec),
      fts AS (
        SELECT i.id, ROW_NUMBER() OVER (
          ORDER BY ts_rank(
            to_tsvector('simple', i.search_text),
            plainto_tsquery('simple', (SELECT qtext FROM q))
          ) DESC
        ) AS rnk
        FROM items i
        WHERE to_tsvector('simple', i.search_text) @@ plainto_tsquery('simple', (SELECT qtext FROM q))
        LIMIT 200
      ),
      vec AS (
        SELECT ie.item_id AS id, ROW_NUMBER() OVER (
          ORDER BY ie.embedding <=> (SELECT qvec FROM q)
        ) AS rnk
        FROM item_embeddings ie
        ORDER BY ie.embedding <=> (SELECT qvec FROM q)
        LIMIT 200
      ),
      fused AS (
        SELECT id, SUM(1.0 / (60 + rnk)) AS score
        FROM (SELECT * FROM fts UNION ALL SELECT * FROM vec) x
        GROUP BY id
      )
    SELECT
      i.id, i.slug, i.vendor, i.store_id, i.name, i.description, i.price_minor, i.currency,
      i.gtin, i.image_url, i.available,
      s.slug AS store_slug, s.name AS store_name,
      f.score
    FROM fused f
    JOIN items i ON i.id = f.id
    JOIN stores s ON s.id = i.store_id
    ORDER BY f.score DESC
    LIMIT ${limit};
  `);
  return rows.rows.map(hydrateHit);
}

async function searchKeyword(db: DbClient, query: string, limit: number): Promise<HybridItemHit[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT
      i.id, i.slug, i.vendor, i.store_id, i.name, i.description, i.price_minor, i.currency,
      i.gtin, i.image_url, i.available,
      s.slug AS store_slug, s.name AS store_name,
      ts_rank(to_tsvector('simple', i.search_text), plainto_tsquery('simple', ${query})) AS score
    FROM items i
    JOIN stores s ON s.id = i.store_id
    WHERE to_tsvector('simple', i.search_text) @@ plainto_tsquery('simple', ${query})
    ORDER BY score DESC, i.price_minor ASC
    LIMIT ${limit};
  `);
  return rows.rows.map(hydrateHit);
}

async function resolveStoreId(db: DbClient, idOrSlug: string): Promise<string | undefined> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const row = await db.query.stores.findFirst({ where: eq(stores.slug, idOrSlug) });
  return row?.id;
}

async function resolveCategoryId(db: DbClient, idOrSlug: string): Promise<string | undefined> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const row = await db.query.categories.findFirst({ where: eq(categories.slug, idOrSlug) });
  return row?.id;
}
