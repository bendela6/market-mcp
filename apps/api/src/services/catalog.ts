import { and, count, eq, ilike, isNotNull, sql } from 'drizzle-orm';
import type {
  AssortmentCategory,
  Product,
  Venue as VendorVenue,
  VendorId,
} from '@market/vendor-core';
import type { DbClient } from '../db/client.js';
import {
  categories,
  embeddingJobs,
  itemEmbeddings,
  items,
  priceObservations,
  venues,
  type ItemRow,
  type VenueRow,
} from '../db/schema.js';
import type { Embedder } from '../embeddings/index.js';

export interface CatalogService {
  upsertVenues(vendor: VendorId, list: VendorVenue[]): Promise<void>;
  upsertCategories(vendor: VendorId, venueSlug: string, cats: AssortmentCategory[]): Promise<void>;
  upsertItems(vendor: VendorId, venueSlug: string, products: Product[]): Promise<number>;
  touchVenueAssortmentRefresh(vendor: VendorId, venueSlug: string): Promise<void>;
  listVenues(filter: {
    vendor?: VendorId;
    productLine?: string;
    online?: boolean;
    q?: string;
    limit?: number;
  }): Promise<VenueRow[]>;
  getVenue(vendor: VendorId, slug: string): Promise<VenueRow | undefined>;
  searchItemsHybrid(query: string, embedder: Embedder, limit: number): Promise<HybridItemHit[]>;
  searchItemsKeyword(query: string, limit: number): Promise<HybridItemHit[]>;
  searchItemsByBarcode(gtin: string): Promise<HybridItemHit[]>;
  stats(): Promise<{
    venues: number;
    categories: number;
    items: number;
    itemsWithEmbedding: number;
    venuesWithAssortment: number;
  }>;
}

export interface HybridItemHit {
  id: string;
  vendor: VendorId;
  venueId: string;
  venueSlug: string;
  venueName: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  gtin: string | null;
  imageUrl: string | null;
  online: boolean;
  deliveryPriceInt: number | null;
  score: number | null;
}

