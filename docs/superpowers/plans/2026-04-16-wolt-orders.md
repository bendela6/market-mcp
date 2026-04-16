# Wolt order history — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build user-scoped Wolt order history: per-user encrypted token storage, on-demand sync from Wolt's API into three new tables, and a new `/orders` listing page with search / filter / sort / pagination matching the existing `/stores` pattern.

**Architecture:** Follows the design in `docs/superpowers/specs/2026-04-16-wolt-orders-design.md`. Token plaintext is ephemeral, existing only inside the sync engine. Sync runs as a fire-and-forget in-process task tracked in `vendor_sync_jobs`; the UI polls every 2s while a job is running. No automated tests in this plan — verification is manual per task, consistent with the choice to defer the test harness to a follow-up plan.

**Tech Stack:** TypeScript, Drizzle ORM + Postgres, Fastify, Valibot, `undici`, TanStack Router + React Query, `nanoid`, Node `crypto`.

**Prerequisite:** The repo is on `main` at or after commit `0b81ad9` (spec update aligning to id-everywhere schema).

---

## Task 1: Fix the user plugin to accept 12-char nanoids

The id-everywhere refactor switched user ids to nanoids, but `apps/api/src/plugins/user.ts` still validates with a UUID regex. Every `requireUser`-protected route currently returns 400. Must fix before new routes are built on top.

**Files:**
- Modify: `apps/api/src/plugins/user.ts`

- [ ] **Step 1: Replace the UUID regex with the 12-char nanoid regex**

Replace the full contents of `apps/api/src/plugins/user.ts` with:

```ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    requireUser: preHandlerHookHandler;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

const SHORT_ID_RE = /^[A-Za-z0-9_-]{12}$/;

const plugin: FastifyPluginAsync = async (app) => {
  const requireUser: preHandlerHookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers['x-user-id'];
    const id = Array.isArray(header) ? header[0] : header;
    if (!id || typeof id !== 'string' || !SHORT_ID_RE.test(id)) {
      reply.code(400).send({ error: 'missing or invalid X-User-Id header' });
      return reply;
    }
    req.userId = id;
  };

  app.decorate('requireUser', requireUser);
};

export const userPlugin = fp(plugin);
```

- [ ] **Step 2: Typecheck the api package**

Run: `pnpm --filter @market/api build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/plugins/user.ts
git commit -m "fix(api/users): accept 12-char nanoid in X-User-Id header

The id-everywhere refactor moved user ids to nanoid but the requireUser
plugin was still matching a UUID regex, causing every authenticated
route to 400."
```

---

## Task 2: Add `ENCRYPTION_KEY_HEX` to the environment

**Files:**
- Modify: `.env.example`
- Modify: `apps/api/src/environment.ts`

- [ ] **Step 1: Add the key to `.env.example`**

Open `.env.example` and add, near the other API-side secrets:

```
# 64 hex chars (32 bytes) used to AES-256-GCM encrypt per-user vendor
# tokens at rest. Generate with: openssl rand -hex 32
ENCRYPTION_KEY_HEX=
```

- [ ] **Step 2: Validate the key in `apps/api/src/environment.ts`**

Locate the valibot schema in `environment.ts` and add this entry alongside the existing env fields:

```ts
ENCRYPTION_KEY_HEX: v.pipe(
  v.string(),
  v.regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY_HEX must be 64 hex chars (32 bytes)'),
),
```

The schema object's key order doesn't matter; drop it next to other `v.string()` / `v.pipe(...)` fields.

- [ ] **Step 3: Generate a dev key and put it in your local `.env`**

Run: `openssl rand -hex 32`

Copy the output into your local `.env` as `ENCRYPTION_KEY_HEX=<hex>`. Do NOT commit `.env`.

- [ ] **Step 4: Boot the api to confirm env validation passes**

Run: `pnpm --filter @market/api dev`
Expected: server boots without throwing env-validation errors. Kill it with Ctrl-C once confirmed.

- [ ] **Step 5: Commit**

```bash
git add .env.example apps/api/src/environment.ts
git commit -m "chore(api/env): add ENCRYPTION_KEY_HEX for per-user token encryption"
```

---

## Task 3: Create the crypto helper

**Files:**
- Create: `apps/api/src/lib/crypto.ts`

- [ ] **Step 1: Write `crypto.ts`**

Create `apps/api/src/lib/crypto.ts` with the full contents:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;       // 96-bit IV recommended for GCM
const TAG_LEN = 16;      // GCM auth tag

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Output is `base64(iv || ciphertext || authTag)` — a single opaque blob
 * safe to store in a text column.
 */
export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('encryption key must be 32 bytes (64 hex chars)');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

/**
 * Inverse of encryptSecret. Throws if the blob is truncated or tampered.
 */
