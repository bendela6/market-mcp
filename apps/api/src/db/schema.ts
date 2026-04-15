import {
  pgTable, uuid, text, integer, boolean, timestamp,
  index, uniqueIndex, jsonb, pgEnum, customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

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

export const planType     = pgEnum('plan_type',      ['mixed', 'item-based', 'query-based']);
export const planStrategy = pgEnum('plan_strategy',  ['cheapest-per-item', 'single-store', 'both']);
export const planLineKind = pgEnum('plan_line_kind', ['query', 'item']);

export const users = pgTable('users', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const stores = pgTable('stores', {
  id:          uuid('id').primaryKey().defaultRandom(),
  slug:        text('slug').notNull(),
  vendor:      vendorId('vendor').notNull(),
  vendorSlug:  text('vendor_slug').notNull(),
  name:        text('name').notNull(),
  productLine: productLine('product_line'),
  online:      boolean('online').notNull().default(false),
  currency:    text('currency').notNull(),
  lat:         text('lat'),
  lon:         text('lon'),
  address:     text('address'),
  rawContent:  jsonb('raw_content'),
  lastSeenAt:  timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastAssortmentRefreshAt: timestamp('last_assortment_refresh_at', { withTimezone: true }),
}, (t) => ({
  slugUq:         uniqueIndex('stores_slug_uq').on(t.slug),
  vendorSlugUq:   uniqueIndex('stores_vendor_slug_uq').on(t.vendor, t.vendorSlug),
  nameTrgm:       index('stores_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
  productLineIx:  index('stores_product_line_ix').on(t.productLine),
}));

export const categories = pgTable('categories', {
  id:         uuid('id').primaryKey().defaultRandom(),
  storeId:    uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  slug:       text('slug').notNull(),
  vendorSlug: text('vendor_slug').notNull(),
  parentSlug: text('parent_slug'),
  name:       text('name').notNull(),
  position:   integer('position'),
}, (t) => ({
  slugUq:      uniqueIndex('categories_slug_uq').on(t.slug),
  storeSlugUq: uniqueIndex('categories_store_slug_uq').on(t.storeId, t.vendorSlug),
}));

export const items = pgTable('items', {
  id:           uuid('id').primaryKey().defaultRandom(),
  slug:         text('slug').notNull(),
  storeId:      uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  categoryId:   uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  vendor:       vendorId('vendor').notNull(),
  vendorItemId: text('vendor_item_id').notNull(),
  name:         text('name').notNull(),
  description:  text('description'),
  gtin:         text('gtin'),
  imageUrl:     text('image_url'),
  priceMinor:   integer('price_minor').notNull(),
  currency:     text('currency').notNull(),
  available:    boolean('available').notNull().default(true),
  tags:         jsonb('tags').$type<string[]>().default([]),
  searchText:   text('search_text').generatedAlwaysAs(
                  sql`name || ' ' || coalesce(description, '')`,
                ),
  lastSeenAt:   timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugUq:            uniqueIndex('items_slug_uq').on(t.slug),
  storeVendorItemUq: uniqueIndex('items_store_vendor_item_uq').on(t.storeId, t.vendorItemId),
  gtinIx:            index('items_gtin_ix').on(t.gtin),
  nameTrgm:          index('items_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
  fts:               index('items_fts_ix').using(
                       'gin',
                       sql`to_tsvector('simple', ${t.searchText})`
                     ),
}));

export const itemEmbeddings = pgTable('item_embeddings', {
  itemId:       uuid('item_id').primaryKey().references(() => items.id, { onDelete: 'cascade' }),
  embedding:    vector1024('embedding').notNull(),
  modelVersion: text('model_version').notNull(),
  embeddedAt:   timestamp('embedded_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  hnsw:    index('item_embeddings_hnsw').using('hnsw', sql`${t.embedding} vector_cosine_ops`),
  modelIx: index('item_embeddings_model_ix').on(t.modelVersion),
}));

export const embeddingJobs = pgTable('embedding_jobs', {
  itemId:     uuid('item_id').primaryKey().references(() => items.id, { onDelete: 'cascade' }),
  enqueuedAt: timestamp('enqueued_at', { withTimezone: true }).defaultNow().notNull(),
  attempts:   integer('attempts').notNull().default(0),
  lockedAt:   timestamp('locked_at', { withTimezone: true }),
  lastError:  text('last_error'),
}, (t) => ({
  enqueuedIx: index('embedding_jobs_enqueued_ix').on(t.enqueuedAt),
}));

export const priceObservations = pgTable('price_observations', {
  id:         uuid('id').primaryKey().defaultRandom(),
  itemId:     uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  priceMinor: integer('price_minor').notNull(),
  currency:   text('currency').notNull(),
  available:  boolean('available').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  itemTimeIx: index('price_observations_item_time_ix').on(t.itemId, t.observedAt),
}));

export const plans = pgTable('plans', {
  id:             uuid('id').primaryKey().defaultRandom(),
  slug:           text('slug').notNull(),
  userId:         uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:           text('name').notNull(),
  type:           planType('type').notNull(),
  strategy:       planStrategy('strategy').notNull(),
  vendor:         vendorId('vendor'),
  storeSlugs:     jsonb('store_slugs').$type<string[]>(),
  includeOffline: boolean('include_offline').notNull().default(false),
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugUq:    uniqueIndex('plans_slug_uq').on(t.slug),
  userIx:    index('plans_user_ix').on(t.userId),
  createdIx: index('plans_created_ix').on(t.createdAt),
  nameTrgm:  index('plans_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
}));

export const planLines = pgTable('plan_lines', {
  id:        uuid('id').primaryKey().defaultRandom(),
  planId:    uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  position:  integer('position').notNull(),
  kind:      planLineKind('kind').notNull(),
  quantity:  integer('quantity').notNull().default(1),
  query:     text('query'),
  itemId:    uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  planPosIx: index('plan_lines_plan_pos_ix').on(t.planId, t.position),
}));

export type UserRow = InferSelectModel<typeof users>;
export type UserInsert = InferInsertModel<typeof users>;
export type StoreRow = InferSelectModel<typeof stores>;
export type StoreInsert = InferInsertModel<typeof stores>;
export type CategoryRow = InferSelectModel<typeof categories>;
export type CategoryInsert = InferInsertModel<typeof categories>;
export type ItemRow = InferSelectModel<typeof items>;
export type ItemInsert = InferInsertModel<typeof items>;
export type ItemEmbeddingRow = InferSelectModel<typeof itemEmbeddings>;
export type ItemEmbeddingInsert = InferInsertModel<typeof itemEmbeddings>;
export type PlanRow = InferSelectModel<typeof plans>;
export type PlanInsert = InferInsertModel<typeof plans>;
export type PlanLineRow = InferSelectModel<typeof planLines>;
export type PlanLineInsert = InferInsertModel<typeof planLines>;