function mapVendorVenueToInsert(vendor: VendorId, v: VendorVenue) {
  return {
    vendor,
    vendorSlug: v.slug,
    name: v.name,
    productLine: (v.productLine ?? null) as ItemRow['vendor'] extends never ? never : VenueRow['productLine'],
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
    vendor: row.vendor as VendorId,
    venueId: row.venue_id as string,
    venueSlug: row.venue_slug as string,
    venueName: (row.venue_name as string) ?? '',
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    priceMinor: Number(row.price_minor),
    currency: row.currency as string,
    gtin: (row.gtin as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    online: Boolean(row.online),
    deliveryPriceInt: null,
    score: row.score != null ? Number(row.score) : null,
  };
}

export function createCatalogService(db: DbClient): CatalogService {
  return {
    async upsertVenues(vendor, list) {
      if (list.length === 0) return;
      const rows = list.map((v) => mapVendorVenueToInsert(vendor, v));
      await db
        .insert(venues)
        .values(rows)
        .onConflictDoUpdate({
          target: [venues.vendor, venues.vendorSlug],
          set: {
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

    async upsertCategories(vendor, venueSlug, cats) {
      const venueRow = await db.query.venues.findFirst({
        where: and(eq(venues.vendor, vendor), eq(venues.vendorSlug, venueSlug)),
      });
      if (!venueRow) return;
      const flat: Array<{
        venueId: string;
        vendorSlug: string;
        parentSlug: string | null;
        name: string;
        position: number | null;
      }> = [];
      let pos = 0;
      const walk = (list: AssortmentCategory[], parent: string | null) => {
        for (const c of list) {
          flat.push({
            venueId: venueRow.id,
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
          target: [categories.venueId, categories.vendorSlug],
          set: {
            parentSlug: sql`excluded.parent_slug`,
            name: sql`excluded.name`,
            position: sql`excluded.position`,
          },
        });
    },

    async upsertItems(vendor, venueSlug, products) {
      if (products.length === 0) return 0;
      const venueRow = await db.query.venues.findFirst({
        where: and(eq(venues.vendor, vendor), eq(venues.vendorSlug, venueSlug)),
      });
      if (!venueRow) return 0;

      const rows = products.map((p) => ({
        venueId: venueRow.id,
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
          target: [items.venueId, items.vendorItemId],
          set: {
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

    async touchVenueAssortmentRefresh(vendor, venueSlug) {
      await db
        .update(venues)
        .set({ lastAssortmentRefreshAt: new Date() })
        .where(and(eq(venues.vendor, vendor), eq(venues.vendorSlug, venueSlug)));
    },

    async listVenues(filter) {
      const conds = [];
      if (filter.vendor) conds.push(eq(venues.vendor, filter.vendor));
      if (filter.productLine) conds.push(eq(venues.productLine, filter.productLine as never));
      if (filter.online != null) conds.push(eq(venues.online, filter.online));
      if (filter.q) conds.push(ilike(venues.name, `%${filter.q}%`));
      return db
        .select()
        .from(venues)
        .where(conds.length ? and(...conds) : undefined)
        .limit(filter.limit ?? 200);
    },

    async getVenue(vendor, slug) {
      return db.query.venues.findFirst({
        where: and(eq(venues.vendor, vendor), eq(venues.vendorSlug, slug)),
      });
    },

    async searchItemsHybrid(query, embedder, limit) {
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
          i.id, i.vendor, i.venue_id, i.name, i.description, i.price_minor, i.currency,
          i.gtin, i.image_url, i.available AS online,
          v.vendor_slug AS venue_slug, v.name AS venue_name,
          f.score
        FROM fused f
        JOIN items i ON i.id = f.id
        JOIN venues v ON v.id = i.venue_id
        ORDER BY f.score DESC
        LIMIT ${limit};
      `);
      return rows.rows.map(hydrateHit);
    },

    async searchItemsKeyword(query, limit) {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT
          i.id, i.vendor, i.venue_id, i.name, i.description, i.price_minor, i.currency,
          i.gtin, i.image_url, i.available AS online,
          v.vendor_slug AS venue_slug, v.name AS venue_name,
          ts_rank(to_tsvector('simple', i.search_text), plainto_tsquery('simple', ${query})) AS score
        FROM items i
        JOIN venues v ON v.id = i.venue_id
        WHERE to_tsvector('simple', i.search_text) @@ plainto_tsquery('simple', ${query})
        ORDER BY score DESC, i.price_minor ASC
        LIMIT ${limit};
      `);
      return rows.rows.map(hydrateHit);
    },

    async searchItemsByBarcode(gtin) {
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT
          i.id, i.vendor, i.venue_id, i.name, i.description, i.price_minor, i.currency,
          i.gtin, i.image_url, i.available AS online,
          v.vendor_slug AS venue_slug, v.name AS venue_name,
          NULL::double precision AS score
        FROM items i
        JOIN venues v ON v.id = i.venue_id
        WHERE i.gtin = ${gtin} AND i.available = true
        ORDER BY i.price_minor ASC;
      `);
      return rows.rows.map(hydrateHit);
    },

    async stats() {
      const [venueCount] = await db.select({ n: count() }).from(venues);
      const [catCount] = await db.select({ n: count() }).from(categories);
      const [itemCount] = await db.select({ n: count() }).from(items);
      const [embCount] = await db.select({ n: count() }).from(itemEmbeddings);
      const [freshCount] = await db
        .select({ n: count() })
        .from(venues)
        .where(isNotNull(venues.lastAssortmentRefreshAt));
      return {
        venues: Number(venueCount?.n ?? 0),
        categories: Number(catCount?.n ?? 0),
        items: Number(itemCount?.n ?? 0),
        itemsWithEmbedding: Number(embCount?.n ?? 0),
        venuesWithAssortment: Number(freshCount?.n ?? 0),
      };
    },
  };
}