export function decryptSecret(blob: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('encryption key must be 32 bytes (64 hex chars)');
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('ciphertext blob too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 2: Manual roundtrip smoke test via `pnpm exec node`**

Run from `apps/api`:

```bash
pnpm --filter @market/api build
node -e "const {encryptSecret,decryptSecret}=require('./dist/lib/crypto.js');const k=require('crypto').randomBytes(32).toString('hex');const p='hello-wolt-token';const c=encryptSecret(p,k);const d=decryptSecret(c,k);console.log(d===p?'OK':'FAIL',d.length,c.length);"
```

Expected output: `OK 16 <larger-number>`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/crypto.ts
git commit -m "feat(api/crypto): add AES-256-GCM helper for secret storage"
```

---

## Task 4: Extend the DB schema (columns + new tables + enums)

**Files:**
- Modify: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Add `numeric` to the drizzle imports**

At the top of `apps/api/src/db/schema.ts`, extend the pg-core import list. The current line starts with `pgTable, varchar, text, integer, boolean, timestamp,` — add `numeric`:

```ts
import {
  pgTable, varchar, text, integer, boolean, timestamp, numeric,
  index, uniqueIndex, jsonb, pgEnum, customType,
} from 'drizzle-orm/pg-core';
```

- [ ] **Step 2: Add three columns to the `users` table**

Replace the existing `users` definition:

```ts
export const users = pgTable('users', {
  id:                  shortId().primaryKey(),
  name:                text('name'),
  createdAt:           timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  woltAccessTokenEnc:  text('wolt_access_token_enc'),
  woltRefreshTokenEnc: text('wolt_refresh_token_enc'),
  woltConnectedAt:     timestamp('wolt_connected_at', { withTimezone: true }),
});
```

- [ ] **Step 3: Add two new enums near the existing `productLine` / `planType` enums**

After the `planLineKind` line, append:

```ts
export const vendorSyncJobMode = pgEnum('vendor_sync_job_mode', ['latest', 'full']);
export const vendorSyncJobStatus = pgEnum('vendor_sync_job_status',
  ['queued', 'running', 'succeeded', 'failed']);
```

- [ ] **Step 4: Add the three new tables at the bottom of the file (before the `InferSelectModel` type exports)**

```ts
export const woltOrders = pgTable('wolt_orders', {
  id:                shortId().primaryKey(),
  userId:            varchar('user_id', { length: 12 })
                       .notNull()
                       .references(() => users.id, { onDelete: 'cascade' }),
  woltOrderId:       text('wolt_order_id').notNull(),
  placedAt:          timestamp('placed_at', { withTimezone: true }).notNull(),
  deliveredAt:       timestamp('delivered_at', { withTimezone: true }),
  status:            text('status').notNull(),
  venueVendorSlug:   text('venue_vendor_slug').notNull(),
  venueName:         text('venue_name').notNull(),
  venueProductLine:  productLine('venue_product_line'),
  storeId:           varchar('store_id', { length: 12 })
                       .references(() => stores.id, { onDelete: 'set null' }),
  totalMinor:        integer('total_minor'),
  currency:          text('currency').notNull(),
  detailsScrapedAt:  timestamp('details_scraped_at', { withTimezone: true }),
  rawSummary:        jsonb('raw_summary').$type<Record<string, unknown>>().notNull(),
  rawDetails:        jsonb('raw_details').$type<Record<string, unknown>>(),
  syncedAt:          timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userOrderUq:  uniqueIndex('wolt_orders_user_order_uq').on(t.userId, t.woltOrderId),
  userPlacedIx: index('wolt_orders_user_placed_ix').on(t.userId, t.placedAt),
  userVenueIx:  index('wolt_orders_user_venue_ix').on(t.userId, t.venueVendorSlug),
  userStatusIx: index('wolt_orders_user_status_ix').on(t.userId, t.status),
}));

export const woltOrderItems = pgTable('wolt_order_items', {
  id:             shortId().primaryKey(),
  orderId:        varchar('order_id', { length: 12 })
                    .notNull()
                    .references(() => woltOrders.id, { onDelete: 'cascade' }),
  woltItemId:     text('wolt_item_id').notNull(),
  name:           text('name').notNull(),
  quantity:       numeric('quantity').notNull(),
  unitPriceMinor: integer('unit_price_minor'),
  totalMinor:     integer('total_minor'),
  currency:       text('currency').notNull(),
  imageUrl:       text('image_url'),
  gtin:           text('gtin'),
  itemId:         varchar('item_id', { length: 12 })
                    .references(() => items.id, { onDelete: 'set null' }),
  raw:            jsonb('raw').$type<Record<string, unknown>>().notNull(),
}, (t) => ({
  orderItemUq: uniqueIndex('wolt_order_items_order_item_uq').on(t.orderId, t.woltItemId),
  nameIx:      index('wolt_order_items_name_ix').on(t.name),
}));

export const vendorSyncJobs = pgTable('vendor_sync_jobs', {
  id:             shortId().primaryKey(),
  userId:         varchar('user_id', { length: 12 })
                    .notNull()
                    .references(() => users.id, { onDelete: 'cascade' }),
  vendor:         vendorId('vendor').notNull(),
  mode:           vendorSyncJobMode('mode').notNull(),
  withDetails:    boolean('with_details').notNull(),
  status:         vendorSyncJobStatus('status').notNull(),
  startedAt:      timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt:     timestamp('finished_at', { withTimezone: true }),
  ordersSeen:     integer('orders_seen').notNull().default(0),
  ordersNew:      integer('orders_new').notNull().default(0),
  ordersUpdated:  integer('orders_updated').notNull().default(0),
  detailsFetched: integer('details_fetched').notNull().default(0),
  errorMessage:   text('error_message'),
}, (t) => ({
  userVendorIx: index('vendor_sync_jobs_user_vendor_ix')
                  .on(t.userId, t.vendor, t.startedAt),
}));
```

- [ ] **Step 5: Append `InferSelectModel` / `InferInsertModel` exports at the bottom**

```ts
export type WoltOrderRow = InferSelectModel<typeof woltOrders>;
export type WoltOrderInsert = InferInsertModel<typeof woltOrders>;
export type WoltOrderItemRow = InferSelectModel<typeof woltOrderItems>;
export type WoltOrderItemInsert = InferInsertModel<typeof woltOrderItems>;
export type VendorSyncJobRow = InferSelectModel<typeof vendorSyncJobs>;
export type VendorSyncJobInsert = InferInsertModel<typeof vendorSyncJobs>;
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @market/api build`
Expected: clean build.

- [ ] **Step 7: Commit (schema only, migration comes next)**

```bash
git add apps/api/src/db/schema.ts
git commit -m "feat(api/db): add wolt_orders, wolt_order_items, vendor_sync_jobs tables

Adds encrypted token columns to users plus three new tables for user-
scoped Wolt order history. All pk/fk columns use the shortId/varchar(12)
convention established by the id-everywhere refactor."
```

---

## Task 5: Generate and apply the Drizzle migration

**Files:**
- Create: `apps/api/drizzle/NNNN_*.sql` (auto-generated)

- [ ] **Step 1: Generate the migration**

Run: `pnpm --filter @market/api db:generate`
Expected: a new file appears in `apps/api/drizzle/` (e.g. `0002_something.sql`), and `apps/api/drizzle/meta/` is updated.

- [ ] **Step 2: Inspect the migration SQL**

Open the newly created file and verify it contains:
- `ALTER TABLE "users" ADD COLUMN "wolt_access_token_enc" text;` (and the other two)
- `CREATE TABLE "wolt_orders" (...)`, `CREATE TABLE "wolt_order_items" (...)`, `CREATE TABLE "vendor_sync_jobs" (...)`
- `CREATE TYPE "public"."vendor_sync_job_mode" AS ENUM (...)` and `..."vendor_sync_job_status" AS ENUM (...)`
- All the indexes and unique constraints from schema.ts

If any `DROP TABLE` or `DROP COLUMN` appears, STOP — re-read the schema changes; you probably clobbered something.

- [ ] **Step 3: Apply the migration against your local dev Postgres**

Run: `pnpm --filter @market/api db:migrate`
Expected: "migrations applied" message (exact wording depends on drizzle-kit).

- [ ] **Step 4: Sanity-check tables exist**

Run against your dev DB (psql, adminer, or whatever client you use):

```sql
\d wolt_orders
\d wolt_order_items
\d vendor_sync_jobs
\d users
```

Expected: all four exist and `users` has the three new nullable columns.

- [ ] **Step 5: Commit the generated migration**

```bash
git add apps/api/drizzle/
git commit -m "feat(api/db): generate migration for wolt orders tables"
```

---

## Task 6: Add route constants to contracts

**Files:**
- Modify: `packages/contracts/src/routes.ts`

- [ ] **Step 1: Append new route constants**

Inside the existing `ROUTES` object in `packages/contracts/src/routes.ts`, add two new groups matching the existing naming pattern. Example shape (adjust to match surrounding style exactly):

```ts
export const ROUTES = {
  // existing stores, catalog, plans, users, etc.
  me: {
    wolt: {
      connect: '/v1/me/wolt/connect',
      status:  '/v1/me/wolt/status',
    },
    orders: {
      query: '/v1/me/orders/query',
      get:   (id: string) => `/v1/me/orders/${id}`,
      sync:  '/v1/me/orders/sync',
      job:   (id: string) => `/v1/me/orders/sync/${id}`,
    },
  },
} as const;
```

(If the existing file uses a flat structure rather than the nested one shown here, match that style — e.g. `ROUTES.meWolt.connect`. Follow whichever shape is already present.)

- [ ] **Step 2: Build the contracts package**

Run: `pnpm --filter @market/contracts build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/routes.ts
git commit -m "feat(contracts/routes): add me/wolt and me/orders route constants"
```

---

## Task 7: Create the orders contract schemas

**Files:**
- Create: `packages/contracts/src/orders.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create `packages/contracts/src/orders.ts`**

```ts
import * as v from 'valibot';
import {
  ProductLineSchema,
  PaginationBaseSchema,
  SortItemSchema,
  ShortIdSchema,
  envelope,
} from './common.js';

export const OrderStatusSchema = v.string();     // Wolt statuses TBD; leave open
export const SyncJobModeSchema = v.picklist(['latest', 'full'] as const);
export const SyncJobStatusSchema = v.picklist(
  ['queued', 'running', 'succeeded', 'failed'] as const,
);

export const OrderItemSchema = v.object({
  id:             ShortIdSchema,
  woltItemId:     v.string(),
  name:           v.string(),
  quantity:       v.number(),
  unitPriceMinor: v.optional(v.number()),
  totalMinor:     v.optional(v.number()),
  currency:       v.string(),
  imageUrl:       v.optional(v.string()),
  gtin:           v.optional(v.string()),
  itemId:         v.optional(ShortIdSchema),
});

export const OrderSchema = v.object({
  id:                ShortIdSchema,
  woltOrderId:       v.string(),
  placedAt:          v.string(),             // ISO
  deliveredAt:       v.optional(v.string()),
  status:            OrderStatusSchema,
  venueVendorSlug:   v.string(),
  venueName:         v.string(),
  venueProductLine:  v.optional(ProductLineSchema),
  storeId:           v.optional(ShortIdSchema),
  totalMinor:        v.optional(v.number()),
  currency:          v.string(),
  detailsScrapedAt:  v.optional(v.string()),
  syncedAt:          v.string(),
});

export const OrderDetailSchema = v.object({
  order: OrderSchema,
  items: v.array(OrderItemSchema),
});

export const OrderSortFields = ['placedAt', 'totalMinor', 'venueName'] as const;

export const OrderListQueryBodySchema = v.object({
  ...PaginationBaseSchema.entries,
  sort:        v.optional(v.array(SortItemSchema(OrderSortFields))),
  venueSlug:   v.optional(v.string()),
  productLine: v.optional(ProductLineSchema),
  status:      v.optional(v.string()),
  hasDetails:  v.optional(v.boolean()),
  placedFrom:  v.optional(v.string()),        // ISO
  placedTo:    v.optional(v.string()),
});
export type OrderListQueryBody = v.InferOutput<typeof OrderListQueryBodySchema>;

export const OrderListResponseSchema = envelope(OrderSchema);
export type OrderListResponse = v.InferOutput<typeof OrderListResponseSchema>;

export const ConnectWoltBodySchema = v.object({
  accessToken:  v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  refreshToken: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
});
export type ConnectWoltBody = v.InferOutput<typeof ConnectWoltBodySchema>;

export const WoltStatusSchema = v.object({
  connected:    v.boolean(),
  connectedAt:  v.nullable(v.string()),
  lastSyncAt:   v.nullable(v.string()),
  ordersInDb:   v.number(),
});
export type WoltStatus = v.InferOutput<typeof WoltStatusSchema>;

export const StartSyncBodySchema = v.object({
  mode:        SyncJobModeSchema,
  withDetails: v.boolean(),
});
export type StartSyncBody = v.InferOutput<typeof StartSyncBodySchema>;

export const SyncJobSchema = v.object({
  id:             ShortIdSchema,
  vendor:         v.string(),
  mode:           SyncJobModeSchema,
  withDetails:    v.boolean(),
  status:         SyncJobStatusSchema,
  startedAt:      v.string(),
  finishedAt:     v.nullable(v.string()),
  ordersSeen:     v.number(),
  ordersNew:      v.number(),
  ordersUpdated:  v.number(),
  detailsFetched: v.number(),
  errorMessage:   v.nullable(v.string()),
});
export type SyncJob = v.InferOutput<typeof SyncJobSchema>;

export type Order = v.InferOutput<typeof OrderSchema>;
export type OrderItem = v.InferOutput<typeof OrderItemSchema>;
export type OrderDetail = v.InferOutput<typeof OrderDetailSchema>;
```

- [ ] **Step 2: Export from the package index**

In `packages/contracts/src/index.ts`, add:

```ts
export * from './orders.js';
```

(Drop it next to the existing `export * from './stores.js'` / `plans.js` lines.)

- [ ] **Step 3: Build**

Run: `pnpm --filter @market/contracts build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/orders.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add orders + wolt-token schemas"
```

---

## Task 8: Extend the Wolt client types and error classes

**Files:**
- Modify: `packages/vendors/wolt/src/client.ts`

- [ ] **Step 1: Add shared types and error classes near the top of client.ts**

Below the existing imports in `packages/vendors/wolt/src/client.ts`, add:

```ts
export class WoltAuthExpiredError extends Error {
  constructor() {
    super('Wolt access token rejected (401)');
    this.name = 'WoltAuthExpiredError';
  }
}

export class WoltRateLimitError extends Error {
  constructor(public readonly retryAfterSec: number) {
    super(`Wolt rate limit hit, retry after ${retryAfterSec}s`);
    this.name = 'WoltRateLimitError';
  }
}

export class WoltClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WoltClientError';
  }
}

export interface WoltOrderSummary {
  woltOrderId: string;
  placedAt: string;
  deliveredAt?: string;
  status: string;
  venueId: string;
  venueSlug: string;
  venueName: string;
  venueProductLine?: string;
  totalMinor?: number;
  currency: string;
  raw: Record<string, unknown>;
}

export interface WoltOrderDetails {
  woltOrderId: string;
  items: Array<{
    woltItemId: string;
    name: string;
    quantity: number;
    unitPriceMinor?: number;
    totalMinor?: number;
    currency: string;
    imageUrl?: string;
    gtin?: string;
    raw: Record<string, unknown>;
  }>;
  raw: Record<string, unknown>;
}
```

- [ ] **Step 2: Add an `authHeaders` helper (merges bearer onto the existing headers)**

Below the existing `headers()` function:

```ts
function authHeaders(config: WoltConfig, accessToken: string): Record<string, string> {
  return { ...headers(config), authorization: `Bearer ${accessToken}` };
}
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @market/vendor-wolt build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/vendors/wolt/src/client.ts
git commit -m "feat(vendor/wolt): add order history types and auth error classes"
```

---

## Task 9: Implement `listOrderHistory` on the Wolt client

Wolt's endpoint pagination parameter was not verified in the design phase (flagged as an assumption in the spec). Verify it live before coding.

**Files:**
- Modify: `packages/vendors/wolt/src/client.ts`

- [ ] **Step 1: Verify the endpoint and pagination shape**

Open wolt.com in a logged-in browser tab, navigate to `/en/me/order-history`, open DevTools → Network (preserve log), and scroll to trigger loading more orders. Find the request to `consumer-api.wolt.com/order-xp/web/v1/pages/orders`. Record:

- Method (likely GET)
- Query parameters on pagination (cursor name — likely `cursor` or `page_token` or `offset`)
- Top-level response shape: what's the field holding orders, and what's the "next page" token field?
- The exact field names for one order (placed_at, venue, total, status)

Write these findings down — they shape the next step's code.

- [ ] **Step 2: Add `listOrderHistory` to the `WoltClient` interface**

Edit the `WoltClient` interface:

```ts
export interface WoltClient {
  // existing methods...
  listOrderHistory(opts: {
    accessToken: string;
    cursor?: string;
    stopAtOrderId?: string;
  }): Promise<{
    orders: WoltOrderSummary[];
    nextCursor?: string;
    reachedStop: boolean;
  }>;
}
```

- [ ] **Step 3: Add the `normalizeOrderSummary` helper**

Right after the existing `normalizeVenue` function, add — using the field names you verified in Step 1. The structure below is the expected shape; replace the raw-field accessors if Wolt uses different names:

```ts
function normalizeOrderSummary(raw: Record<string, unknown>): WoltOrderSummary | null {
  const id = raw.id ?? raw.order_id ?? raw.purchase_id;
  if (typeof id !== 'string' || id.length === 0) return null;
  const venue = (raw.venue ?? {}) as Record<string, unknown>;
  const total = raw.total_price ?? raw.total ?? raw.price;
  const totalMinor = typeof total === 'object' && total !== null
    ? (total as { amount?: number }).amount
    : typeof total === 'number' ? total : undefined;
  return {
    woltOrderId: id,
    placedAt: String(raw.placed_at ?? raw.created_at ?? ''),
    deliveredAt: raw.delivered_at ? String(raw.delivered_at) : undefined,
    status: String(raw.status ?? 'unknown'),
    venueId: String(venue.id ?? ''),
    venueSlug: String(venue.slug ?? ''),
    venueName: String(venue.name ?? ''),
    venueProductLine: venue.product_line ? String(venue.product_line) : undefined,
    totalMinor: typeof totalMinor === 'number' ? totalMinor : undefined,
    currency: String(raw.currency ?? (total as { currency?: string })?.currency ?? 'GEL'),
    raw,
  };
}
```

- [ ] **Step 4: Implement `listOrderHistory` inside `createWoltClient`**

Add inside the client object literal, alongside the other methods:

```ts
async listOrderHistory(opts) {
  const { accessToken, cursor, stopAtOrderId } = opts;
  const qs = new URLSearchParams();
  if (cursor) qs.set('cursor', cursor);  // TODO: replace with actual param name from Step 1
  const url =
    `${config.consumerApi}/order-xp/web/v1/pages/orders` +
    (qs.toString() ? `?${qs}` : '');
  const { statusCode, body } = await request(url, {
    method: 'GET',
    headers: authHeaders(config, accessToken),
    bodyTimeout: 30_000,
    headersTimeout: 30_000,
  });
  const text = await body.text();
  if (statusCode === 401) throw new WoltAuthExpiredError();
  if (statusCode === 429) {
    const retryAfter = Number((/retry-after:\s*(\d+)/i.exec(text) || [, '60'])[1]);
    throw new WoltRateLimitError(retryAfter);
  }
  if (statusCode < 200 || statusCode >= 300) {
    throw new WoltClientError(`GET ${url} -> ${statusCode}: ${text.slice(0, 300)}`);
  }
  const j = JSON.parse(text) as {
    sections?: Array<{ items?: Array<Record<string, unknown>> }>;
    orders?: Array<Record<string, unknown>>;
    next_cursor?: string;
    next_page?: { cursor?: string };
  };
  // Try both the sectioned /pages/ shape and a flat "orders" shape.
  const rawOrders: Array<Record<string, unknown>> =
    j.orders ??
    (j.sections ?? []).flatMap((s) => s.items ?? []);
  const orders: WoltOrderSummary[] = [];
  let reachedStop = false;
  for (const r of rawOrders) {
    const n = normalizeOrderSummary(r);
    if (!n) continue;
    if (stopAtOrderId && n.woltOrderId === stopAtOrderId) {
      reachedStop = true;
      break;
    }
    orders.push(n);
  }
  const nextCursor = j.next_cursor ?? j.next_page?.cursor;
  return { orders, nextCursor, reachedStop };
},
```

- [ ] **Step 5: Build**

Run: `pnpm --filter @market/vendor-wolt build`
Expected: clean.

- [ ] **Step 6: Smoke-test against live Wolt with your own token**

In the browser (logged into wolt.com), copy the `__wtoken` cookie value. In a terminal:

```bash
TOKEN='paste-your-wtoken-here'
node -e "
const { createWoltClient, WOLT_DEFAULTS } = require('./packages/vendors/wolt/dist/index.js');
const c = createWoltClient(WOLT_DEFAULTS);
c.listOrderHistory({ accessToken: '$TOKEN' }).then(r => {
  console.log('orders:', r.orders.length, 'nextCursor:', r.nextCursor);
  console.log('first:', r.orders[0] ? { slug: r.orders[0].venueSlug, total: r.orders[0].totalMinor, status: r.orders[0].status, placed: r.orders[0].placedAt } : 'none');
}).catch(e => console.error(e));
"
```

Expected: prints a non-zero order count and sensible fields for your most recent order. If fields are `undefined`/`''`, revisit Step 1 and fix the raw-accessor names in `normalizeOrderSummary`.

- [ ] **Step 7: Commit**

```bash
git add packages/vendors/wolt/src/client.ts
git commit -m "feat(vendor/wolt): add listOrderHistory with summary normalizer"
```

---

## Task 10: Implement `getOrderDetailsByIds`

**Files:**
- Modify: `packages/vendors/wolt/src/client.ts`

- [ ] **Step 1: Verify the endpoint shape**

In the same logged-in browser DevTools, click into one order in `/me/order-history`. Find the request to `restaurant-api.wolt.com/v2/order_details/by_ids`. Record:

- Method (POST — confirmed earlier)
- Request body shape (likely `{ ids: string[] }` or `{ order_ids: string[] }`)
- Response shape: list of full order objects with items.

- [ ] **Step 2: Add `normalizeOrderDetails` helper**

Below `normalizeOrderSummary`:

```ts
function normalizeOrderDetails(raw: Record<string, unknown>): WoltOrderDetails | null {
  const id = raw.id ?? raw.order_id ?? raw.purchase_id;
  if (typeof id !== 'string') return null;
  const items = ((raw.items ?? raw.menu_items ?? []) as Array<Record<string, unknown>>).map(
    (it) => {
      const unitPrice = it.unit_price as number | { amount?: number } | undefined;
      const totalPrice = it.total_price as number | { amount?: number } | undefined;
      return {
        woltItemId: String(it.id ?? it.menu_item_id ?? ''),
        name: String(it.name ?? ''),
        quantity: Number(it.count ?? it.quantity ?? 1),
        unitPriceMinor:
          typeof unitPrice === 'number' ? unitPrice :
          typeof unitPrice === 'object' && unitPrice ? unitPrice.amount : undefined,
        totalMinor:
          typeof totalPrice === 'number' ? totalPrice :
          typeof totalPrice === 'object' && totalPrice ? totalPrice.amount : undefined,
        currency: String(it.currency ?? raw.currency ?? 'GEL'),
        imageUrl: ((it.image ?? {}) as { url?: string }).url ?? undefined,
        gtin: it.barcode_gtin ? String(it.barcode_gtin) : undefined,
        raw: it,
      };
    },
  );
  return { woltOrderId: id, items, raw };
}
```

- [ ] **Step 3: Add `getOrderDetailsByIds` to the interface**

In the `WoltClient` interface:

```ts
getOrderDetailsByIds(opts: {
  accessToken: string;
  orderIds: string[];
}): Promise<WoltOrderDetails[]>;
```

- [ ] **Step 4: Implement the method**

Inside `createWoltClient`:

```ts
async getOrderDetailsByIds(opts) {
  const { accessToken, orderIds } = opts;
  if (orderIds.length === 0) return [];
  const url = `${config.restaurantApi}/v2/order_details/by_ids`;
  const out: WoltOrderDetails[] = [];
  for (let i = 0; i < orderIds.length; i += 20) {
    const chunk = orderIds.slice(i, i + 20);
    const { statusCode, body } = await request(url, {
      method: 'POST',
      headers: authHeaders(config, accessToken),
      body: JSON.stringify({ ids: chunk }),  // TODO verify key name from Step 1
      bodyTimeout: 30_000,
      headersTimeout: 30_000,
    });
    const text = await body.text();
    if (statusCode === 401) throw new WoltAuthExpiredError();
    if (statusCode === 429) {
      const retryAfter = Number((/retry-after:\s*(\d+)/i.exec(text) || [, '60'])[1]);
      throw new WoltRateLimitError(retryAfter);
    }
    if (statusCode < 200 || statusCode >= 300) {
      throw new WoltClientError(`POST ${url} -> ${statusCode}: ${text.slice(0, 300)}`);
    }
    const j = JSON.parse(text) as {
      orders?: Array<Record<string, unknown>>;
      order_details?: Array<Record<string, unknown>>;
    };
    const arr = j.orders ?? j.order_details ?? [];
    for (const r of arr) {
      const n = normalizeOrderDetails(r);
      if (n) out.push(n);
    }
  }
  return out;
},
```

- [ ] **Step 5: Build**

Run: `pnpm --filter @market/vendor-wolt build`
Expected: clean.

- [ ] **Step 6: Smoke-test with one of your own order IDs**

Using the same token as Task 9:

```bash
TOKEN='paste-token'
ORDER_ID='paste-one-order-id-from-previous-smoke-test'
node -e "
const { createWoltClient, WOLT_DEFAULTS } = require('./packages/vendors/wolt/dist/index.js');
const c = createWoltClient(WOLT_DEFAULTS);
c.getOrderDetailsByIds({ accessToken: '$TOKEN', orderIds: ['$ORDER_ID'] }).then(r => {
  console.log('details:', r.length);
  console.log('items:', r[0]?.items?.length, r[0]?.items?.[0]);
});
"
```

Expected: shows ≥1 item with non-empty name/quantity. If empty, revisit Step 1/2.

- [ ] **Step 7: Commit**

```bash
git add packages/vendors/wolt/src/client.ts
git commit -m "feat(vendor/wolt): add getOrderDetailsByIds with details normalizer"
```

---

## Task 11: Implement `refreshAccessToken`

**Files:**
- Modify: `packages/vendors/wolt/src/client.ts`

- [ ] **Step 1: Verify the refresh endpoint**

In the logged-in Wolt tab, DevTools → Application → Cookies, delete `__wtoken` and reload a page that requires auth (e.g. `/me/order-history`). Watch Network for a POST to something like `authentication.wolt.com/v1/wauth2/access_token` or `restaurant-api.wolt.com/v1/auth/token`. Record:

- URL
- Body shape (likely `{ refresh_token, grant_type: 'refresh_token' }`)
- Response shape (`access_token`, `refresh_token`, `expires_in` or similar)

If nothing fires — Wolt may silently log you out instead. In that case, skip this task; set `refreshAccessToken` to throw `WoltAuthExpiredError` so the sync engine treats auth failure as "user must reconnect."

- [ ] **Step 2: Add `refreshAccessToken` to the interface**

```ts
refreshAccessToken(opts: {
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresInSec: number }>;
```

- [ ] **Step 3: Implement the method**

Inside `createWoltClient`, using the URL/body shape from Step 1 (substitute the `TODO` comments with verified values):

```ts
async refreshAccessToken(opts) {
  const url = 'https://authentication.wolt.com/v1/wauth2/access_token'; // TODO confirm Step 1
  const { statusCode, body } = await request(url, {
    method: 'POST',
    headers: { ...headers(config), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
    }).toString(),
    bodyTimeout: 30_000,
    headersTimeout: 30_000,
  });
  const text = await body.text();
  if (statusCode < 200 || statusCode >= 300) {
    throw new WoltAuthExpiredError();
  }
  const j = JSON.parse(text) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!j.access_token || !j.refresh_token) throw new WoltAuthExpiredError();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresInSec: Number(j.expires_in ?? 3600),
  };
},
```

If Step 1 found no refresh endpoint, replace the whole body with:

```ts
async refreshAccessToken() {
  throw new WoltAuthExpiredError();
},
```

- [ ] **Step 4: Build**

Run: `pnpm --filter @market/vendor-wolt build`

- [ ] **Step 5: Commit**

```bash
git add packages/vendors/wolt/src/client.ts
git commit -m "feat(vendor/wolt): add refreshAccessToken for token rotation"
```

---

## Task 12: Create the Wolt token service

**Files:**
- Create: `apps/api/src/services/wolt-token-store.ts`

- [ ] **Step 1: Create the file**

```ts
import { and, eq, sql } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { encryptSecret, decryptSecret } from '../lib/crypto.js';
import { environment } from '../environment.js';
import type { DbClient } from '../db/client.js';

export interface WoltTokens {
  accessToken: string;
  refreshToken: string;
}

export interface WoltConnection {
  connected: boolean;
  connectedAt: Date | null;
}

export interface WoltTokenStore {
  connect(userId: string, tokens: WoltTokens): Promise<WoltConnection>;
  disconnect(userId: string): Promise<WoltConnection>;
  /** Returns null if the user has never connected. */
  loadTokens(userId: string): Promise<WoltTokens | null>;
  /** Overwrites the stored tokens (used after refresh). */
  rotateTokens(userId: string, tokens: WoltTokens): Promise<void>;
  getConnection(userId: string): Promise<WoltConnection>;
}

export function createWoltTokenStore(db: DbClient): WoltTokenStore {
  const key = environment.ENCRYPTION_KEY_HEX;

  return {
    async connect(userId, tokens) {
      const now = new Date();
      await db.update(users)
        .set({
          woltAccessTokenEnc:  encryptSecret(tokens.accessToken,  key),
          woltRefreshTokenEnc: encryptSecret(tokens.refreshToken, key),
          woltConnectedAt:     now,
        })
        .where(eq(users.id, userId));
      return { connected: true, connectedAt: now };
    },
    async disconnect(userId) {
      await db.update(users)
        .set({
          woltAccessTokenEnc:  null,
          woltRefreshTokenEnc: null,
          woltConnectedAt:     null,
        })
        .where(eq(users.id, userId));
      return { connected: false, connectedAt: null };
    },
    async loadTokens(userId) {
      const rows = await db.select({
        acc: users.woltAccessTokenEnc,
        ref: users.woltRefreshTokenEnc,
        at:  users.woltConnectedAt,
      }).from(users).where(eq(users.id, userId)).limit(1);
      const r = rows[0];
      if (!r || !r.acc || !r.ref || !r.at) return null;
      return {
        accessToken:  decryptSecret(r.acc, key),
        refreshToken: decryptSecret(r.ref, key),
      };
    },
    async rotateTokens(userId, tokens) {
      await db.update(users)
        .set({
          woltAccessTokenEnc:  encryptSecret(tokens.accessToken,  key),
          woltRefreshTokenEnc: encryptSecret(tokens.refreshToken, key),
        })
        .where(eq(users.id, userId));
    },
    async getConnection(userId) {
      const rows = await db.select({ at: users.woltConnectedAt })
        .from(users).where(eq(users.id, userId)).limit(1);
      const at = rows[0]?.at ?? null;
      return { connected: at != null, connectedAt: at };
    },
  };
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @market/api build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/wolt-token-store.ts
git commit -m "feat(api/services): add encrypted wolt token store"
```

---

## Task 13: Create the orders service (queries and detail fetch)

**Files:**
- Create: `apps/api/src/services/wolt-orders.ts`

- [ ] **Step 1: Create the file**

```ts
import { and, asc, desc, count, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { woltOrders, woltOrderItems, vendorSyncJobs } from '../db/schema.js';
import type { DbClient } from '../db/client.js';
import type {
  Order, OrderItem, OrderDetail, OrderListQueryBody, OrderListResponse, SyncJob, WoltStatus,
} from '@market/contracts';

function orderRowToDto(r: typeof woltOrders.$inferSelect): Order {
  return {
    id:               r.id,
    woltOrderId:      r.woltOrderId,
    placedAt:         r.placedAt.toISOString(),
    deliveredAt:      r.deliveredAt ? r.deliveredAt.toISOString() : undefined,
    status:           r.status,
    venueVendorSlug:  r.venueVendorSlug,
    venueName:        r.venueName,
    venueProductLine: r.venueProductLine ?? undefined,
    storeId:          r.storeId ?? undefined,
    totalMinor:       r.totalMinor ?? undefined,
    currency:         r.currency,
    detailsScrapedAt: r.detailsScrapedAt ? r.detailsScrapedAt.toISOString() : undefined,
    syncedAt:         r.syncedAt.toISOString(),
  };
}

function itemRowToDto(r: typeof woltOrderItems.$inferSelect): OrderItem {
  return {
    id:             r.id,
    woltItemId:     r.woltItemId,
    name:           r.name,
    quantity:       Number(r.quantity),
    unitPriceMinor: r.unitPriceMinor ?? undefined,
    totalMinor:     r.totalMinor ?? undefined,
    currency:       r.currency,
    imageUrl:       r.imageUrl ?? undefined,
    gtin:           r.gtin ?? undefined,
    itemId:         r.itemId ?? undefined,
  };
}

function jobRowToDto(r: typeof vendorSyncJobs.$inferSelect): SyncJob {
  return {
    id:             r.id,
    vendor:         r.vendor,
    mode:           r.mode,
    withDetails:    r.withDetails,
    status:         r.status,
    startedAt:      r.startedAt.toISOString(),
    finishedAt:     r.finishedAt ? r.finishedAt.toISOString() : null,
    ordersSeen:     r.ordersSeen,
    ordersNew:      r.ordersNew,
    ordersUpdated:  r.ordersUpdated,
    detailsFetched: r.detailsFetched,
    errorMessage:   r.errorMessage ?? null,
  };
}

export interface OrdersService {
  list(userId: string, body: OrderListQueryBody): Promise<OrderListResponse>;
  getById(userId: string, id: string): Promise<OrderDetail | undefined>;
  getStatus(userId: string, connectedAt: Date | null): Promise<WoltStatus>;
  getJob(userId: string, jobId: string): Promise<SyncJob | undefined>;
  findActiveJob(userId: string, vendor: string): Promise<SyncJob | undefined>;
}

export function createOrdersService(db: DbClient): OrdersService {
  return {
    async list(userId, body) {
      const skip = body.skip ?? 0;
      const take = body.take ?? 50;
      const conds: ReturnType<typeof eq>[] = [eq(woltOrders.userId, userId)];

      if (body.q && body.q.trim()) {
        const pattern = `%${body.q.trim()}%`;
        // match venue name OR any line item name
        const subquery = db.select({ id: woltOrders.id })
          .from(woltOrders)
          .leftJoin(woltOrderItems, eq(woltOrderItems.orderId, woltOrders.id))
          .where(and(
            eq(woltOrders.userId, userId),
            or(
              ilike(woltOrders.venueName, pattern),
              ilike(woltOrderItems.name, pattern),
            )!,
          ));
        conds.push(sql`${woltOrders.id} IN ${subquery}` as any);
      }
      if (body.venueSlug) conds.push(eq(woltOrders.venueVendorSlug, body.venueSlug));
      if (body.productLine) conds.push(eq(woltOrders.venueProductLine, body.productLine));
      if (body.status) conds.push(eq(woltOrders.status, body.status));
      if (body.hasDetails === true)  conds.push(isNotNull(woltOrders.detailsScrapedAt) as any);
      if (body.hasDetails === false) conds.push(isNull(woltOrders.detailsScrapedAt) as any);
      if (body.placedFrom) conds.push(gte(woltOrders.placedAt, new Date(body.placedFrom)));
      if (body.placedTo)   conds.push(lte(woltOrders.placedAt, new Date(body.placedTo)));

      const where = and(...conds);

      const sortCol = (() => {
        const s = body.sort?.[0];
        if (!s) return desc(woltOrders.placedAt);
        const dir = s.direction === 'asc' ? asc : desc;
        switch (s.field) {
          case 'placedAt':   return dir(woltOrders.placedAt);
          case 'totalMinor': return dir(woltOrders.totalMinor);
          case 'venueName':  return dir(woltOrders.venueName);
          default:           return desc(woltOrders.placedAt);
        }
      })();

      const rows = await db.select().from(woltOrders).where(where)
        .orderBy(sortCol).limit(take).offset(skip);
      const [{ n }] = await db.select({ n: count() }).from(woltOrders).where(where);

      return {
        data: rows.map(orderRowToDto),
        meta: { total: Number(n), skip, take, sort: body.sort },
      };
    },

    async getById(userId, id) {
      const [r] = await db.select().from(woltOrders)
        .where(and(eq(woltOrders.userId, userId), eq(woltOrders.id, id))).limit(1);
      if (!r) return undefined;
      const items = await db.select().from(woltOrderItems)
        .where(eq(woltOrderItems.orderId, r.id))
        .orderBy(asc(woltOrderItems.name));
      return { order: orderRowToDto(r), items: items.map(itemRowToDto) };
    },

    async getStatus(userId, connectedAt) {
      const [{ n }] = await db.select({ n: count() }).from(woltOrders)
        .where(eq(woltOrders.userId, userId));
      const [lastSync] = await db.select({ at: vendorSyncJobs.finishedAt })
        .from(vendorSyncJobs)
        .where(and(
          eq(vendorSyncJobs.userId, userId),
          eq(vendorSyncJobs.status, 'succeeded'),
        ))
        .orderBy(desc(vendorSyncJobs.finishedAt))
        .limit(1);
      return {
        connected:   connectedAt != null,
        connectedAt: connectedAt ? connectedAt.toISOString() : null,
        lastSyncAt:  lastSync?.at ? lastSync.at.toISOString() : null,
        ordersInDb:  Number(n),
      };
    },

    async getJob(userId, jobId) {
      const [r] = await db.select().from(vendorSyncJobs)
        .where(and(eq(vendorSyncJobs.userId, userId), eq(vendorSyncJobs.id, jobId)))
        .limit(1);
      return r ? jobRowToDto(r) : undefined;
    },

    async findActiveJob(userId, vendor) {
      const [r] = await db.select().from(vendorSyncJobs)
        .where(and(
          eq(vendorSyncJobs.userId, userId),
          eq(vendorSyncJobs.vendor, vendor as any),
          or(eq(vendorSyncJobs.status, 'queued'), eq(vendorSyncJobs.status, 'running'))!,
        )).limit(1);
      return r ? jobRowToDto(r) : undefined;
    },
  };
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @market/api build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/wolt-orders.ts
git commit -m "feat(api/services): add orders service for list, detail, status, job queries"
```

---

## Task 14: Create the sync engine

**Files:**
- Modify: `packages/vendors/wolt/src/index.ts` (re-exports)
- Create: `apps/api/src/services/wolt-order-sync.ts`

- [ ] **Step 1: Re-export the new types and errors from the wolt package root**

Update `packages/vendors/wolt/src/index.ts` so the api package can import everything from `@market/vendor-wolt`:

```ts
export {
  createWoltClient,
  WoltAuthExpiredError,
  WoltRateLimitError,
  WoltClientError,
  type WoltClient,
  type WoltOrderSummary,
  type WoltOrderDetails,
} from './client.js';
export { WOLT_DEFAULTS } from './config.js';
```

Rebuild: `pnpm --filter @market/vendor-wolt build`. Expected: clean.

- [ ] **Step 2: Create the sync engine file**

```ts
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  users, stores, woltOrders, woltOrderItems, vendorSyncJobs,
} from '../db/schema.js';
import type { DbClient } from '../db/client.js';
import type { WoltTokenStore } from './wolt-token-store.js';
import {
  createWoltClient, WOLT_DEFAULTS,
  WoltAuthExpiredError, WoltRateLimitError, WoltClientError,
  type WoltClient, type WoltOrderSummary, type WoltOrderDetails,
} from '@market/vendor-wolt';

const STALE_JOB_TIMEOUT_MINUTES = 15;

export interface WoltOrderSyncer {
  /**
   * Creates a vendor_sync_jobs row and fires the sync off as a detached
   * background task. Returns immediately with the new jobId.
   *
   * If an active (queued/running) job for this user+vendor already
   * exists, throws an ActiveJobExistsError carrying that id.
   */
  startSync(
    userId: string,
    mode: 'latest' | 'full',
    withDetails: boolean,
  ): Promise<{ jobId: string }>;
}

export class NotConnectedError extends Error {
  constructor() { super('user has no wolt connection'); this.name = 'NotConnectedError'; }
}

export class ActiveJobExistsError extends Error {
  constructor(public readonly jobId: string) {
    super(`active sync job exists: ${jobId}`);
    this.name = 'ActiveJobExistsError';
  }
}

export function createWoltOrderSyncer(
  db: DbClient,
  tokenStore: WoltTokenStore,
  client: WoltClient = createWoltClient(WOLT_DEFAULTS),
): WoltOrderSyncer {
  async function reapStaleJobs(userId: string) {
    const cutoff = new Date(Date.now() - STALE_JOB_TIMEOUT_MINUTES * 60_000);
    await db.update(vendorSyncJobs)
      .set({ status: 'failed', errorMessage: 'stale', finishedAt: new Date() })
      .where(and(
        eq(vendorSyncJobs.userId, userId),
        eq(vendorSyncJobs.status, 'running'),
        sql`${vendorSyncJobs.startedAt} < ${cutoff}`,
      ));
  }

  async function runSync(
    jobId: string,
    userId: string,
    mode: 'latest' | 'full',
    withDetails: boolean,
  ): Promise<void> {
    let tokens = await tokenStore.loadTokens(userId);
    if (!tokens) {
      await db.update(vendorSyncJobs).set({
        status: 'failed',
        errorMessage: 'user has no wolt connection',
        finishedAt: new Date(),
      }).where(eq(vendorSyncJobs.id, jobId));
      return;
    }

    const runOnce = async (): Promise<void> => {
      // Determine stopAtOrderId for 'latest' mode
      let stopAtOrderId: string | undefined;
      if (mode === 'latest') {
        const [newest] = await db.select({ wid: woltOrders.woltOrderId })
          .from(woltOrders)
          .where(eq(woltOrders.userId, userId))
          .orderBy(desc(woltOrders.placedAt))
          .limit(1);
        stopAtOrderId = newest?.wid;
      }

      let cursor: string | undefined;
      let ordersSeen = 0, ordersNew = 0, ordersUpdated = 0, detailsFetched = 0;

      while (true) {
        const page = await client.listOrderHistory({
          accessToken: tokens!.accessToken, cursor, stopAtOrderId,
        });
        for (const o of page.orders) {
          ordersSeen++;
          const result = await upsertOrder(userId, o);
          if (result === 'inserted') ordersNew++;
          else if (result === 'updated') ordersUpdated++;
          if (ordersSeen % 5 === 0) {
            await db.update(vendorSyncJobs).set({
              ordersSeen, ordersNew, ordersUpdated,
            }).where(eq(vendorSyncJobs.id, jobId));
          }
        }
        if (page.reachedStop || !page.nextCursor) break;
        cursor = page.nextCursor;
      }

      if (withDetails) {
        const pending = await db.select({ id: woltOrders.id, wid: woltOrders.woltOrderId })
          .from(woltOrders)
          .where(and(eq(woltOrders.userId, userId), isNull(woltOrders.detailsScrapedAt)));
        for (let i = 0; i < pending.length; i += 20) {
          const chunk = pending.slice(i, i + 20);
          const details = await client.getOrderDetailsByIds({
            accessToken: tokens!.accessToken,
            orderIds: chunk.map((c) => c.wid),
          });
          for (const d of details) {
            await persistDetails(d);
            detailsFetched++;
          }
          await db.update(vendorSyncJobs).set({ detailsFetched })
            .where(eq(vendorSyncJobs.id, jobId));
        }
      }

      await db.update(vendorSyncJobs).set({
        status: 'succeeded',
        ordersSeen, ordersNew, ordersUpdated, detailsFetched,
        errorMessage: null,
        finishedAt: new Date(),
      }).where(eq(vendorSyncJobs.id, jobId));
    };

    try {
      await runOnce();
    } catch (err) {
      if (err instanceof WoltAuthExpiredError) {
        try {
          const refreshed = await client.refreshAccessToken({
            refreshToken: tokens!.refreshToken,
          });
          await tokenStore.rotateTokens(userId, {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
          });
          tokens = {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
          };
          await runOnce();
          return;
        } catch {
          await tokenStore.disconnect(userId);
          await db.update(vendorSyncJobs).set({
            status: 'failed',
            errorMessage: 'Wolt session expired, please reconnect',
            finishedAt: new Date(),
          }).where(eq(vendorSyncJobs.id, jobId));
          return;
        }
      }
      if (err instanceof WoltRateLimitError) {
        await db.update(vendorSyncJobs).set({
          status: 'failed',
          errorMessage: `Wolt rate limit hit (retry after ${err.retryAfterSec}s)`,
          finishedAt: new Date(),
        }).where(eq(vendorSyncJobs.id, jobId));
        return;
      }
      const msg = err instanceof WoltClientError ? err.message
        : (err instanceof Error ? err.message : String(err));
      await db.update(vendorSyncJobs).set({
        status: 'failed',
        errorMessage: msg.slice(0, 500),
        finishedAt: new Date(),
      }).where(eq(vendorSyncJobs.id, jobId));
    }
  }

  async function upsertOrder(
    userId: string,
    o: WoltOrderSummary,
  ): Promise<'inserted' | 'updated'> {
    // Try to link to an existing store row
    const [storeRow] = await db.select({ id: stores.id }).from(stores)
      .where(and(eq(stores.vendor, 'wolt'), eq(stores.vendorSlug, o.venueSlug)))
      .limit(1);
    const storeId = storeRow?.id ?? null;

    const res = await db.insert(woltOrders).values({
      userId,
      woltOrderId:      o.woltOrderId,
      placedAt:         o.placedAt ? new Date(o.placedAt) : new Date(),
      deliveredAt:      o.deliveredAt ? new Date(o.deliveredAt) : null,
      status:           o.status,
      venueVendorSlug:  o.venueSlug,
      venueName:        o.venueName,
      venueProductLine: (o.venueProductLine as any) ?? null,
      storeId,
      totalMinor:       o.totalMinor ?? null,
      currency:         o.currency,
      rawSummary:       o.raw,
    }).onConflictDoUpdate({
      target: [woltOrders.userId, woltOrders.woltOrderId],
      set: {
        status:          sql`excluded.status`,
        venueName:       sql`excluded.venue_name`,
        totalMinor:      sql`excluded.total_minor`,
        deliveredAt:     sql`excluded.delivered_at`,
        rawSummary:      sql`excluded.raw_summary`,
        syncedAt:        new Date(),
      },
    }).returning({ id: woltOrders.id, inserted: sql<boolean>`(xmax = 0)` });
    return res[0].inserted ? 'inserted' : 'updated';
  }

  async function persistDetails(d: WoltOrderDetails): Promise<void> {
    const [orderRow] = await db.select({ id: woltOrders.id, storeId: woltOrders.storeId })
      .from(woltOrders).where(eq(woltOrders.woltOrderId, d.woltOrderId)).limit(1);
    if (!orderRow) return;
    await db.update(woltOrders).set({
      detailsScrapedAt: new Date(),
      rawDetails:       d.raw,
    }).where(eq(woltOrders.id, orderRow.id));

    for (const it of d.items) {
      await db.insert(woltOrderItems).values({
        orderId:        orderRow.id,
        woltItemId:     it.woltItemId,
        name:           it.name,
        quantity:       String(it.quantity),
        unitPriceMinor: it.unitPriceMinor ?? null,
        totalMinor:     it.totalMinor ?? null,
        currency:       it.currency,
        imageUrl:       it.imageUrl ?? null,
        gtin:           it.gtin ?? null,
        itemId:         null,  // best-effort catalog match is a future enhancement
        raw:            it.raw,
      }).onConflictDoUpdate({
        target: [woltOrderItems.orderId, woltOrderItems.woltItemId],
        set: {
          name:           sql`excluded.name`,
          quantity:       sql`excluded.quantity`,
          unitPriceMinor: sql`excluded.unit_price_minor`,
          totalMinor:     sql`excluded.total_minor`,
          currency:       sql`excluded.currency`,
          imageUrl:       sql`excluded.image_url`,
          gtin:           sql`excluded.gtin`,
          raw:            sql`excluded.raw`,
        },
      });
    }
  }

  return {
    async startSync(userId, mode, withDetails) {
      await reapStaleJobs(userId);

      // Refuse to start a second concurrent sync
      const [active] = await db.select({ id: vendorSyncJobs.id }).from(vendorSyncJobs)
        .where(and(
          eq(vendorSyncJobs.userId, userId),
          eq(vendorSyncJobs.vendor, 'wolt'),
          sql`${vendorSyncJobs.status} IN ('queued', 'running')`,
        )).limit(1);
      if (active) throw new ActiveJobExistsError(active.id);

      // Confirm user has connection
      const conn = await tokenStore.getConnection(userId);
      if (!conn.connected) throw new NotConnectedError();

      const [inserted] = await db.insert(vendorSyncJobs).values({
        userId, vendor: 'wolt', mode, withDetails, status: 'running',
      }).returning({ id: vendorSyncJobs.id });

      // Fire and forget — never awaited here
      runSync(inserted.id, userId, mode, withDetails).catch((e) => {
        console.error(`[wolt-sync] job ${inserted.id} crashed:`, e);
      });

      return { jobId: inserted.id };
    },
  };
}
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @market/api build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/wolt-order-sync.ts packages/vendors/wolt/src/index.ts
git commit -m "feat(api/sync): add wolt order sync engine with latest/full + details"
```

---

## Task 15: Create the `/me/wolt` routes

**Files:**
- Create: `apps/api/src/routes/me-wolt.ts`

- [ ] **Step 1: Create the file**

```ts
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import * as v from 'valibot';
import { ROUTES, ConnectWoltBodySchema } from '@market/contracts';
import type { WoltTokenStore } from '../services/wolt-token-store.js';
import type { OrdersService } from '../services/wolt-orders.js';

export function meWoltRoutes(tokenStore: WoltTokenStore, orders: OrdersService): FastifyPluginAsync {
  const plugin: FastifyPluginAsync = async (app) => {
    app.post(ROUTES.me.wolt.connect, { preHandler: app.requireUser }, async (req, reply) => {
      const parsed = v.safeParse(ConnectWoltBodySchema, req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
      }
      const conn = await tokenStore.connect(req.userId!, {
        accessToken:  parsed.output.accessToken,
        refreshToken: parsed.output.refreshToken,
      });
      return reply.send({
        connected: conn.connected,
        connectedAt: conn.connectedAt?.toISOString() ?? null,
      });
    });

    app.delete(ROUTES.me.wolt.connect, { preHandler: app.requireUser }, async (req) => {
      const conn = await tokenStore.disconnect(req.userId!);
      return { connected: conn.connected };
    });

    app.get(ROUTES.me.wolt.status, { preHandler: app.requireUser }, async (req) => {
      const conn = await tokenStore.getConnection(req.userId!);
      return orders.getStatus(req.userId!, conn.connectedAt);
    });
  };

  return fp(plugin);
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @market/api build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/me-wolt.ts
git commit -m "feat(api/routes): add /me/wolt connect, disconnect, status"
```

---

## Task 16: Create the `/me/orders` routes

**Files:**
- Create: `apps/api/src/routes/me-orders.ts`

- [ ] **Step 1: Create the file**

```ts
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import * as v from 'valibot';
import {
  ROUTES,
  OrderListQueryBodySchema,
  StartSyncBodySchema,
  IdParamsSchema,
} from '@market/contracts';
import type { OrdersService } from '../services/wolt-orders.js';
import {
  ActiveJobExistsError,
  NotConnectedError,
  type WoltOrderSyncer,
} from '../services/wolt-order-sync.js';

export function meOrdersRoutes(
  orders: OrdersService,
  syncer: WoltOrderSyncer,
): FastifyPluginAsync {
  const plugin: FastifyPluginAsync = async (app) => {
    app.post(ROUTES.me.orders.query, { preHandler: app.requireUser }, async (req, reply) => {
      const parsed = v.safeParse(OrderListQueryBodySchema, req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
      }
      return orders.list(req.userId!, parsed.output);
    });

    app.get('/v1/me/orders/:id', { preHandler: app.requireUser }, async (req, reply) => {
      const parsed = v.safeParse(IdParamsSchema, req.params);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid id' });
      const detail = await orders.getById(req.userId!, parsed.output.id);
      if (!detail) return reply.code(404).send({ error: 'not found' });
      return detail;
    });

    app.post(ROUTES.me.orders.sync, { preHandler: app.requireUser }, async (req, reply) => {
      const parsed = v.safeParse(StartSyncBodySchema, req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
      }
      try {
        const { jobId } = await syncer.startSync(
          req.userId!,
          parsed.output.mode,
          parsed.output.withDetails,
        );
        return { jobId, status: 'running' as const };
      } catch (err) {
        if (err instanceof NotConnectedError) {
          return reply.code(409).send({ error: 'not_connected' });
        }
        if (err instanceof ActiveJobExistsError) {
          return reply.code(409).send({ error: 'active_job', jobId: err.jobId });
        }
        throw err;
      }
    });

    app.get('/v1/me/orders/sync/:id', { preHandler: app.requireUser }, async (req, reply) => {
      const parsed = v.safeParse(IdParamsSchema, req.params);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid id' });
      const job = await orders.getJob(req.userId!, parsed.output.id);
      if (!job) return reply.code(404).send({ error: 'not found' });
      return job;
    });
  };

  return fp(plugin);
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @market/api build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/me-orders.ts
git commit -m "feat(api/routes): add /me/orders query, detail, sync trigger, sync poll"
```

---

## Task 17: Register the new routes and services in `server.ts`

**Files:**
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Re-export the new routes from the routes index**

In `apps/api/src/routes/index.ts`, add:

```ts
export { meWoltRoutes } from './me-wolt.js';
export { meOrdersRoutes } from './me-orders.js';
```

- [ ] **Step 2: Wire up the new services and routes in `server.ts`**

In `apps/api/src/server.ts`, locate the block (around lines 40–44) that currently does `await app.register(storesRoutes(...))` etc. Add:

```ts
import { createWoltTokenStore } from './services/wolt-token-store.js';
import { createOrdersService } from './services/wolt-orders.js';
import { createWoltOrderSyncer } from './services/wolt-order-sync.js';
import { meWoltRoutes, meOrdersRoutes } from './routes/index.js';

// ... inside the server bootstrap, after db is created ...
const tokenStore = createWoltTokenStore(db);
const ordersSvc  = createOrdersService(db);
const syncer     = createWoltOrderSyncer(db, tokenStore);

// ... alongside the existing app.register calls ...
await app.register(meWoltRoutes(tokenStore, ordersSvc));
await app.register(meOrdersRoutes(ordersSvc, syncer));
```

- [ ] **Step 3: Boot the api, check it starts cleanly**

Run: `pnpm --filter @market/api dev`
Expected: server starts, prints its listening port, no route-registration errors in the log. Kill with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/index.ts apps/api/src/server.ts
git commit -m "feat(api/server): wire up wolt token store, orders service, and new routes"
```

---

## Task 18: End-to-end API verification with curl

Before moving to the UI, confirm the backend works end to end with a real token.

- [ ] **Step 1: Pick a user id**

In a browser with your web dev server running, `localStorage.getItem('market.userId')` gives you one. Or, for a brand-new user:

```bash
curl -s -X POST http://localhost:3000/v1/users -H 'content-type: application/json' -d '{}'
```

The response contains `"id": "<12 char>"`. Save that as `UID` in your shell.

- [ ] **Step 2: Paste real Wolt tokens (get them from wolt.com devtools)**

```bash
UID='your-user-id'
ACC='paste __wtoken value'
REF='paste __wrtoken value'

curl -s -X POST http://localhost:3000/v1/me/wolt/connect \
  -H "x-user-id: $UID" \
  -H 'content-type: application/json' \
  -d "{\"accessToken\":\"$ACC\",\"refreshToken\":\"$REF\"}"
```

Expected: `{"connected":true,"connectedAt":"..."}`

- [ ] **Step 3: Check status**

```bash
curl -s http://localhost:3000/v1/me/wolt/status -H "x-user-id: $UID"
```

Expected: `{"connected":true,"connectedAt":"...","lastSyncAt":null,"ordersInDb":0}`

- [ ] **Step 4: Trigger a latest-only sync (no details)**

```bash
curl -s -X POST http://localhost:3000/v1/me/orders/sync \
  -H "x-user-id: $UID" -H 'content-type: application/json' \
  -d '{"mode":"latest","withDetails":false}'
```

Expected: `{"jobId":"<12 char>","status":"running"}`. Save the jobId as `JOB`.

- [ ] **Step 5: Poll the job until it finishes**

```bash
JOB='paste-job-id'
curl -s http://localhost:3000/v1/me/orders/sync/$JOB -H "x-user-id: $UID"
```

Run a few times until `status` is `"succeeded"` (or `"failed"` — inspect `errorMessage` if so). `ordersNew` should be > 0 on a first run.

- [ ] **Step 6: List orders**

```bash
curl -s -X POST http://localhost:3000/v1/me/orders/query \
  -H "x-user-id: $UID" -H 'content-type: application/json' \
  -d '{"take":5}' | jq .
```

Expected: `data` is a non-empty array of orders with `placedAt`, `venueName`, `totalMinor`, `status`.

- [ ] **Step 7: Trigger a latest-only sync with details**

```bash
curl -s -X POST http://localhost:3000/v1/me/orders/sync \
  -H "x-user-id: $UID" -H 'content-type: application/json' \
  -d '{"mode":"latest","withDetails":true}'
```

Wait for it to finish (step 5 again). `detailsFetched` should be > 0.

- [ ] **Step 8: Get a single order with items**

Pick an order id from Step 6's response:

```bash
OID='paste-order-id'
curl -s http://localhost:3000/v1/me/orders/$OID -H "x-user-id: $UID" | jq .
```

Expected: the `items` array is populated with line items.

- [ ] **Step 9: If any of the above failed, fix and re-commit**

Common issues:
- Field names in `normalizeOrderSummary` / `normalizeOrderDetails` don't match what Wolt actually returns — fix the accessors, rebuild, re-trigger sync.
- `X-User-Id` rejected — confirm Task 1's plugin fix is in place.
- 500 on connect — confirm `ENCRYPTION_KEY_HEX` is set in `.env`.

Any fix should be a small separate commit referencing this task.

- [ ] **Step 10: Disconnect to leave the system clean for UI work**

```bash
curl -s -X DELETE http://localhost:3000/v1/me/wolt/connect -H "x-user-id: $UID"
```

Expected: `{"connected":false}`.

---

## Task 19: Extend the web api-client

**Files:**
- Modify: `apps/web/src/api-client.ts`

- [ ] **Step 1: Add imports at the top of `api-client.ts`**

Extend the existing type import from `@market/contracts`:

```ts
import type {
  // existing types...
  ConnectWoltBody, WoltStatus,
  OrderListQueryBody, OrderListResponse, OrderDetail,
  StartSyncBody, SyncJob,
} from '@market/contracts';
```

- [ ] **Step 2: Add methods to the `api` object**

Inside the `api` object literal (after the plans methods):

```ts
// wolt token
getWoltStatus: () =>
  raw<WoltStatus>(ROUTES.me.wolt.status, { method: 'GET', headers: userHeaders() }),
connectWolt: (body: ConnectWoltBody) =>
  raw<{ connected: true; connectedAt: string }>(
    ROUTES.me.wolt.connect,
    { method: 'POST', body: JSON.stringify(body), headers: userHeaders() },
  ),
disconnectWolt: () =>
  raw<{ connected: false }>(
    ROUTES.me.wolt.connect,
    { method: 'DELETE', headers: userHeaders() },
  ),

// orders
queryOrders: (body: OrderListQueryBody) =>
  raw<OrderListResponse>(
    ROUTES.me.orders.query,
    { method: 'POST', body: JSON.stringify(body), headers: userHeaders() },
  ),
getOrder: (id: string) =>
  raw<OrderDetail>(ROUTES.me.orders.get(id), { method: 'GET', headers: userHeaders() }),
startOrderSync: (body: StartSyncBody) =>
  raw<{ jobId: string; status: 'running' }>(
    ROUTES.me.orders.sync,
    { method: 'POST', body: JSON.stringify(body), headers: userHeaders() },
  ),
getSyncJob: (id: string) =>
  raw<SyncJob>(ROUTES.me.orders.job(id), { method: 'GET', headers: userHeaders() }),
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @market/web build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api-client.ts
git commit -m "feat(web/api): add wolt token and orders client methods"
```

---

## Task 20: Create the hooks

**Files:**
- Create: `apps/web/src/hooks/use-wolt-status.ts`
- Create: `apps/web/src/hooks/use-orders-query.ts`
- Create: `apps/web/src/hooks/use-sync-job.ts`

- [ ] **Step 1: Create `use-wolt-status.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useWoltStatus() {
  return useQuery({
    queryKey: ['me', 'wolt', 'status'],
    queryFn:  () => api.getWoltStatus(),
  });
}
```

- [ ] **Step 2: Create `use-orders-query.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { OrderListQueryBody } from '@market/contracts';
import { api } from '../api-client.js';

export function useOrdersQuery(body: OrderListQueryBody) {
  return useQuery({
    queryKey: ['me', 'orders', 'query', body],
    queryFn:  () => api.queryOrders(body),
  });
}
```

- [ ] **Step 3: Create `use-sync-job.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useSyncJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['me', 'orders', 'sync', jobId],
    queryFn:  () => api.getSyncJob(jobId!),
    enabled:  !!jobId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'queued' || s === 'running' ? 2000 : false;
    },
  });
}
```

- [ ] **Step 4: Build**

Run: `pnpm --filter @market/web build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-wolt-status.ts apps/web/src/hooks/use-orders-query.ts apps/web/src/hooks/use-sync-job.ts
git commit -m "feat(web/hooks): add wolt status, orders query, and sync job hooks"
```

---

## Task 21: Create the connect panel component

**Files:**
- Create: `apps/web/src/pages/orders/connect-panel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api-client.js';

