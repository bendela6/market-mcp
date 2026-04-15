import {
  pgTable, uuid, text, integer, boolean, timestamp,
  index, uniqueIndex, jsonb, pgEnum, customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const vector1024 = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector(1024)',
  toDriver: (v) => `[${v.join(',')}]`,
  fromDriver: (v) => JSON.parse(v as string) as number[],
});

export const vendorId = pgEnum('vendor_id', [
  'wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill',
]);

export const productLine = pgEnum('product_line', [
  'restaurant', 'store', 'grocery', 'pharmacy', 'other',
]);

export const venues = pgTable('venues', {
  id:            uuid('id').primaryKey().defaultRandom(),
  vendor:        vendorId('vendor').notNull(),
  vendorSlug:    text('vendor_slug').notNull(),
  name:          text('name').notNull(),
  productLine:   productLine('product_line'),
  online:        boolean('online').notNull().default(false),
  currency:      text('currency').notNull(),
  lat:           text('lat'),
  lon:           text('lon'),
  address:       text('address'),
  rawContent:    jsonb('raw_content'),
  lastSeenAt:    timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastAssortmentRefreshAt: timestamp('last_assortment_refresh_at', { withTimezone: true }),
}, (t) => ({
  vendorSlugUq:  uniqueIndex('venues_vendor_slug_uq').on(t.vendor, t.vendorSlug),
  nameTrgm:      index('venues_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
  productLineIx: index('venues_product_line_ix').on(t.productLine),
}));

export const categories = pgTable('categories', {
  id:            uuid('id').primaryKey().defaultRandom(),
  venueId:       uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  vendorSlug:    text('vendor_slug').notNull(),
  parentSlug:    text('parent_slug'),
  name:          text('name').notNull(),
  position:      integer('position'),
}, (t) => ({
  venueSlugUq:   uniqueIndex('categories_venue_slug_uq').on(t.venueId, t.vendorSlug),
}));

export const items = pgTable('items', {
  id:            uuid('id').primaryKey().defaultRandom(),
  venueId:       uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  categoryId:    uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  vendor:        vendorId('vendor').notNull(),
  vendorItemId:  text('vendor_item_id').notNull(),
  name:          text('name').notNull(),
  description:   text('description'),
  gtin:          text('gtin'),
  imageUrl:      text('image_url'),
  priceMinor:    integer('price_minor').notNull(),
  currency:      text('currency').notNull(),
  available:     boolean('available').notNull().default(true),
  tags:          jsonb('tags').$type<string[]>().default([]),
  searchText:    text('search_text').generatedAlwaysAs(
                    sql`name || ' ' || coalesce(description, '')`,
                  ),
  lastSeenAt:    timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  venueVendorItemUq: uniqueIndex('items_venue_vendor_item_uq').on(t.venueId, t.vendorItemId),
  gtinIx:            index('items_gtin_ix').on(t.gtin),
  nameTrgm:          index('items_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
  fts:               index('items_fts_ix').using(
                       'gin',
                       sql`to_tsvector('simple', ${t.searchText})`
                     ),
}));

export const itemEmbeddings = pgTable('item_embeddings', {
  itemId:        uuid('item_id').primaryKey().references(() => items.id, { onDelete: 'cascade' }),
  embedding:     vector1024('embedding').notNull(),
  modelVersion:  text('model_version').notNull(),
  embeddedAt:    timestamp('embedded_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  hnsw:    index('item_embeddings_hnsw').using('hnsw', sql`${t.embedding} vector_cosine_ops`),
  modelIx: index('item_embeddings_model_ix').on(t.modelVersion),
}));

export const embeddingJobs = pgTable('embedding_jobs', {
  itemId:        uuid('item_id').primaryKey().references(() => items.id, { onDelete: 'cascade' }),
  enqueuedAt:    timestamp('enqueued_at', { withTimezone: true }).defaultNow().notNull(),
  attempts:      integer('attempts').notNull().default(0),
  lockedAt:      timestamp('locked_at', { withTimezone: true }),
  lastError:     text('last_error'),
}, (t) => ({
  enqueuedIx: index('embedding_jobs_enqueued_ix').on(t.enqueuedAt),
}));

export const priceObservations = pgTable('price_observations', {
  id:            uuid('id').primaryKey().defaultRandom(),
  itemId:        uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  priceMinor:    integer('price_minor').notNull(),
  currency:      text('currency').notNull(),
  available:     boolean('available').notNull(),
  observedAt:    timestamp('observed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  itemTimeIx: index('price_observations_item_time_ix').on(t.itemId, t.observedAt),
}));

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type VenueRow = InferSelectModel<typeof venues>;
export type VenueInsert = InferInsertModel<typeof venues>;
export type CategoryRow = InferSelectModel<typeof categories>;
export type CategoryInsert = InferInsertModel<typeof categories>;
export type ItemRow = InferSelectModel<typeof items>;
export type ItemInsert = InferInsertModel<typeof items>;
export type ItemEmbeddingRow = InferSelectModel<typeof itemEmbeddings>;
export type ItemEmbeddingInsert = InferInsertModel<typeof itemEmbeddings>;