export function WoltConnectPanel() {
  const qc = useQueryClient();
  const [access, setAccess]   = useState('');
  const [refresh, setRefresh] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const connect = useMutation({
    mutationFn: () => api.connectWolt({ accessToken: access.trim(), refreshToken: refresh.trim() }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['me', 'wolt', 'status'] });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="mx-auto max-w-xl p-6 border rounded-lg space-y-4">
      <h2 className="text-xl font-semibold">Connect your Wolt account</h2>
      <p className="text-sm text-muted-foreground">
        Open <a className="underline" href="https://wolt.com" target="_blank">wolt.com</a>,
        log in, then open DevTools → Application → Cookies → wolt.com, and copy the
        values of <code>__wtoken</code> and <code>__wrtoken</code> into the fields below.
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Access token (__wtoken)</span>
        <textarea
          className="w-full border rounded p-2 text-xs font-mono"
          rows={3}
          value={access}
          onChange={(e) => setAccess(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Refresh token (__wrtoken)</span>
        <textarea
          className="w-full border rounded p-2 text-xs font-mono"
          rows={3}
          value={refresh}
          onChange={(e) => setRefresh(e.target.value)}
        />
      </label>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <button
        type="button"
        disabled={!access.trim() || !refresh.trim() || connect.isPending}
        onClick={() => { setErr(null); connect.mutate(); }}
        className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
      >
        {connect.isPending ? 'Connecting…' : 'Connect'}
      </button>
      <p className="text-xs text-muted-foreground">
        Tokens are stored encrypted and never leave the server except to sync your orders from Wolt.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @market/web build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/orders/connect-panel.tsx
git commit -m "feat(web/orders): add wolt connect panel component"
```

---

## Task 22: Create the orders list page

**Files:**
- Create: `apps/web/src/pages/orders/list.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearch, Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OrderListQueryBody, StartSyncBody } from '@market/contracts';
import { api } from '../../api-client.js';
import { useWoltStatus } from '../../hooks/use-wolt-status.js';
import { useOrdersQuery } from '../../hooks/use-orders-query.js';
import { useSyncJob } from '../../hooks/use-sync-job.js';
import { PaginationControls } from '../../features/listing/pagination-controls.js';
import { WoltConnectPanel } from './connect-panel.js';

const SORT_OPTIONS = [
  { label: 'Newest',          field: 'placedAt',   direction: 'desc' as const },
  { label: 'Oldest',          field: 'placedAt',   direction: 'asc'  as const },
  { label: 'Highest total',   field: 'totalMinor', direction: 'desc' as const },
  { label: 'Lowest total',    field: 'totalMinor', direction: 'asc'  as const },
  { label: 'Venue A–Z',       field: 'venueName',  direction: 'asc'  as const },
];

const SYNC_MODES: Array<{ label: string; body: StartSyncBody }> = [
  { label: 'Latest only',              body: { mode: 'latest', withDetails: false } },
  { label: 'Latest + details',         body: { mode: 'latest', withDetails: true  } },
  { label: 'Full rescrape',            body: { mode: 'full',   withDetails: false } },
  { label: 'Full rescrape + details',  body: { mode: 'full',   withDetails: true  } },
];

export function OrdersListPage() {
  const search = useSearch({ strict: false }) as Partial<OrderListQueryBody & { sortIdx: number }>;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const status = useWoltStatus();

  const [jobId, setJobId] = useState<string | undefined>();
  const job = useSyncJob(jobId);

  const sortIdx = search.sortIdx ?? 0;
  const body: OrderListQueryBody = useMemo(() => ({
    skip: search.skip ?? 0,
    take: search.take ?? 25,
    q:    search.q,
    sort: [{ field: SORT_OPTIONS[sortIdx].field, direction: SORT_OPTIONS[sortIdx].direction }],
    venueSlug:   search.venueSlug,
    productLine: search.productLine,
    status:      search.status,
    hasDetails:  search.hasDetails,
    placedFrom:  search.placedFrom,
    placedTo:    search.placedTo,
  }), [search, sortIdx]);

  const list = useOrdersQuery(body);

  const startSync = useMutation({
    mutationFn: (b: StartSyncBody) => api.startOrderSync(b),
    onSuccess:  (r) => setJobId(r.jobId),
  });
  const disconnect = useMutation({
    mutationFn: () => api.disconnectWolt(),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['me', 'wolt', 'status'] });
      qc.invalidateQueries({ queryKey: ['me', 'orders', 'query'] });
    },
  });

  // When a running job terminates, refetch the list and clear the polling id.
  useEffect(() => {
    const s = job.data?.status;
    if (s !== 'succeeded' && s !== 'failed') return;
    qc.invalidateQueries({ queryKey: ['me', 'orders', 'query'] });
    qc.invalidateQueries({ queryKey: ['me', 'wolt', 'status'] });
    setJobId(undefined);
  }, [job.data?.status, qc]);

  if (status.isLoading) return <div className="p-6">Loading…</div>;
  if (!status.data?.connected) return <WoltConnectPanel />;

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">
            {status.data.ordersInDb} in DB
            {status.data.lastSyncAt && ` · last synced ${new Date(status.data.lastSyncAt).toLocaleString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <details className="relative">
            <summary className="px-3 py-2 rounded bg-secondary cursor-pointer select-none">
              Refresh ▾
            </summary>
            <div className="absolute right-0 mt-1 w-56 border rounded bg-popover shadow z-10">
              {SYNC_MODES.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  className="block w-full text-left px-3 py-2 hover:bg-accent"
                  onClick={() => startSync.mutate(m.body)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </details>
          <button
            type="button"
            onClick={() => disconnect.mutate()}
            className="text-sm text-muted-foreground underline"
          >
            Disconnect
          </button>
        </div>
      </header>

      {job.data && (job.data.status === 'queued' || job.data.status === 'running') && (
        <div className="p-3 rounded bg-accent text-sm">
          Syncing… {job.data.ordersSeen} orders seen
          {job.data.withDetails && `, ${job.data.detailsFetched} with details`}
          {job.data.ordersNew > 0 && ` (${job.data.ordersNew} new)`}
        </div>
      )}
      {job.data?.status === 'failed' && (
        <div className="p-3 rounded bg-destructive/10 text-sm text-destructive">
          Sync failed: {job.data.errorMessage ?? 'unknown error'}
        </div>
      )}

      <div className="flex gap-2 items-end flex-wrap">
        <label className="flex-1 min-w-64">
          <span className="block text-xs text-muted-foreground">Search</span>
          <input
            type="search"
            placeholder="Venue or item name"
            defaultValue={search.q ?? ''}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                navigate({ search: { ...search, q: (e.target as HTMLInputElement).value || undefined, skip: 0 } });
              }
            }}
            className="w-full border rounded px-2 py-1"
          />
        </label>
        <label>
          <span className="block text-xs text-muted-foreground">Sort</span>
          <select
            value={sortIdx}
            onChange={(e) => navigate({ search: { ...search, sortIdx: Number(e.target.value), skip: 0 } })}
            className="border rounded px-2 py-1"
          >
            {SORT_OPTIONS.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}
          </select>
        </label>
        <label>
          <span className="block text-xs text-muted-foreground">Status</span>
          <input
            type="text"
            defaultValue={search.status ?? ''}
            placeholder="e.g. delivered"
            onBlur={(e) => navigate({ search: { ...search, status: e.target.value || undefined, skip: 0 } })}
            className="border rounded px-2 py-1 w-32"
          />
        </label>
        <label>
          <span className="block text-xs text-muted-foreground">Has details</span>
          <select
            value={search.hasDetails == null ? '' : String(search.hasDetails)}
            onChange={(e) => navigate({
              search: {
                ...search,
                hasDetails: e.target.value === '' ? undefined : e.target.value === 'true',
                skip: 0,
              },
            })}
            className="border rounded px-2 py-1"
          >
            <option value="">any</option>
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
        </label>
      </div>

      {list.isLoading ? (
        <div>Loading orders…</div>
      ) : list.error ? (
        <div className="text-destructive">Failed: {String(list.error)}</div>
      ) : (
        <>
          <div className="divide-y border rounded">
            {list.data!.data.map((o) => (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="flex items-center justify-between p-3 hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{o.venueName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.placedAt).toLocaleString()} · {o.status}
                    {!o.detailsScrapedAt && ' · details missing'}
                  </div>
                </div>
                <div className="tabular-nums text-right">
                  {o.totalMinor != null
                    ? `${(o.totalMinor / 100).toFixed(2)} ${o.currency}`
                    : '—'}
                </div>
              </Link>
            ))}
            {list.data!.data.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No orders match.</div>
            )}
          </div>
          <PaginationControls
            skip={body.skip ?? 0}
            take={body.take ?? 25}
            total={list.data!.meta.total}
            onChange={(skip) => navigate({ search: { ...search, skip } })}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @market/web build`
Expected: clean. If TypeScript complains about `useSearch` schema shape, widen it with `as any` and revisit once the route is registered in Task 24.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/orders/list.tsx
git commit -m "feat(web/orders): add list page with search, filters, sort, sync"
```

---

## Task 23: Create the orders detail page

**Files:**
- Create: `apps/web/src/pages/orders/detail.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useParams, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api-client.js';

export function OrderDetailPage() {
  const { orderId } = useParams({ strict: false }) as { orderId: string };
  const q = useQuery({
    queryKey: ['me', 'orders', 'detail', orderId],
    queryFn:  () => api.getOrder(orderId),
    enabled:  !!orderId,
  });

  if (q.isLoading) return <div className="p-6">Loading…</div>;
  if (q.error)     return <div className="p-6 text-destructive">Failed: {String(q.error)}</div>;
  if (!q.data)     return <div className="p-6">Not found.</div>;

  const { order, items } = q.data;
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <Link to="/orders" className="text-sm underline text-muted-foreground">← All orders</Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {order.storeId ? (
            <Link to={`/stores/${order.storeId}`} className="hover:underline">{order.venueName}</Link>
          ) : order.venueName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Placed {new Date(order.placedAt).toLocaleString()}
          {order.deliveredAt && ` · delivered ${new Date(order.deliveredAt).toLocaleString()}`}
          {' · '}{order.status}
        </p>
        <p className="text-3xl font-bold tabular-nums">
          {order.totalMinor != null
            ? `${(order.totalMinor / 100).toFixed(2)} ${order.currency}`
            : '—'}
        </p>
      </header>

      <section>
        <h2 className="font-semibold mb-2">Items</h2>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground p-3 border rounded">
            Details haven't been scraped yet. Trigger a "Latest + details" refresh on the orders list.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b">
                  <td className="py-2">
                    {it.imageUrl && (
                      <img src={it.imageUrl} alt="" className="inline-block w-8 h-8 rounded mr-2 object-cover align-middle" />
                    )}
                    {it.itemId ? (
                      <Link to={`/products/${it.itemId}`} className="hover:underline">{it.name}</Link>
                    ) : it.name}
                  </td>
                  <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-2 text-right tabular-nums">
                    {it.unitPriceMinor != null ? `${(it.unitPriceMinor / 100).toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {it.totalMinor != null ? `${(it.totalMinor / 100).toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @market/web build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/orders/detail.tsx
git commit -m "feat(web/orders): add order detail page"
```

---

## Task 24: Register the `/orders` routes in the TanStack router

**Files:**
- Modify: `apps/web/src/router.ts`

- [ ] **Step 1: Add imports and route definitions**

In `apps/web/src/router.ts`, follow the exact pattern used by the existing `/stores` and `/plans` routes. Add imports:

```ts
import { OrdersListPage }  from './pages/orders/list.js';
import { OrderDetailPage } from './pages/orders/detail.js';
import * as v from 'valibot';
```

Define a search schema for the list page (adjust `v` import if already present):

```ts
const orderListSearchSchema = v.object({
  skip:        v.optional(v.number()),
  take:        v.optional(v.number()),
  q:           v.optional(v.string()),
  sortIdx:     v.optional(v.number()),
  venueSlug:   v.optional(v.string()),
  productLine: v.optional(v.string()),
  status:      v.optional(v.string()),
  hasDetails:  v.optional(v.boolean()),
  placedFrom:  v.optional(v.string()),
  placedTo:    v.optional(v.string()),
});
```

Add the two routes to the existing route array (mimicking the stores list/detail pair):

```ts
const ordersListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders',
  component: OrdersListPage,
  validateSearch: (s) => {
    const r = v.safeParse(orderListSearchSchema, s);
    return r.success ? r.output : {};
  },
});

const orderDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders/$orderId',
  component: OrderDetailPage,
});
```

Add both routes to whatever array is passed to `rootRoute.addChildren([...])` (or its equivalent in the file).

- [ ] **Step 2: Build**

Run: `pnpm --filter @market/web build`
Expected: clean. If TypeScript complains about the `useSearch` / `useParams` calls from Tasks 22/23, the strict-mode-off generic should resolve itself now that the routes are registered.

- [ ] **Step 3: Boot the dev server**

Run: `pnpm --filter @market/web dev`

Visit `http://localhost:5173/orders` in a browser. Expected: the "Connect your Wolt account" panel appears.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router.ts
git commit -m "feat(web/router): register /orders list and detail routes"
```

---

## Task 25: End-to-end UI verification

Final manual pass with the dev server running. Keep the terminals for `@market/api dev` and `@market/web dev` open.

- [ ] **Step 1: Connect in the UI**

Paste your `__wtoken` and `__wrtoken` into the Connect panel on `/orders`. Click Connect.
Expected: panel disappears, empty orders list appears with a "Refresh ▾" dropdown.

- [ ] **Step 2: Trigger "Latest only" sync**

Click Refresh ▾ → Latest only.
Expected: a progress banner appears ("Syncing… N orders seen"). After a few seconds it disappears and the list populates with your orders.

- [ ] **Step 3: Try each filter and sort**

- Type a venue name in search → press Enter → expect filtered list.
- Change sort to "Highest total" → expect re-ordered list.
- Toggle Has details → expect filter to apply.

- [ ] **Step 4: Click into an order**

Expected: detail page loads; "Details haven't been scraped yet" message.

- [ ] **Step 5: Trigger "Latest + details" sync**

Back on `/orders`, Refresh ▾ → Latest + details. Watch the progress banner. When it completes, re-open the same order detail.
Expected: the Items table is populated with name / qty / unit / total.

- [ ] **Step 6: Disconnect and reconnect**

Click "Disconnect" in the page header.
Expected: Connect panel re-appears. Paste tokens again and connect.
Expected: the previously synced orders are still there (data persists across disconnects).

- [ ] **Step 7: Confirm DB tokens are ciphertext**

In your dev Postgres client:

```sql
SELECT id, wolt_connected_at, length(wolt_access_token_enc), substring(wolt_access_token_enc from 1 for 20)
  FROM users WHERE wolt_connected_at IS NOT NULL;
```

Expected: the substring is a base64-looking blob, NOT the plaintext token value.

- [ ] **Step 8: Punch-list any bugs**

If anything broke, fix it as a follow-up commit referencing the specific step. Common things to watch for:

- Sort dropdown doesn't re-query → check `useOrdersQuery` key includes the sort.
- Sync banner never disappears → check the `if (job.data?.status === 'succeeded' ...)` block in list.tsx; it may be trapped in a re-render loop. If so, refactor into a `useEffect`.
- Wolt returned different field names than assumed → fix `normalizeOrderSummary` / `normalizeOrderDetails` in the Wolt client.

- [ ] **Step 9: Final commit of any follow-up fixes**

```bash
git add <files>
git commit -m "fix(web/orders): <specific issue>"
```

---

## Follow-up plans (out of scope here)

These were explicitly deferred:

- **Test harness.** Set up vitest in `@market/api` + `@market/vendor-wolt`, add a test-db bootstrap, write unit tests for `crypto.ts`, normalizers, sync-engine idempotency, and route tests for all 7 new endpoints. See the "Testing" section of the design spec for the intended coverage.
- **Listing toolbar refactor.** The design called for factoring the search / sort / pagination chrome into a shared `<ListingToolbar>` component in `features/listing/`. Deferred to keep this plan focused on the orders feature; the current implementation duplicates the toolbar JSX in `list.tsx`.
- **Catalog matching for items.** `wolt_order_items.item_id` is always `null` in this plan. A follow-up can add GTIN-first, name-fuzzy fallback matching in `persistDetails` to enable "you've bought this before" hints.
- **Background pre-expiry token refresh.** Currently refresh is only attempted reactively on 401.
