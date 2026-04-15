# Web + Plans Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the web app around four sections (Stores, Products, Vendors, Plans) backed by a consistent, paginated, typed API with server-persisted shopping plans that carry user ids.

**Architecture:** Rename `venues` → `stores` and `shopping-list` → `plan` end-to-end. Unify all listing endpoints on `POST /v1/<resource>/query` with `{ skip, take, q, sort, ...filters }` body and `{ data, meta }` envelope. Give every entity a globally unique `slug` alongside its UUID `id`. Persist plans server-side with a real `users` table and `X-User-Id` header as an interim auth. Switch the web router from file-based to config-based.

**Tech Stack:** TypeScript, pnpm + Turborepo, Drizzle ORM + PostgreSQL (+ pgvector), Fastify, Valibot (contracts), Vite + React 18 + TanStack Router (config-based) + TanStack Query, shadcn/Tailwind, Zod (MCP tool schemas only).

**Source of truth:** `docs/superpowers/specs/2026-04-15-web-plans-redesign-design.md`. When a step says "copy the code block from §X.Y", open the spec, find that section, and copy the code block verbatim. The plan references the spec to avoid duplicating large typed code.

---

## Prerequisites

- Current branch: `main`. This plan creates new commits on `main`. If you prefer a branch, branch before Task 1.
- Local Postgres + pgvector running (see existing `docker-compose.yml`).
- `pnpm install` at the repo root succeeds and `pnpm -r typecheck` is green before you start.
- `DATABASE_URL` and `API_TOKEN` set in `.env`.

---

## Task 1: `@market/vendor-core` slug helpers

**Files:**
- Create: `packages/vendors/core/src/slug.ts`
- Modify: `packages/vendors/core/src/index.ts`

- [ ] **Step 1: Create `packages/vendors/core/src/slug.ts`**

```ts
import { createHash } from 'node:crypto';

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function buildStoreSlug(vendor: string, vendorSlug: string): string {
  return `${vendor}-${slugify(vendorSlug)}`;
}

export function buildCategorySlug(storeSlug: string, vendorCategorySlug: string): string {
  return `${storeSlug}-${slugify(vendorCategorySlug)}`;
}

function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 6);
}

export function buildItemSlug(
  storeSlug: string,
  itemName: string,
  vendorItemId: string,
): string {
  const base = slugify(itemName) || 'item';
  return `${storeSlug}-${base}-${shortHash(vendorItemId)}`;
}
```

- [ ] **Step 2: Export slug helpers from `packages/vendors/core/src/index.ts`**

Add to the end of the file:

```ts
export { slugify, buildStoreSlug, buildCategorySlug, buildItemSlug } from './slug.js';
```

- [ ] **Step 3: Typecheck vendor-core**

Run: `pnpm --filter @market/vendor-core typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/vendors/core/src/slug.ts packages/vendors/core/src/index.ts
git commit -m "feat(vendor-core): add deterministic slug builders"
```

---

## Task 2: `@market/contracts` — common primitives

**Files:**
- Modify: `packages/contracts/src/common.ts`

- [ ] **Step 1: Append new primitives to `common.ts`**

Append the code block from **spec §5.1** verbatim to the end of `packages/contracts/src/common.ts`. That adds `SortDirectionSchema`, `SortItemSchema`, `PaginationBaseSchema`, `envelope(...)`, and `IdOrSlugParamsSchema`.

- [ ] **Step 2: Typecheck contracts**

Run: `pnpm --filter @market/contracts typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/common.ts
git commit -m "feat(contracts): add pagination + envelope + sort primitives"
```

---

## Task 3: `@market/contracts` — stores.ts (rename from venues.ts)

**Files:**
- Delete: `packages/contracts/src/venues.ts`
- Create: `packages/contracts/src/stores.ts`

- [ ] **Step 1: Delete the old file**

```bash
git rm packages/contracts/src/venues.ts
```

- [ ] **Step 2: Create `packages/contracts/src/stores.ts`**

Copy **spec §5.2** verbatim into `packages/contracts/src/stores.ts`. Prepend the imports line:

```ts
import * as v from 'valibot';
import {
  CoordinatesSchema,
  PriceMinorSchema,
  ProductLineSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  SortItemSchema,
  envelope,
} from './common.js';
```

And append type exports at the end:

```ts
export type Store = v.InferOutput<typeof StoreSchema>;
export type StoreQueryBody = v.InferOutput<typeof StoreQueryBodySchema>;
export type StoreQueryResponse = v.InferOutput<typeof StoreQueryResponseSchema>;
export type GetStoreResponse = v.InferOutput<typeof GetStoreResponseSchema>;
export type RefreshAssortmentResponse = v.InferOutput<typeof RefreshAssortmentResponseSchema>;
```

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/venues.ts packages/contracts/src/stores.ts
git commit -m "refactor(contracts): rename venues.ts to stores.ts with new listing schemas"
```

(The `index.ts` export still points at `./venues.js` — contracts typecheck will fail until Task 7. Keep going.)

---

## Task 4: `@market/contracts` — catalog.ts rewrite

**Files:**
- Modify: `packages/contracts/src/catalog.ts`

- [ ] **Step 1: Replace the entire file contents with the code from spec §5.3**

Prepend imports:

```ts
import * as v from 'valibot';
import {
  PriceMinorSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  SortItemSchema,
  envelope,
} from './common.js';
```

Then paste spec §5.3 verbatim. Append type exports at the end:

```ts
export type SearchMode = v.InferOutput<typeof SearchModeSchema>;
export type Item = v.InferOutput<typeof ItemSchema>;
export type ItemQueryBody = v.InferOutput<typeof ItemQueryBodySchema>;
export type ItemQueryResponse = v.InferOutput<typeof ItemQueryResponseSchema>;
export type GetItemResponse = v.InferOutput<typeof GetItemResponseSchema>;
export type CatalogStatsResponse = v.InferOutput<typeof CatalogStatsResponseSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add packages/contracts/src/catalog.ts
git commit -m "refactor(contracts): rewrite catalog schemas for unified items/query"
```

---

## Task 5: `@market/contracts` — plans.ts (replaces shopping-list.ts)

**Files:**
- Delete: `packages/contracts/src/shopping-list.ts`
- Create: `packages/contracts/src/plans.ts`

- [ ] **Step 1: Before deleting, extract the plan-result types we keep**

Open `packages/contracts/src/shopping-list.ts`. Copy these four definitions to a scratchpad — they'll be pasted into the new `plans.ts`:
- `ItemCandidateSchema`
- `ShoppingPlanLineSchema`
- `CheapestPerItemPlanSchema`
- `SingleStorePlanSchema`

- [ ] **Step 2: Delete the old file**

```bash
git rm packages/contracts/src/shopping-list.ts
```

- [ ] **Step 3: Create `packages/contracts/src/plans.ts`**

Write the file with these three parts in order:

1. Imports:
```ts
import * as v from 'valibot';
import {
  PriceMinorSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  SortItemSchema,
  envelope,
} from './common.js';
```

2. The four kept schemas from Step 1 (`ItemCandidateSchema`, `ShoppingPlanLineSchema`, `CheapestPerItemPlanSchema`, `SingleStorePlanSchema`) pasted verbatim from the scratchpad.

3. The new plan schemas from **spec §5.4** verbatim.

Append type exports at the end:
```ts
export type PlanType = v.InferOutput<typeof PlanTypeSchema>;
export type PlanStrategy = v.InferOutput<typeof PlanStrategySchema>;
export type PlanLineKind = v.InferOutput<typeof PlanLineKindSchema>;
export type PlanLine = v.InferOutput<typeof PlanLineSchema>;
export type Plan = v.InferOutput<typeof PlanSchema>;
export type PlanDetail = v.InferOutput<typeof PlanDetailSchema>;
export type PlanQueryBody = v.InferOutput<typeof PlanQueryBodySchema>;
export type PlanQueryResponse = v.InferOutput<typeof PlanQueryResponseSchema>;
export type CreatePlanBody = v.InferOutput<typeof CreatePlanBodySchema>;
export type UpdatePlanBody = v.InferOutput<typeof UpdatePlanBodySchema>;
export type AddPlanLineBody = v.InferOutput<typeof AddPlanLineBodySchema>;
export type UpdatePlanLineBody = v.InferOutput<typeof UpdatePlanLineBodySchema>;
export type ComputePlanResponse = v.InferOutput<typeof ComputePlanResponseSchema>;
export type ItemCandidate = v.InferOutput<typeof ItemCandidateSchema>;
export type ShoppingPlanLine = v.InferOutput<typeof ShoppingPlanLineSchema>;
export type CheapestPerItemPlan = v.InferOutput<typeof CheapestPerItemPlanSchema>;
export type SingleStorePlan = v.InferOutput<typeof SingleStorePlanSchema>;
```

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/shopping-list.ts packages/contracts/src/plans.ts
git commit -m "refactor(contracts): replace shopping-list with persisted plan schemas"
```

---

## Task 6: `@market/contracts` — users.ts, routes.ts, index.ts

**Files:**
- Create: `packages/contracts/src/users.ts`
- Modify: `packages/contracts/src/routes.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create `packages/contracts/src/users.ts`**

```ts
import * as v from 'valibot';

export const UserSchema = v.object({
  id:        v.string(),
  name:      v.optional(v.string()),
  createdAt: v.string(),
});

export const CreateUserBodySchema = v.object({
  name: v.optional(v.string()),
});

export type User = v.InferOutput<typeof UserSchema>;
export type CreateUserBody = v.InferOutput<typeof CreateUserBodySchema>;
```

- [ ] **Step 2: Replace `packages/contracts/src/routes.ts`** with spec §5.6 verbatim.

- [ ] **Step 3: Replace `packages/contracts/src/index.ts`** with spec §5.7 verbatim.

- [ ] **Step 4: Typecheck contracts**

Run: `pnpm --filter @market/contracts typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/users.ts packages/contracts/src/routes.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add users schemas and update route index"
```

---

## Task 7: Full workspace typecheck gate

`@market/contracts` is now consistent. Everything downstream (`apps/api`, `apps/mcp`, `apps/web`) will fail typecheck because it still imports removed types. That's expected — we'll fix them in order.

- [ ] **Step 1: Confirm contracts builds cleanly**

Run: `pnpm --filter @market/contracts build`
Expected: no errors. `packages/contracts/dist/` is regenerated.

- [ ] **Step 2: Do not run `pnpm -r typecheck` yet.** It will fail loudly and that's OK. We'll re-check after Task 20.

---

## Task 8: `apps/api` — DB schema update

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/types.ts`

- [ ] **Step 1: Replace `apps/api/src/db/schema.ts`**

Open `apps/api/src/db/schema.ts`. Keep the top-level imports, the `vector1024` customType, the `vendorId` enum, and the `productLine` enum. Replace `venues`, `categories`, `items`, `item_embeddings`, `embedding_jobs`, `price_observations` and the type exports with spec §4.1 + §4.2 verbatim. Preserve the existing `item_embeddings`, `embedding_jobs`, and `price_observations` definitions but update any references from `venues` to `stores` where they appear (there aren't any — only `items.id` is referenced there, and `items` keeps its `id` column).

Add the new enums before the tables:
```ts
export const planType     = pgEnum('plan_type',      ['mixed', 'item-based', 'query-based']);
export const planStrategy = pgEnum('plan_strategy',  ['cheapest-per-item', 'single-store', 'both']);
export const planLineKind = pgEnum('plan_line_kind', ['query', 'item']);
```

Final file structure:
```
imports
vector1024
vendorId enum
productLine enum
planType enum
planStrategy enum
planLineKind enum
users table
stores table                 (renamed from venues, + slug column)
categories table             (+ slug column, storeId FK)
items table                  (+ slug column, storeId FK)
item_embeddings table        (unchanged)
embedding_jobs table         (unchanged)
price_observations table     (unchanged)
plans table
plan_lines table
type exports
```

- [ ] **Step 2: Update `apps/api/src/db/types.ts`**

Open `apps/api/src/db/types.ts`. Rename any `VenueRow` / `VenueInsert` types to `StoreRow` / `StoreInsert`. Add `UserRow`, `UserInsert`, `PlanRow`, `PlanInsert`, `PlanLineRow`, `PlanLineInsert` following the same `InferSelectModel` / `InferInsertModel` pattern.

- [ ] **Step 3: Do not run typecheck yet** — services + routes still reference the old names and will fix in later tasks.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/db/types.ts
git commit -m "refactor(api/db): rename venues to stores, add slug columns, add users and plans tables"
```

---

## Task 9: `apps/api` — generate and apply migrations

**Files:**
- Create (via drizzle-kit): `apps/api/src/db/migrations/*`

- [ ] **Step 1: Generate migrations**

Run:
```bash
pnpm --filter @market/api exec drizzle-kit generate
```
Expected: one or more new migration files are created under `apps/api/src/db/migrations/`. Inspect them. Drizzle will emit:
- Creation of `users`, `plans`, `plan_lines` tables.
- Rename `venues` → `stores` and `venue_id` → `store_id` (or drop+recreate — if it generates drop/create, see Step 2).
- Addition of `slug` columns (nullable by default) and their unique indexes.
- New enums.

- [ ] **Step 2: Hand-edit the migration if drizzle-kit emits drop+recreate for the rename**

Drizzle-kit sometimes emits a DROP + CREATE instead of ALTER TABLE RENAME. If so, open the generated `.sql` file and replace the drop/create pair with:
```sql
ALTER TABLE "venues" RENAME TO "stores";
ALTER TABLE "categories" RENAME COLUMN "venue_id" TO "store_id";
ALTER TABLE "items" RENAME COLUMN "venue_id" TO "store_id";
ALTER INDEX "venues_vendor_slug_uq" RENAME TO "stores_vendor_slug_uq";
ALTER INDEX "venues_name_trgm" RENAME TO "stores_name_trgm";
ALTER INDEX "venues_product_line_ix" RENAME TO "stores_product_line_ix";
ALTER INDEX "categories_venue_slug_uq" RENAME TO "categories_store_slug_uq";
ALTER INDEX "items_venue_vendor_item_uq" RENAME TO "items_store_vendor_item_uq";
```

- [ ] **Step 3: Backfill slugs in the migration**

Append to the migration file a SQL block that populates slugs on existing rows. (For a fresh dev DB this is a no-op.)
```sql
UPDATE "stores"     SET "slug" = "vendor" || '-' || "vendor_slug" WHERE "slug" IS NULL;
UPDATE "categories" SET "slug" = (SELECT s."slug" FROM "stores" s WHERE s."id" = "categories"."store_id") || '-' || "vendor_slug" WHERE "slug" IS NULL;
UPDATE "items"      SET "slug" = (SELECT s."slug" FROM "stores" s WHERE s."id" = "items"."store_id") || '-' || regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g') || '-' || substr(encode(sha1("vendor_item_id"::bytea), 'hex'), 1, 6) WHERE "slug" IS NULL;
```

Then add the `SET NOT NULL` + unique index statements if drizzle-kit didn't already:
```sql
ALTER TABLE "stores"     ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "items"      ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "stores_slug_uq"     ON "stores"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_uq" ON "categories"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "items_slug_uq"      ON "items"("slug");
```

And the plan_lines CHECK constraint:
```sql
ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_kind_check" CHECK (
  (kind = 'query' AND query IS NOT NULL) OR
  (kind = 'item'  AND item_id IS NOT NULL)
);
```

Note: `sha1` is not in core Postgres — use `digest(..., 'sha1')` from pgcrypto. The `pgcrypto` extension isn't enabled by default. Add at the top of the SQL backfill block:
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```
And change `sha1("vendor_item_id"::bytea)` to `digest("vendor_item_id", 'sha1')`.

- [ ] **Step 4: Apply the migration**

Run:
```bash
pnpm --filter @market/api exec drizzle-kit migrate
```
Expected: migration applied, DB is updated. Verify with `psql` (or whatever client you use):
```sql
\d stores
\d plans
\d plan_lines
\d users
```
All four should exist; `stores`, `items`, `categories` should have `slug` columns.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/migrations/
git commit -m "feat(api/db): migration for stores rename, slugs, users and plans"
```

---

## Task 10: `apps/api` — shared helpers (id-or-slug + query-builder)

**Files:**
- Create: `apps/api/src/lib/id-or-slug.ts`
- Create: `apps/api/src/lib/query-builder.ts`

- [ ] **Step 1: Create `apps/api/src/lib/id-or-slug.ts`**

```ts
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
```

- [ ] **Step 2: Create `apps/api/src/lib/query-builder.ts`**

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/
git commit -m "feat(api/lib): add id-or-slug and query-builder helpers"
```

---

## Task 11: `apps/api` — user plugin

**Files:**
- Create: `apps/api/src/plugins/user.ts`

- [ ] **Step 1: Create `apps/api/src/plugins/user.ts`**

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const plugin: FastifyPluginAsync = async (app) => {
  const requireUser: preHandlerHookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers['x-user-id'];
    const id = Array.isArray(header) ? header[0] : header;
    if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
      reply.code(400).send({ error: 'missing or invalid X-User-Id header' });
      return reply;
    }
    req.userId = id;
  };

  app.decorate('requireUser', requireUser);
};

export const userPlugin = fp(plugin);
```

- [ ] **Step 2: Typecheck api**

Run: `pnpm --filter @market/api typecheck`
Expected: MANY errors (routes + services still import old contracts). That's fine — this file alone is correct. Just confirm there are no errors inside `apps/api/src/plugins/user.ts` itself by grepping the output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/plugins/user.ts
git commit -m "feat(api/plugins): add X-User-Id requireUser preHandler"
```

---

## Task 12: `apps/api` — new services/stores.ts

**Files:**
- Create: `apps/api/src/services/stores.ts`

- [ ] **Step 1: Create `apps/api/src/services/stores.ts`**

```ts
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

      const [{ n }] = await db.select({ n: count() }).from(stores).where(where);

      return { data: rows.map(rowToStore), total: Number(n) };
    },

    async getByIdOrSlug(idOrSlug) {
      return db.query.stores.findFirst({ where: storeWhere(idOrSlug) });
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/stores.ts
git commit -m "feat(api/services): add stores service with query + getByIdOrSlug"
```

---

## Task 13: `apps/api` — rewrite services/catalog.ts

**Files:**
- Modify: `apps/api/src/services/catalog.ts`

- [ ] **Step 1: Rewrite `services/catalog.ts`**

The new service keeps the upsert methods (used by the crawler) but removes the list/get/search-by-venue methods (moved to `stores.ts`) and renames `searchItems*` to the unified `queryItems` API.

Replace the entire file:

```ts
import { and, count, eq, ilike, isNotNull, sql } from 'drizzle-orm';
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
  type ItemRow,
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

      // Non-search listing: plain SELECT with filters + sort.
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
        relevance: items.name,   // no-op when no query
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/catalog.ts
git commit -m "refactor(api/catalog): rewrite service for unified items/query and slug-aware upserts"
```

---

## Task 14: `apps/api` — services/users.ts

**Files:**
- Create: `apps/api/src/services/users.ts`

- [ ] **Step 1: Create `apps/api/src/services/users.ts`**

```ts
import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { users, type UserRow } from '../db/schema.js';
import type { User, CreateUserBody } from '@market/contracts';

export interface UsersService {
  create(body: CreateUserBody): Promise<User>;
  getById(id: string): Promise<User | undefined>;
}

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name ?? undefined,
    createdAt: r.createdAt.toISOString(),
  };
}

export function createUsersService(db: DbClient): UsersService {
  return {
    async create(body) {
      const [row] = await db.insert(users).values({ name: body.name ?? null }).returning();
      return rowToUser(row!);
    },
    async getById(id) {
      const row = await db.query.users.findFirst({ where: eq(users.id, id) });
      return row ? rowToUser(row) : undefined;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/users.ts
git commit -m "feat(api/users): add users service (create, getById)"
```

---

## Task 15: `apps/api` — services/plans.ts (replaces shopping-list service)

**Files:**
- Delete: `apps/api/src/services/shopping-list.ts`
- Create: `apps/api/src/services/plans.ts`

- [ ] **Step 1: Extract the strategy logic from the old shopping-list service**

Open `apps/api/src/services/shopping-list.ts`. Copy these functions/blocks to a scratchpad; you'll paste them into the new `plans.ts`:
- `looksLikeBarcode`
- `hitToCandidate`
- Both optimizers' bodies (`optimizeCheapestPerItem`, `optimizeSingleStore`).

- [ ] **Step 2: Delete the old file**

```bash
git rm apps/api/src/services/shopping-list.ts
```

- [ ] **Step 3: Create `apps/api/src/services/plans.ts`**

```ts
import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import {
  items,
  plans,
  planLines,
  stores,
  type PlanLineRow,
  type PlanRow,
} from '../db/schema.js';
import type {
  AddPlanLineBody,
  CreatePlanBody,
  Plan,
  PlanDetail,
  PlanLine,
  PlanQueryBody,
  UpdatePlanBody,
  UpdatePlanLineBody,
  ComputePlanResponse,
  ItemCandidate,
  CheapestPerItemPlan,
  SingleStorePlan,
} from '@market/contracts';
import type { CatalogService, HybridItemHit } from './catalog.js';
import type { Embedder } from '../embeddings/index.js';
import { buildOrderBy } from '../lib/query-builder.js';
import { isUuid, planWhere } from '../lib/id-or-slug.js';
import { slugify } from '@market/vendor-core';
import { randomBytes } from 'node:crypto';

export class NotFoundError extends Error { constructor() { super('not found'); } }
export class ValidationError extends Error { constructor(msg: string) { super(msg); } }

export interface PlansService {
  query(userId: string, body: PlanQueryBody): Promise<{ data: Plan[]; total: number }>;
  create(userId: string, body: CreatePlanBody): Promise<Plan>;
  getDetail(userId: string, idOrSlug: string): Promise<PlanDetail>;
  update(userId: string, idOrSlug: string, body: UpdatePlanBody): Promise<Plan>;
  remove(userId: string, idOrSlug: string): Promise<void>;
  addLine(userId: string, idOrSlug: string, body: AddPlanLineBody): Promise<PlanLine>;
  updateLine(userId: string, idOrSlug: string, lineId: string, body: UpdatePlanLineBody): Promise<PlanLine>;
  removeLine(userId: string, idOrSlug: string, lineId: string): Promise<void>;
  compute(userId: string, idOrSlug: string): Promise<ComputePlanResponse>;
}

function looksLikeBarcode(s: string): boolean {
  return /^\d{8,14}$/.test(s.trim());
}

function hitToCandidate(h: HybridItemHit): ItemCandidate {
  return {
    venueSlug: h.storeSlug,
    venueName: h.storeName,
    itemId: h.id,
    itemName: h.name,
    priceMinor: h.priceMinor,
    currency: h.currency,
    deliveryPriceInt: h.deliveryPriceInt ?? undefined,
    online: h.available,
  };
}

async function rowToPlan(db: DbClient, r: PlanRow): Promise<Plan> {
  const [{ n }] = await db.select({ n: count() }).from(planLines).where(eq(planLines.planId, r.id));
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type,
    strategy: r.strategy,
    vendor: r.vendor ?? undefined,
    storeSlugs: r.storeSlugs ?? undefined,
    includeOffline: r.includeOffline,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    lineCount: Number(n),
  };
}

async function lineRowToDto(db: DbClient, r: PlanLineRow): Promise<PlanLine> {
  if (r.kind === 'query') {
    return { id: r.id, kind: 'query', position: r.position, quantity: r.quantity, query: r.query! };
  }
  // item kind — look up slug + name via items table
  const itemRow = r.itemId
    ? await db.query.items.findFirst({ where: eq(items.id, r.itemId) })
    : undefined;
  return {
    id: r.id,
    kind: 'item',
    position: r.position,
    quantity: r.quantity,
    itemId: r.itemId!,
    itemSlug: itemRow?.slug ?? '',
    itemName: itemRow?.name ?? '(deleted)',
  };
}

async function generateUniqueSlug(db: DbClient, name: string): Promise<string> {
  const base = slugify(name) || 'plan';
  const existing = await db.query.plans.findFirst({ where: eq(plans.slug, base) });
  if (!existing) return base;
  // Suffix with random 6 chars; retry up to 3 times.
  for (let i = 0; i < 3; i++) {
    const suffix = randomBytes(3).toString('hex');
    const cand = `${base}-${suffix}`;
    const hit = await db.query.plans.findFirst({ where: eq(plans.slug, cand) });
    if (!hit) return cand;
  }
  throw new Error('could not generate unique plan slug');
}

export function createPlansService(
  db: DbClient,
  catalog: CatalogService,
  embedder: Embedder,
): PlansService {
  return {
    async query(userId, body) {
      const conds = [eq(plans.userId, userId)];
      if (body.q) conds.push(ilike(plans.name, `%${body.q}%`));
      if (body.type) conds.push(eq(plans.type, body.type));
      const where = and(...conds);

      const order = buildOrderBy(body.sort, {
        name: plans.name,
        createdAt: plans.createdAt,
        updatedAt: plans.updatedAt,
      }, desc(plans.createdAt));

      const rows = await db.select().from(plans)
        .where(where)
        .orderBy(...order)
        .limit(body.take ?? 50)
        .offset(body.skip ?? 0);

      const [{ n }] = await db.select({ n: count() }).from(plans).where(where);
      const data = await Promise.all(rows.map((r) => rowToPlan(db, r)));
      return { data, total: Number(n) };
    },

    async create(userId, body) {
      const slug = await generateUniqueSlug(db, body.name);
      const [row] = await db.insert(plans).values({
        userId,
        slug,
        name: body.name,
        type: body.type,
        strategy: body.strategy,
        vendor: body.vendor ?? null,
        storeSlugs: body.storeSlugs ?? null,
        includeOffline: body.includeOffline ?? false,
      }).returning();
      return rowToPlan(db, row!);
    },

    async getDetail(userId, idOrSlug) {
      const plan = await db.query.plans.findFirst({
        where: and(planWhere(idOrSlug), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();
      const rows = await db.query.planLines.findMany({
        where: eq(planLines.planId, plan.id),
        orderBy: (t, { asc }) => [asc(t.position)],
      });
      const lines = await Promise.all(rows.map((r) => lineRowToDto(db, r)));
      return { plan: await rowToPlan(db, plan), lines };
    },

    async update(userId, idOrSlug, body) {
      const existing = await db.query.plans.findFirst({
        where: and(planWhere(idOrSlug), eq(plans.userId, userId)),
      });
      if (!existing) throw new NotFoundError();
      const [row] = await db.update(plans)
        .set({
          ...(body.name != null && { name: body.name }),
          ...(body.strategy != null && { strategy: body.strategy }),
          ...(body.vendor !== undefined && { vendor: body.vendor ?? null }),
          ...(body.storeSlugs !== undefined && { storeSlugs: body.storeSlugs ?? null }),
          ...(body.includeOffline != null && { includeOffline: body.includeOffline }),
          updatedAt: new Date(),
        })
        .where(eq(plans.id, existing.id))
        .returning();
      return rowToPlan(db, row!);
    },

    async remove(userId, idOrSlug) {
      const existing = await db.query.plans.findFirst({
        where: and(planWhere(idOrSlug), eq(plans.userId, userId)),
      });
      if (!existing) throw new NotFoundError();
      await db.delete(plans).where(eq(plans.id, existing.id));
    },

    async addLine(userId, idOrSlug, body) {
      const plan = await db.query.plans.findFirst({
        where: and(planWhere(idOrSlug), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();

      if (plan.type === 'query-based' && body.kind !== 'query') {
        throw new ValidationError('plan only accepts query lines');
      }
      if (plan.type === 'item-based' && body.kind !== 'item') {
        throw new ValidationError('plan only accepts item lines');
      }

      const [{ maxPos }] = await db
        .select({ maxPos: sql<number>`coalesce(max(${planLines.position}), -1)` })
        .from(planLines)
        .where(eq(planLines.planId, plan.id));
      const position = Number(maxPos) + 1;

      let insert: Parameters<typeof db.insert<typeof planLines>>[0] extends never ? never : Record<string, unknown>;
      if (body.kind === 'query') {
        insert = {
          planId: plan.id,
          position,
          kind: 'query',
          quantity: body.quantity ?? 1,
          query: body.query,
          itemId: null,
        };
      } else {
        const itemRow = isUuid(body.itemIdOrSlug)
          ? await db.query.items.findFirst({ where: eq(items.id, body.itemIdOrSlug) })
          : await db.query.items.findFirst({ where: eq(items.slug, body.itemIdOrSlug) });
        if (!itemRow) throw new ValidationError('item not found');
        insert = {
          planId: plan.id,
          position,
          kind: 'item',
          quantity: body.quantity ?? 1,
          query: null,
          itemId: itemRow.id,
        };
      }

      const [row] = await db.insert(planLines).values(insert as never).returning();
      await db.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, plan.id));
      return lineRowToDto(db, row!);
    },

    async updateLine(userId, idOrSlug, lineId, body) {
      const plan = await db.query.plans.findFirst({
        where: and(planWhere(idOrSlug), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();
      const line = await db.query.planLines.findFirst({
        where: and(eq(planLines.id, lineId), eq(planLines.planId, plan.id)),
      });
      if (!line) throw new NotFoundError();

      if (body.query != null && line.kind !== 'query') {
        throw new ValidationError('cannot set query on an item line');
      }

      const [row] = await db.update(planLines)
        .set({
          ...(body.quantity != null && { quantity: body.quantity }),
          ...(body.query != null && { query: body.query }),
        })
        .where(eq(planLines.id, lineId))
        .returning();
      await db.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, plan.id));
      return lineRowToDto(db, row!);
    },

    async removeLine(userId, idOrSlug, lineId) {
      const plan = await db.query.plans.findFirst({
        where: and(planWhere(idOrSlug), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();
      await db.delete(planLines).where(
        and(eq(planLines.id, lineId), eq(planLines.planId, plan.id)),
      );
      await db.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, plan.id));
    },

    async compute(userId, idOrSlug) {
      const plan = await db.query.plans.findFirst({
        where: and(planWhere(idOrSlug), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();
      const lineRows = await db.query.planLines.findMany({
        where: eq(planLines.planId, plan.id),
        orderBy: (t, { asc }) => [asc(t.position)],
      });

      const storeFilter = plan.storeSlugs ? new Set(plan.storeSlugs) : null;
      const includeOffline = plan.includeOffline;

      // Resolve each line to { query, quantity, candidates[] }
      const resolved = await Promise.all(lineRows.map(async (line) => {
        const quantity = Math.max(1, Math.floor(line.quantity));

        if (line.kind === 'item') {
          const row = await db
            .select({
              id: items.id,
              slug: items.slug,
              vendor: items.vendor,
              name: items.name,
              priceMinor: items.priceMinor,
              currency: items.currency,
              available: items.available,
              storeSlug: stores.slug,
              storeName: stores.name,
            })
            .from(items)
            .innerJoin(stores, eq(stores.id, items.storeId))
            .where(eq(items.id, line.itemId!))
            .limit(1);
          const r = row[0];
          const label = `item:${line.itemId}`;
          if (!r) return { query: label, quantity, candidates: [] as ItemCandidate[] };
          if (storeFilter && !storeFilter.has(r.storeSlug)) return { query: label, quantity, candidates: [] };
          if (!includeOffline && !r.available) return { query: label, quantity, candidates: [] };
          const candidate: ItemCandidate = {
            venueSlug: r.storeSlug,
            venueName: r.storeName,
            itemId: r.id,
            itemName: r.name,
            priceMinor: r.priceMinor,
            currency: r.currency,
            online: r.available,
          };
          return { query: label, quantity, candidates: [candidate] };
        }

        // query kind
        const q = (line.query ?? '').trim();
        let hits: HybridItemHit[] = [];
        if (looksLikeBarcode(q)) {
          hits = await catalog.searchItemsByBarcodeForPlan(q);
        } else {
          hits = await catalog.searchItemsForPlan(q, embedder, 200);
        }
        const byStore = new Map<string, HybridItemHit>();
        for (const h of hits) {
          if (storeFilter && !storeFilter.has(h.storeSlug)) continue;
          if (!includeOffline && !h.available) continue;
          const existing = byStore.get(h.storeSlug);
          if (!existing || h.priceMinor < existing.priceMinor) byStore.set(h.storeSlug, h);
        }
        return {
          query: q,
          quantity,
          candidates: [...byStore.values()]
            .map(hitToCandidate)
            .sort((a, b) => a.priceMinor - b.priceMinor),
        };
      }));

      const response: ComputePlanResponse = {};
      if (plan.strategy === 'cheapest-per-item' || plan.strategy === 'both') {
        response.cheapestPerItem = optimizeCheapest(resolved);
      }
      if (plan.strategy === 'single-store' || plan.strategy === 'both') {
        response.singleStore = optimizeSingleStore(resolved);
      }
      return response;
    },
  };
}

// ---------- strategy logic (ported verbatim from services/shopping-list.ts) ----------

interface ResolvedLine {
  query: string;
  quantity: number;
  candidates: ItemCandidate[];
}

function optimizeCheapest(resolved: ResolvedLine[]): CheapestPerItemPlan {
  const lines = resolved.map((line) => {
    const chosen = line.candidates[0];
    if (!chosen) {
      return {
        query: line.query,
        quantity: line.quantity,
        unmet: true as const,
        alternatives: [] as ItemCandidate[],
      };
    }
    return {
      query: line.query,
      quantity: line.quantity,
      chosen,
      lineTotalMinor: chosen.priceMinor * line.quantity,
      alternatives: line.candidates.slice(1, 4),
    };
  });

  const currency = lines.find((l) => l.chosen)?.chosen?.currency ?? 'GEL';
  const itemsSubtotalMinor = lines.reduce((s, l) => s + (l.lineTotalMinor ?? 0), 0);

  const venueFees = new Map<string, number>();
  for (const l of lines) {
    if (!l.chosen) continue;
    if (!venueFees.has(l.chosen.venueSlug)) {
      venueFees.set(l.chosen.venueSlug, l.chosen.deliveryPriceInt ?? 0);
    }
  }
  const deliverySubtotalMinor = [...venueFees.values()].reduce((s, f) => s + f, 0);

  return {
    strategy: 'cheapest-per-item',
    lines,
    uniqueVenues: [...venueFees.keys()],
    itemsSubtotalMinor,
    deliverySubtotalMinor,
    grandTotalMinor: itemsSubtotalMinor + deliverySubtotalMinor,
    currency,
    unmet: lines.filter((l) => l.unmet).map((l) => l.query),
  };
}

function optimizeSingleStore(resolved: ResolvedLine[]): SingleStorePlan {
  type Bucket = {
    venueName: string;
    currency: string;
    deliveryFee: number;
    lineCandidates: Map<number, ItemCandidate>;
  };
  const perVenue = new Map<string, Bucket>();

  resolved.forEach((line, idx) => {
    for (const c of line.candidates) {
      let bucket = perVenue.get(c.venueSlug);
      if (!bucket) {
        bucket = {
          venueName: c.venueName,
          currency: c.currency,
          deliveryFee: c.deliveryPriceInt ?? 0,
          lineCandidates: new Map(),
        };
        perVenue.set(c.venueSlug, bucket);
      }
      const existing = bucket.lineCandidates.get(idx);
      if (!existing || c.priceMinor < existing.priceMinor) {
        bucket.lineCandidates.set(idx, c);
      }
    }
  });

  let best: { slug: string; plan: SingleStorePlan; coverage: number } | null = null;

  for (const [slug, v] of perVenue.entries()) {
    const lines = resolved.map((line, idx) => {
      const c = v.lineCandidates.get(idx);
      if (!c) {
        return { query: line.query, quantity: line.quantity, unmet: true as const };
      }
      return {
        query: line.query,
        quantity: line.quantity,
        chosen: c,
        lineTotalMinor: c.priceMinor * line.quantity,
      };
    });
    const coverage = lines.filter((l) => l.chosen).length;
    const itemsSubtotalMinor = lines.reduce((s, l) => s + (l.lineTotalMinor ?? 0), 0);
    const plan: SingleStorePlan = {
      strategy: 'single-store',
      venueSlug: slug,
      venueName: v.venueName,
      itemsSubtotalMinor,
      deliveryFeeMinor: v.deliveryFee,
      grandTotalMinor: itemsSubtotalMinor + v.deliveryFee,
      currency: v.currency,
      lines,
      unmet: lines.filter((l) => l.unmet).map((l) => l.query),
    };
    if (
      !best ||
      coverage > best.coverage ||
      (coverage === best.coverage && plan.grandTotalMinor < best.plan.grandTotalMinor)
    ) {
      best = { slug, plan, coverage };
    }
  }

  if (!best) {
    return {
      strategy: 'single-store',
      venueSlug: '',
      venueName: '(no venue can fulfil any item)',
      itemsSubtotalMinor: 0,
      deliveryFeeMinor: 0,
      grandTotalMinor: 0,
      currency: 'GEL',
      lines: resolved.map((l) => ({ query: l.query, quantity: l.quantity, unmet: true as const })),
      unmet: resolved.map((l) => l.query),
    };
  }
  return best.plan;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/shopping-list.ts apps/api/src/services/plans.ts
git commit -m "feat(api/plans): add persisted plans service with item+query line compute"
```

---

## Task 16: `apps/api` — routes/stores.ts (replaces venues.ts)

**Files:**
- Delete: `apps/api/src/routes/venues.ts`
- Create: `apps/api/src/routes/stores.ts`

- [ ] **Step 1: Delete the old file**

```bash
git rm apps/api/src/routes/venues.ts
```

- [ ] **Step 2: Create `apps/api/src/routes/stores.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  IdOrSlugParamsSchema,
  ROUTES,
  StoreQueryBodySchema,
  type GetStoreResponse,
  type RefreshAssortmentResponse,
  type StoreQueryResponse,
} from '@market/contracts';
import type { CatalogService } from '../services/catalog.js';
import type { StoresService } from '../services/stores.js';
import type { VendorRegistry } from '@market/vendor-core';

export function storesRoutes(
  storesSvc: StoresService,
  catalog: CatalogService,
  registry: VendorRegistry,
): FastifyPluginAsync {
  return async (app) => {
    app.post(ROUTES.stores.query, async (request, reply) => {
      const parsed = v.safeParse(StoreQueryBodySchema, request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
        return;
      }
      const { data, total } = await storesSvc.query(parsed.output);
      const response: StoreQueryResponse = {
        data,
        meta: {
          total,
          skip: parsed.output.skip ?? 0,
          take: parsed.output.take ?? 50,
          sort: parsed.output.sort,
        },
      };
      return response;
    });

    app.get('/v1/stores/:idOrSlug', async (request, reply) => {
      const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const row = await storesSvc.getByIdOrSlug(parsed.output.idOrSlug);
      if (!row) { reply.code(404).send({ error: 'not found' }); return; }
      const response: GetStoreResponse = {
        store: {
          id: row.id,
          slug: row.slug,
          vendor: row.vendor,
          vendorSlug: row.vendorSlug,
          name: row.name,
          address: row.address ?? undefined,
          currency: row.currency,
          productLine: row.productLine ?? undefined,
          online: row.online,
          location: row.lat && row.lon ? { lat: Number(row.lat), lon: Number(row.lon) } : undefined,
        },
        content: row.rawContent ?? undefined,
      };
      return response;
    });

    app.post(
      '/v1/stores/:idOrSlug/refresh-assortment',
      { preHandler: app.requireApiToken },
      async (request, reply) => {
        const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
        if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
        const storeRow = await storesSvc.getByIdOrSlug(parsed.output.idOrSlug);
        if (!storeRow) { reply.code(404).send({ error: 'not found' }); return; }

        const vendor = registry.get(storeRow.vendor);
        const index = await vendor.getAssortmentIndex(storeRow.vendorSlug);
        await catalog.upsertCategories(storeRow.vendor, storeRow.vendorSlug, index.categories);

        const flat: typeof index.categories = [];
        const walk = (list: typeof index.categories) => {
          for (const c of list) { flat.push(c); if (c.subcategories?.length) walk(c.subcategories); }
        };
        walk(index.categories);

        let itemsCount = 0;
        let errors = 0;
        for (const cat of flat) {
          try {
            const page = await vendor.getCategoryItems(storeRow.vendorSlug, cat.slug);
            itemsCount += await catalog.upsertItems(storeRow.vendor, storeRow.vendorSlug, page.items);
          } catch (err) {
            errors++;
            app.log.warn({ err, slug: storeRow.vendorSlug, category: cat.slug }, 'refresh cat failed');
          }
        }
        await catalog.touchStoreAssortmentRefresh(storeRow.vendor, storeRow.vendorSlug);
        const response: RefreshAssortmentResponse = {
          slug: storeRow.slug,
          categories: flat.length,
          items: itemsCount,
          errors,
        };
        return response;
      },
    );
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/venues.ts apps/api/src/routes/stores.ts
git commit -m "refactor(api/routes): replace venues routes with stores"
```

---

## Task 17: `apps/api` — routes/catalog.ts rewrite

**Files:**
- Modify: `apps/api/src/routes/catalog.ts`

- [ ] **Step 1: Replace the entire file**

```ts
import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  CatalogStatsResponseSchema,
  IdOrSlugParamsSchema,
  ItemQueryBodySchema,
  ROUTES,
  type CatalogStatsResponse,
  type GetItemResponse,
  type ItemQueryResponse,
} from '@market/contracts';
import type { CatalogService } from '../services/catalog.js';
import type { Embedder } from '../embeddings/index.js';

export function catalogRoutes(catalog: CatalogService, embedder: Embedder): FastifyPluginAsync {
  return async (app) => {
    app.post(ROUTES.catalog.itemQuery, async (request, reply) => {
      const parsed = v.safeParse(ItemQueryBodySchema, request.body);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid body', issues: parsed.issues }); return; }
      const { data, total } = await catalog.queryItems(parsed.output, embedder);
      const response: ItemQueryResponse = {
        data,
        meta: {
          total,
          skip: parsed.output.skip ?? 0,
          take: parsed.output.take ?? 50,
          sort: parsed.output.sort,
        },
      };
      return response;
    });

    app.get('/v1/catalog/items/:idOrSlug', async (request, reply) => {
      const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const item = await catalog.getItemByIdOrSlug(parsed.output.idOrSlug);
      if (!item) { reply.code(404).send({ error: 'not found' }); return; }
      const response: GetItemResponse = { item };
      return response;
    });

    app.get(ROUTES.catalog.stats, async () => {
      const s = await catalog.stats();
      const response: CatalogStatsResponse = s;
      v.parse(CatalogStatsResponseSchema, response);
      return response;
    });
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/catalog.ts
git commit -m "refactor(api/routes): rewrite catalog routes for POST items/query"
```

---

## Task 18: `apps/api` — routes/plans.ts + routes/users.ts

**Files:**
- Delete: `apps/api/src/routes/shopping-list.ts`
- Create: `apps/api/src/routes/plans.ts`
- Create: `apps/api/src/routes/users.ts`

- [ ] **Step 1: Delete the old shopping-list route**

```bash
git rm apps/api/src/routes/shopping-list.ts
```

- [ ] **Step 2: Create `apps/api/src/routes/plans.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  AddPlanLineBodySchema,
  CreatePlanBodySchema,
  IdOrSlugParamsSchema,
  PlanQueryBodySchema,
  ROUTES,
  UpdatePlanBodySchema,
  UpdatePlanLineBodySchema,
  type ComputePlanResponse,
  type PlanDetail,
  type PlanQueryResponse,
} from '@market/contracts';
import type { PlansService } from '../services/plans.js';
import { NotFoundError, ValidationError } from '../services/plans.js';

const LineIdParams = v.object({
  idOrSlug: v.pipe(v.string(), v.minLength(1)),
  lineId: v.pipe(v.string(), v.minLength(1)),
});

export function plansRoutes(plansSvc: PlansService): FastifyPluginAsync {
  return async (app) => {
    const preHandler = app.requireUser;

    app.post(ROUTES.plans.query, { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(PlanQueryBodySchema, request.body ?? {});
      if (!parsed.success) { reply.code(400).send({ error: 'invalid body', issues: parsed.issues }); return; }
      const { data, total } = await plansSvc.query(request.userId!, parsed.output);
      const response: PlanQueryResponse = {
        data,
        meta: {
          total,
          skip: parsed.output.skip ?? 0,
          take: parsed.output.take ?? 50,
          sort: parsed.output.sort,
        },
      };
      return response;
    });

    app.post(ROUTES.plans.create, { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(CreatePlanBodySchema, request.body);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid body', issues: parsed.issues }); return; }
      const plan = await plansSvc.create(request.userId!, parsed.output);
      return plan;
    });

    app.get('/v1/plans/:idOrSlug', { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const detail: PlanDetail = await plansSvc.getDetail(request.userId!, parsed.output.idOrSlug);
        return detail;
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.patch('/v1/plans/:idOrSlug', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.update(request.userId!, p.output.idOrSlug, b.output);
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.delete('/v1/plans/:idOrSlug', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.remove(request.userId!, p.output.idOrSlug);
        reply.code(204).send();
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.post('/v1/plans/:idOrSlug/lines', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(AddPlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.addLine(request.userId!, p.output.idOrSlug, b.output);
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        if (e instanceof ValidationError) { reply.code(400).send({ error: e.message }); return; }
        throw e;
      }
    });

    app.patch('/v1/plans/:idOrSlug/lines/:lineId', { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParams, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.updateLine(request.userId!, p.output.idOrSlug, p.output.lineId, b.output);
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        if (e instanceof ValidationError) { reply.code(400).send({ error: e.message }); return; }
        throw e;
      }
    });

    app.delete('/v1/plans/:idOrSlug/lines/:lineId', { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParams, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.removeLine(request.userId!, p.output.idOrSlug, p.output.lineId);
        reply.code(204).send();
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.post('/v1/plans/:idOrSlug/compute', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const resp: ComputePlanResponse = await plansSvc.compute(request.userId!, p.output.idOrSlug);
        return resp;
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });
  };
}
```

- [ ] **Step 3: Create `apps/api/src/routes/users.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import { CreateUserBodySchema, ROUTES, type User } from '@market/contracts';
import type { UsersService } from '../services/users.js';

export function usersRoutes(users: UsersService): FastifyPluginAsync {
  return async (app) => {
    app.post(ROUTES.users.create, async (request, reply) => {
      const parsed = v.safeParse(CreateUserBodySchema, request.body ?? {});
      if (!parsed.success) { reply.code(400).send({ error: 'invalid body', issues: parsed.issues }); return; }
      const user = await users.create(parsed.output);
      return user;
    });

    app.get(ROUTES.users.me, async (request, reply) => {
      const header = request.headers['x-user-id'];
      const id = Array.isArray(header) ? header[0] : header;
      if (!id || typeof id !== 'string') { reply.code(400).send({ error: 'missing X-User-Id' }); return; }
      const user = await users.getById(id);
      if (!user) { reply.code(404).send({ error: 'not found' }); return; }
      const response: User = user;
      return response;
    });
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/shopping-list.ts apps/api/src/routes/plans.ts apps/api/src/routes/users.ts
git commit -m "feat(api/routes): add plans and users routes, remove shopping-list"
```

---

## Task 19: `apps/api` — routes/index.ts and server.ts wiring

**Files:**
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Replace `apps/api/src/routes/index.ts`**

```ts
export { storesRoutes } from './stores.js';
export { catalogRoutes } from './catalog.js';
export { plansRoutes } from './plans.js';
export { usersRoutes } from './users.js';
export { adminRoutes } from './admin.js';
```

- [ ] **Step 2: Update `apps/api/src/server.ts`**

Replace the file with:

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { environment } from './environment.js';
import { getDb, closeDb } from './db/client.js';
import { createCatalogService } from './services/catalog.js';
import { createStoresService } from './services/stores.js';
import { createPlansService } from './services/plans.js';
import { createUsersService } from './services/users.js';
import { getEmbedder } from './embeddings/index.js';
import { getVendorRegistry } from './vendor-registry.js';
import { authPlugin } from './plugins/auth.js';
import { userPlugin } from './plugins/user.js';
import {
  adminRoutes,
  catalogRoutes,
  plansRoutes,
  storesRoutes,
  usersRoutes,
} from './routes/index.js';
import { startEmbeddingWorker, type EmbeddingWorkerHandle } from './workers/embedding-worker.js';

async function main(): Promise<void> {
  const app = Fastify({ logger: { level: environment.NODE_ENV === 'production' ? 'info' : 'debug' } });

  await app.register(cors, {
    origin: true,
    allowedHeaders: ['content-type', 'authorization', 'x-user-id'],
  });
  await app.register(authPlugin);
  await app.register(userPlugin);

  const db = getDb();
  const embedder = getEmbedder();
  const registry = getVendorRegistry();
  const catalog = createCatalogService(db);
  const storesSvc = createStoresService(db);
  const usersSvc = createUsersService(db);
  const plansSvc = createPlansService(db, catalog, embedder);

  await app.register(storesRoutes(storesSvc, catalog, registry));
  await app.register(catalogRoutes(catalog, embedder));
  await app.register(plansRoutes(plansSvc));
  await app.register(usersRoutes(usersSvc));
  await app.register(adminRoutes(catalog, registry));

  app.get('/health', async () => ({ ok: true }));

  let worker: EmbeddingWorkerHandle | null = null;
  if (environment.EMBEDDING_WORKER === 'on') {
    worker = startEmbeddingWorker(db, embedder);
    app.log.info('embedding worker started');
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      if (worker) await worker.stop();
      await app.close();
      await closeDb();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: environment.API_PORT, host: '0.0.0.0' });
  app.log.info(`listening on :${environment.API_PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Check `apps/api/src/routes/admin.ts`** — if it calls `catalog.upsertVenues`, `listVenues`, or `touchVenueAssortmentRefresh`, update to `upsertStores` / `touchStoreAssortmentRefresh`. Same for any call that passed vendor+slug to refresh — it now takes a store lookup. Adjust the admin `crawl` route if needed.

- [ ] **Step 4: Check `apps/api/src/crawler/*.ts`** — grep for `upsertVenues` or `listVenues` and rename to `upsertStores`. Update any references to `venue.vendorSlug` that need no change (the method name is what matters).

- [ ] **Step 5: Typecheck api**

Run: `pnpm --filter @market/api typecheck`
Expected: 0 errors. If there are errors, they're in admin.ts, crawler, or workers — fix them by renaming the old method calls.

- [ ] **Step 6: Build api**

Run: `pnpm --filter @market/api build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/index.ts apps/api/src/server.ts apps/api/src/routes/admin.ts apps/api/src/crawler/ apps/api/src/workers/
git commit -m "refactor(api): wire stores/plans/users routes and update call sites"
```

---

## Task 20: API smoke test (manual)

- [ ] **Step 1: Start the API**

```bash
pnpm --filter @market/api dev
```

- [ ] **Step 2: Create a user**

```bash
curl -sX POST http://localhost:3000/v1/users -H 'content-type: application/json' -d '{}' | tee /tmp/user.json
```
Expected: a JSON response with `{ id, createdAt }`. Capture the `id`.

- [ ] **Step 3: List stores (empty DB case)**

```bash
curl -sX POST http://localhost:3000/v1/stores/query -H 'content-type: application/json' -d '{"take":10}'
```
Expected: `{ "data": [], "meta": { "total": 0, "skip": 0, "take": 10 } }`

- [ ] **Step 4: Create a plan**

```bash
USER=$(cat /tmp/user.json | python -c "import sys, json; print(json.load(sys.stdin)['id'])")
curl -sX POST http://localhost:3000/v1/plans \
  -H 'content-type: application/json' \
  -H "x-user-id: $USER" \
  -d '{"name":"Weekly shop","type":"mixed","strategy":"both"}'
```
Expected: a plan object with a slug. Capture the slug.

- [ ] **Step 5: List plans**

```bash
curl -sX POST http://localhost:3000/v1/plans/query \
  -H 'content-type: application/json' \
  -H "x-user-id: $USER" \
  -d '{}'
```
Expected: `{ "data": [{ ... }], "meta": { "total": 1, ... } }`

- [ ] **Step 6: Stop the API** (Ctrl+C). No commit needed.

---

## Task 21: `apps/mcp` — rewrite api-client + tools

**Files:**
- Modify: `apps/mcp/src/api-client.ts`
- Modify: `apps/mcp/src/tools.ts`
- Modify: `apps/mcp/src/environment.ts`

- [ ] **Step 1: Add `MARKET_USER_ID` to `apps/mcp/src/environment.ts`**

Find the valibot schema in `environment.ts` and add:
```ts
MARKET_USER_ID: v.optional(v.pipe(v.string(), v.uuid())),
```

- [ ] **Step 2: Update `apps/mcp/src/api-client.ts`**

Ensure the client has a generic `post(path, body, extraHeaders?)` and `get(path, extraHeaders?)`. If it already does, the only change is passing `x-user-id` on plan calls. If not, update it:

```ts
import { environment } from './environment.js';

export class ApiClient {
  private baseUrl: string;
  private token: string;
  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }
  private headers(extra?: Record<string, string>): HeadersInit {
    return {
      'content-type': 'application/json',
      'accept': 'application/json',
      'authorization': `Bearer ${this.token}`,
      ...(extra ?? {}),
    };
  }
  async get<T>(path: string, extra?: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers(extra) });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }
  async post<T>(path: string, body: unknown, extra?: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(extra),
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }
  async patch<T>(path: string, body: unknown, extra?: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: this.headers(extra),
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new Error(`PATCH ${path} -> ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }
  async del(path: string, extra?: Record<string, string>): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE', headers: this.headers(extra) });
    if (!res.ok && res.status !== 204) throw new Error(`DELETE ${path} -> ${res.status}: ${await res.text()}`);
  }
}

export function userHeaders(userId?: string): Record<string, string> | undefined {
  return userId ? { 'x-user-id': userId } : undefined;
}
```

- [ ] **Step 3: Rewrite `apps/mcp/src/tools.ts`**

Replace the entire file. The new file registers the 16 tools listed in spec §7. Each tool is short; use this skeleton for every tool and fill in the body from the route it calls:

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ROUTES } from '@market/contracts';
import type {
  AddPlanLineBody, CatalogStatsResponse, ComputePlanResponse, CreatePlanBody,
  GetItemResponse, GetStoreResponse, ItemQueryBody, ItemQueryResponse, Plan,
  PlanDetail, PlanQueryBody, PlanQueryResponse, RefreshAssortmentResponse,
  StoreQueryBody, StoreQueryResponse, UpdatePlanBody, UpdatePlanLineBody,
} from '@market/contracts';
import type { ApiClient } from './api-client.js';
import { userHeaders } from './api-client.js';
import { environment } from './environment.js';

const VendorEnum = z.enum(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill']);
const ProductLineEnum = z.enum(['restaurant', 'store', 'grocery', 'pharmacy', 'other']);

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function mkUser() { return userHeaders(environment.MARKET_USER_ID); }

const SortItem = z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) });

export function registerMarketTools(server: McpServer, api: ApiClient): void {
  // --- stores ---
  server.registerTool(
    'market_query_stores',
    {
      title: 'Query stores',
      description: 'List/search stores with pagination, filters, sort.',
      inputSchema: {
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(500).optional(),
        q: z.string().optional(),
        sort: z.array(SortItem).optional(),
        vendor: VendorEnum.optional(),
        productLine: ProductLineEnum.optional(),
        online: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const body: StoreQueryBody = input as StoreQueryBody;
      return ok(await api.post<StoreQueryResponse>(ROUTES.stores.query, body));
    },
  );

  server.registerTool(
    'market_get_store',
    {
      title: 'Get a store by id or slug',
      description: 'Fetch a single store (and its assortment content).',
      inputSchema: { idOrSlug: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ idOrSlug }) => ok(await api.get<GetStoreResponse>(ROUTES.stores.get(idOrSlug))),
  );

  server.registerTool(
    'market_refresh_assortment',
    {
      title: 'Refresh store assortment',
      description: 'Trigger a live crawl of a store and persist results.',
      inputSchema: { idOrSlug: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ idOrSlug }) =>
      ok(await api.post<RefreshAssortmentResponse>(ROUTES.stores.refreshAssortment(idOrSlug), {})),
  );

  server.registerTool(
    'market_discover_stores',
    {
      title: 'Discover stores via vendor SDK',
      description: 'Query vendor SDK directly (ephemeral, bypasses DB).',
      inputSchema: {
        vendor: VendorEnum.optional(),
        productLine: ProductLineEnum.optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      // Same backend route as query with no filters — kept as a semantic alias.
      const body: StoreQueryBody = { ...input, take: input.limit ?? 200 };
      return ok(await api.post<StoreQueryResponse>(ROUTES.stores.query, body));
    },
  );

  // --- catalog ---
  server.registerTool(
    'market_query_items',
    {
      title: 'Query catalog items',
      description: 'List/search items with pagination, filters, sort.',
      inputSchema: {
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(500).optional(),
        q: z.string().optional(),
        sort: z.array(SortItem).optional(),
        mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
        vendor: VendorEnum.optional(),
        storeIdOrSlug: z.string().optional(),
        categoryIdOrSlug: z.string().optional(),
        minPriceMinor: z.number().int().min(0).optional(),
        maxPriceMinor: z.number().int().min(0).optional(),
        available: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const body: ItemQueryBody = input as ItemQueryBody;
      return ok(await api.post<ItemQueryResponse>(ROUTES.catalog.itemQuery, body));
    },
  );

  server.registerTool(
    'market_get_item',
    {
      title: 'Get a catalog item by id or slug',
      description: 'Fetch a single item.',
      inputSchema: { idOrSlug: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ idOrSlug }) => ok(await api.get<GetItemResponse>(ROUTES.catalog.itemGet(idOrSlug))),
  );

  server.registerTool(
    'market_catalog_stats',
    {
      title: 'Catalog statistics',
      description: 'Indexed stores, categories, items, embeddings.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => ok(await api.get<CatalogStatsResponse>(ROUTES.catalog.stats)),
  );

  // --- plans ---
  server.registerTool(
    'market_query_plans',
    {
      title: 'Query plans',
      description: 'List plans for the configured user.',
      inputSchema: {
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(500).optional(),
        q: z.string().optional(),
        sort: z.array(SortItem).optional(),
        type: z.enum(['mixed', 'item-based', 'query-based']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const body: PlanQueryBody = input as PlanQueryBody;
      return ok(await api.post<PlanQueryResponse>(ROUTES.plans.query, body, mkUser()));
    },
  );

  server.registerTool(
    'market_create_plan',
    {
      title: 'Create a plan',
      description: 'Create a new persisted plan for the configured user.',
      inputSchema: {
        name: z.string().min(1),
        type: z.enum(['mixed', 'item-based', 'query-based']),
        strategy: z.enum(['cheapest-per-item', 'single-store', 'both']),
        vendor: VendorEnum.optional(),
        storeSlugs: z.array(z.string()).optional(),
        includeOffline: z.boolean().optional(),
      },
    },
    async (input) => {
      const body: CreatePlanBody = input;
      return ok(await api.post<Plan>(ROUTES.plans.create, body, mkUser()));
    },
  );

  server.registerTool(
    'market_get_plan',
    {
      title: 'Get a plan',
      description: 'Fetch a plan and its lines.',
      inputSchema: { idOrSlug: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ idOrSlug }) => ok(await api.get<PlanDetail>(ROUTES.plans.get(idOrSlug), mkUser())),
  );

  server.registerTool(
    'market_update_plan',
    {
      title: 'Update plan metadata',
      description: 'Update name, strategy, filters; type is immutable.',
      inputSchema: {
        idOrSlug: z.string().min(1),
        name: z.string().min(1).optional(),
        strategy: z.enum(['cheapest-per-item', 'single-store', 'both']).optional(),
        vendor: VendorEnum.optional(),
        storeSlugs: z.array(z.string()).optional(),
        includeOffline: z.boolean().optional(),
      },
    },
    async ({ idOrSlug, ...rest }) => {
      const body: UpdatePlanBody = rest;
      return ok(await api.patch<Plan>(ROUTES.plans.update(idOrSlug), body, mkUser()));
    },
  );

  server.registerTool(
    'market_delete_plan',
    {
      title: 'Delete a plan',
      description: 'Delete a plan and its lines.',
      inputSchema: { idOrSlug: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ idOrSlug }) => {
      await api.del(ROUTES.plans.delete(idOrSlug), mkUser());
      return ok({ deleted: idOrSlug });
    },
  );

  server.registerTool(
    'market_add_plan_line',
    {
      title: 'Add a line to a plan',
      description: 'Add a query line or lock in a specific item.',
      inputSchema: {
        idOrSlug: z.string().min(1),
        kind: z.enum(['query', 'item']),
        query: z.string().optional(),
        itemIdOrSlug: z.string().optional(),
        quantity: z.number().int().min(1).optional(),
      },
    },
    async ({ idOrSlug, ...rest }) => {
      const body = rest as AddPlanLineBody;
      return ok(await api.post(ROUTES.plans.lines.add(idOrSlug), body, mkUser()));
    },
  );

  server.registerTool(
    'market_update_plan_line',
    {
      title: 'Update a plan line',
      description: 'Update quantity or the query text on a query line.',
      inputSchema: {
        idOrSlug: z.string().min(1),
        lineId: z.string().min(1),
        quantity: z.number().int().min(1).optional(),
        query: z.string().optional(),
      },
    },
    async ({ idOrSlug, lineId, ...rest }) => {
      const body: UpdatePlanLineBody = rest;
      return ok(await api.patch(ROUTES.plans.lines.update(idOrSlug, lineId), body, mkUser()));
    },
  );

  server.registerTool(
    'market_remove_plan_line',
    {
      title: 'Remove a plan line',
      description: 'Delete a single line from a plan.',
      inputSchema: { idOrSlug: z.string().min(1), lineId: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ idOrSlug, lineId }) => {
      await api.del(ROUTES.plans.lines.delete(idOrSlug, lineId), mkUser());
      return ok({ deleted: lineId });
    },
  );

  server.registerTool(
    'market_compute_plan',
    {
      title: 'Compute plan',
      description: 'Run the strategy against the stored lines and return the plan result.',
      inputSchema: { idOrSlug: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ idOrSlug }) =>
      ok(await api.post<ComputePlanResponse>(ROUTES.plans.compute(idOrSlug), {}, mkUser())),
  );
}
```

- [ ] **Step 4: Typecheck + build mcp**

Run: `pnpm --filter @market/mcp typecheck && pnpm --filter @market/mcp build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp/src/
git commit -m "refactor(mcp): rewrite tools for stores/catalog/plans and user header"
```

---

## Task 22: `@market/ui` — add shadcn components used by plan UX

**Files:**
- Create: `packages/ui/src/components/dialog.tsx`
- Create: `packages/ui/src/components/select.tsx`
- Create: `packages/ui/src/components/badge.tsx`
- Create: `packages/ui/src/components/checkbox.tsx`
- Create: `packages/ui/src/components/radio-group.tsx`
- Create: `packages/ui/src/components/label.tsx`
- Modify: `packages/ui/package.json` (add `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-checkbox`, `@radix-ui/react-radio-group`, `@radix-ui/react-label`)
- Modify: `packages/ui/src/index.ts` (re-export new components)

- [ ] **Step 1: Add Radix deps to `packages/ui/package.json`**

Under `dependencies` add:
```json
"@radix-ui/react-dialog": "^1.1.2",
"@radix-ui/react-select": "^2.1.2",
"@radix-ui/react-checkbox": "^1.1.2",
"@radix-ui/react-radio-group": "^1.2.1",
"@radix-ui/react-label": "^2.1.0"
```
Run: `pnpm install`.

- [ ] **Step 2: Add the component files**

Copy each file from the shadcn/ui v4 source (`https://ui.shadcn.com/docs/components/<name>` → "Manual installation" code block) into `packages/ui/src/components/`. Use the default-theme versions. Components to add: `dialog.tsx`, `select.tsx`, `badge.tsx`, `checkbox.tsx`, `radio-group.tsx`, `label.tsx`.

- [ ] **Step 3: Re-export from `packages/ui/src/index.ts`**

Add lines:
```ts
export * from './components/dialog.js';
export * from './components/select.js';
export * from './components/badge.js';
export * from './components/checkbox.js';
export * from './components/radio-group.js';
export * from './components/label.js';
```

- [ ] **Step 4: Typecheck + build ui**

Run: `pnpm --filter @market/ui typecheck && pnpm --filter @market/ui build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): add dialog, select, badge, checkbox, radio-group, label"
```

---

## Task 23: `apps/web` — remove file-based routing plumbing

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Delete: `apps/web/src/routes/__root.tsx`
- Delete: `apps/web/src/routes/index.tsx`
- Delete: `apps/web/src/routeTree.gen.ts` (if present)

- [ ] **Step 1: Remove `@tanstack/router-plugin` from `apps/web/package.json`**

Remove the line `"@tanstack/router-plugin": "^1.83.0"` from `devDependencies`.

- [ ] **Step 2: Update `apps/web/vite.config.ts`**

Replace with:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

- [ ] **Step 3: Delete the stale files**

```bash
git rm apps/web/src/routes/__root.tsx apps/web/src/routes/index.tsx
rm -f apps/web/src/routeTree.gen.ts
```

- [ ] **Step 4: `pnpm install`** to drop the plugin from `node_modules`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/src/routes/ pnpm-lock.yaml
git commit -m "chore(web): drop TanStack router-plugin and file-based routes"
```

---

## Task 24: `apps/web` — search schemas

**Files:**
- Create: `apps/web/src/search-schemas.ts`
- Modify: `apps/web/src/environment.ts` (no change needed — `VITE_API_URL` already exists)

- [ ] **Step 1: Create `apps/web/src/search-schemas.ts`**

```ts
import * as v from 'valibot';

const VendorId = v.picklist(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill'] as const);
const ProductLine = v.picklist(['restaurant', 'store', 'grocery', 'pharmacy', 'other'] as const);

const base = {
  skip: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 50),
  q: v.optional(v.string()),
  sort: v.optional(v.string()),
};

export const storeListSearchSchema = (input: unknown) => v.parse(
  v.object({ ...base, vendor: v.optional(VendorId), productLine: v.optional(ProductLine), online: v.optional(v.boolean()) }),
  input ?? {},
);

export const itemListSearchSchema = (input: unknown) => v.parse(
  v.object({
    ...base,
    mode: v.optional(v.picklist(['keyword', 'semantic', 'hybrid'] as const)),
    vendor: v.optional(VendorId),
    storeIdOrSlug: v.optional(v.string()),
    minPriceMinor: v.optional(v.number()),
    maxPriceMinor: v.optional(v.number()),
    available: v.optional(v.boolean()),
  }),
  input ?? {},
);

export const planListSearchSchema = (input: unknown) => v.parse(
  v.object({ ...base, type: v.optional(v.picklist(['mixed', 'item-based', 'query-based'] as const)) }),
  input ?? {},
);

export type StoreListSearch = ReturnType<typeof storeListSearchSchema>;
export type ItemListSearch = ReturnType<typeof itemListSearchSchema>;
export type PlanListSearch = ReturnType<typeof planListSearchSchema>;

export function parseSort(s: string | undefined): { field: string; direction: 'asc' | 'desc' }[] | undefined {
  if (!s) return undefined;
  return s.split(',').map((part) => {
    const [field, dir] = part.split(':');
    return { field: field ?? 'name', direction: (dir === 'desc' ? 'desc' : 'asc') as const };
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/search-schemas.ts
git commit -m "feat(web): add url search param schemas for list routes"
```

---

## Task 25: `apps/web` — api-client + user boot

**Files:**
- Modify: `apps/web/src/api-client.ts`

- [ ] **Step 1: Replace `apps/web/src/api-client.ts`**

```ts
import {
  AddPlanLineBody, CatalogStatsResponse, ComputePlanResponse, CreatePlanBody,
  CreateUserBody, GetItemResponse, GetStoreResponse, ItemQueryBody, ItemQueryResponse,
  Plan, PlanDetail, PlanQueryBody, PlanQueryResponse, ROUTES, StoreQueryBody,
  StoreQueryResponse, UpdatePlanBody, UpdatePlanLineBody, User,
} from '@market/contracts';
import { environment } from './environment.js';

const base = environment.VITE_API_URL.replace(/\/$/, '');
const USER_KEY = 'market.userId';

async function raw<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function userHeaders(): Record<string, string> {
  const id = localStorage.getItem(USER_KEY);
  return id ? { 'x-user-id': id } : {};
}

export async function ensureUser(): Promise<string> {
  const existing = localStorage.getItem(USER_KEY);
  if (existing) return existing;
  const body: CreateUserBody = {};
  const user = await raw<User>(ROUTES.users.create, { method: 'POST', body: JSON.stringify(body) });
  localStorage.setItem(USER_KEY, user.id);
  return user.id;
}

export const api = {
  // ---------- stores ----------
  queryStores: (body: StoreQueryBody) =>
    raw<StoreQueryResponse>(ROUTES.stores.query, { method: 'POST', body: JSON.stringify(body) }),
  getStore: (idOrSlug: string) =>
    raw<GetStoreResponse>(ROUTES.stores.get(idOrSlug), { method: 'GET' }),

  // ---------- catalog ----------
  queryItems: (body: ItemQueryBody) =>
    raw<ItemQueryResponse>(ROUTES.catalog.itemQuery, { method: 'POST', body: JSON.stringify(body) }),
  getItem: (idOrSlug: string) =>
    raw<GetItemResponse>(ROUTES.catalog.itemGet(idOrSlug), { method: 'GET' }),
  stats: () =>
    raw<CatalogStatsResponse>(ROUTES.catalog.stats, { method: 'GET' }),

  // ---------- plans ----------
  queryPlans: (body: PlanQueryBody) =>
    raw<PlanQueryResponse>(ROUTES.plans.query, { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  createPlan: (body: CreatePlanBody) =>
    raw<Plan>(ROUTES.plans.create, { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  getPlan: (idOrSlug: string) =>
    raw<PlanDetail>(ROUTES.plans.get(idOrSlug), { method: 'GET', headers: userHeaders() }),
  updatePlan: (idOrSlug: string, body: UpdatePlanBody) =>
    raw<Plan>(ROUTES.plans.update(idOrSlug), { method: 'PATCH', body: JSON.stringify(body), headers: userHeaders() }),
  deletePlan: (idOrSlug: string) =>
    raw<void>(ROUTES.plans.delete(idOrSlug), { method: 'DELETE', headers: userHeaders() }),
  addPlanLine: (idOrSlug: string, body: AddPlanLineBody) =>
    raw(ROUTES.plans.lines.add(idOrSlug), { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  updatePlanLine: (idOrSlug: string, lineId: string, body: UpdatePlanLineBody) =>
    raw(ROUTES.plans.lines.update(idOrSlug, lineId), { method: 'PATCH', body: JSON.stringify(body), headers: userHeaders() }),
  removePlanLine: (idOrSlug: string, lineId: string) =>
    raw<void>(ROUTES.plans.lines.delete(idOrSlug, lineId), { method: 'DELETE', headers: userHeaders() }),
  computePlan: (idOrSlug: string) =>
    raw<ComputePlanResponse>(ROUTES.plans.compute(idOrSlug), { method: 'POST', body: JSON.stringify({}), headers: userHeaders() }),
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/api-client.ts
git commit -m "feat(web): rewrite api client against new contracts with user boot"
```

---

## Task 26: `apps/web` — hooks

**Files:**
- Create: `apps/web/src/hooks/use-stores-query.ts`
- Create: `apps/web/src/hooks/use-store.ts`
- Create: `apps/web/src/hooks/use-items-query.ts`
- Create: `apps/web/src/hooks/use-item.ts`
- Create: `apps/web/src/hooks/use-plans-query.ts`
- Create: `apps/web/src/hooks/use-plan.ts`
- Create: `apps/web/src/hooks/use-plan-mutations.ts`

- [ ] **Step 1: Create `apps/web/src/hooks/use-stores-query.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { StoreQueryBody } from '@market/contracts';
import { api } from '../api-client.js';

export function useStoresQuery(body: StoreQueryBody) {
  return useQuery({
    queryKey: ['stores', 'query', body],
    queryFn: () => api.queryStores(body),
  });
}
```

- [ ] **Step 2: Create `apps/web/src/hooks/use-store.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useStore(idOrSlug: string) {
  return useQuery({
    queryKey: ['stores', 'get', idOrSlug],
    queryFn: () => api.getStore(idOrSlug),
    enabled: idOrSlug.length > 0,
  });
}
```

- [ ] **Step 3: Create `apps/web/src/hooks/use-items-query.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { ItemQueryBody } from '@market/contracts';
import { api } from '../api-client.js';

export function useItemsQuery(body: ItemQueryBody) {
  return useQuery({
    queryKey: ['items', 'query', body],
    queryFn: () => api.queryItems(body),
  });
}
```

- [ ] **Step 4: Create `apps/web/src/hooks/use-item.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useItem(idOrSlug: string) {
  return useQuery({
    queryKey: ['items', 'get', idOrSlug],
    queryFn: () => api.getItem(idOrSlug),
    enabled: idOrSlug.length > 0,
  });
}
```

- [ ] **Step 5: Create `apps/web/src/hooks/use-plans-query.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { PlanQueryBody } from '@market/contracts';
import { api } from '../api-client.js';

export function usePlansQuery(body: PlanQueryBody) {
  return useQuery({
    queryKey: ['plans', 'query', body],
    queryFn: () => api.queryPlans(body),
  });
}
```

- [ ] **Step 6: Create `apps/web/src/hooks/use-plan.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function usePlan(idOrSlug: string) {
  return useQuery({
    queryKey: ['plans', 'get', idOrSlug],
    queryFn: () => api.getPlan(idOrSlug),
    enabled: idOrSlug.length > 0,
  });
}
```

- [ ] **Step 7: Create `apps/web/src/hooks/use-plan-mutations.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AddPlanLineBody, ComputePlanResponse, CreatePlanBody, Plan,
  UpdatePlanBody, UpdatePlanLineBody,
} from '@market/contracts';
import { api } from '../api-client.js';

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePlanBody) => api.createPlan(body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'query'] }); },
  });
}

export function useUpdatePlan(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlanBody) => api.updatePlan(idOrSlug, body),
    onSuccess: (plan: Plan) => {
      void qc.invalidateQueries({ queryKey: ['plans', 'get', idOrSlug] });
      void qc.invalidateQueries({ queryKey: ['plans', 'get', plan.slug] });
      void qc.invalidateQueries({ queryKey: ['plans', 'query'] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idOrSlug: string) => api.deletePlan(idOrSlug),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'query'] }); },
  });
}

export function useAddPlanLine(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPlanLineBody) => api.addPlanLine(idOrSlug, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', idOrSlug] }); },
  });
}

export function useUpdatePlanLine(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: UpdatePlanLineBody }) =>
      api.updatePlanLine(idOrSlug, lineId, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', idOrSlug] }); },
  });
}

export function useRemovePlanLine(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => api.removePlanLine(idOrSlug, lineId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', idOrSlug] }); },
  });
}

export function useComputePlan(idOrSlug: string) {
  return useMutation<ComputePlanResponse>({
    mutationFn: () => api.computePlan(idOrSlug),
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/hooks/
git commit -m "feat(web): add query and mutation hooks for stores/items/plans"
```

---

## Task 27: `apps/web` — layout + root-layout component

**Files:**
- Create: `apps/web/src/layout/root-layout.tsx`

- [ ] **Step 1: Create `apps/web/src/layout/root-layout.tsx`**

```tsx
import { Link, Outlet } from '@tanstack/react-router';
import { Toaster } from '@market/ui';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/stores', label: 'Stores' },
  { to: '/products', label: 'Products' },
  { to: '/vendors', label: 'Vendors' },
  { to: '/plans', label: 'Plans' },
];

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav className="container mx-auto flex items-center gap-6 px-6 py-4">
          <span className="font-semibold">Market</span>
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="text-sm text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="container mx-auto px-6 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/layout/
git commit -m "feat(web): add root layout with top nav"
```

---

## Task 28: `apps/web` — pages/home.tsx + pages/vendors.tsx

**Files:**
- Create: `apps/web/src/pages/home.tsx`
- Create: `apps/web/src/pages/vendors.tsx`

- [ ] **Step 1: Create `apps/web/src/pages/home.tsx`**

```tsx
export function HomePage() {
  return (
    <div className="py-10 text-center text-muted-foreground">
      <h1 className="mb-2 text-3xl font-bold text-foreground">Market</h1>
      <p>Welcome. Pick a section from the nav above.</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/pages/vendors.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@market/ui';

const VENDORS = [
  { id: 'wolt',        name: 'Wolt' },
  { id: 'glovo',       name: 'Glovo' },
  { id: 'bolt-food',   name: 'Bolt Food' },
  { id: 'europroduct', name: 'Europroduct' },
  { id: 'goodwill',    name: 'Goodwill' },
];

export function VendorsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vendors</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {VENDORS.map((v) => (
          <Card key={v.id}>
            <CardHeader><CardTitle>{v.name}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">id: {v.id}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/home.tsx apps/web/src/pages/vendors.tsx
git commit -m "feat(web): add home and vendors pages"
```

---

## Task 29: `apps/web` — pages/stores list + detail

**Files:**
- Create: `apps/web/src/pages/stores/list.tsx`
- Create: `apps/web/src/pages/stores/detail.tsx`
- Create: `apps/web/src/features/listing/pagination-controls.tsx`

- [ ] **Step 1: Create `apps/web/src/features/listing/pagination-controls.tsx`**

```tsx
import { Button } from '@market/ui';

interface Props {
  skip: number;
  take: number;
  total: number;
  onChange: (next: { skip: number; take: number }) => void;
}

export function PaginationControls({ skip, take, total, onChange }: Props) {
  const page = Math.floor(skip / take) + 1;
  const pages = Math.max(1, Math.ceil(total / take));
  const prev = () => onChange({ skip: Math.max(0, skip - take), take });
  const next = () => onChange({ skip: skip + take, take });
  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Showing {total === 0 ? 0 : skip + 1}–{Math.min(skip + take, total)} of {total} · Page {page} / {pages}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={prev} disabled={skip === 0}>Previous</Button>
        <Button variant="outline" size="sm" onClick={next} disabled={skip + take >= total}>Next</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/pages/stores/list.tsx`**

```tsx
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@market/ui';
import { useStoresQuery } from '../../hooks/use-stores-query.js';
import { parseSort } from '../../search-schemas.js';
import { PaginationControls } from '../../features/listing/pagination-controls.js';

export function StoresListPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/stores' });
  const [q, setQ] = useState(search.q ?? '');

  const { data, isLoading, error } = useStoresQuery({
    skip: search.skip,
    take: search.take,
    q: search.q,
    sort: parseSort(search.sort),
    vendor: search.vendor,
    productLine: search.productLine,
    online: search.online,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Stores</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void nav({ to: '/stores', search: (s) => ({ ...s, skip: 0, q: q.trim() || undefined }) });
        }}
      >
        <Input placeholder="Search stores…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}
      {error && <p className="text-destructive">{String(error)}</p>}
      {data && (
        <>
          <div className="grid gap-3">
            {data.data.length === 0 && <p className="text-muted-foreground">No stores.</p>}
            {data.data.map((s) => (
              <Card key={s.id}>
                <CardHeader><CardTitle>
                  <a className="hover:underline" href={`/stores/${s.slug}`}>{s.name}</a>
                </CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {s.vendor} · {s.productLine ?? '—'} · {s.online ? 'online' : 'offline'}
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationControls
            skip={data.meta.skip}
            take={data.meta.take}
            total={data.meta.total}
            onChange={(n) => void nav({ to: '/stores', search: (s) => ({ ...s, ...n }) })}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/pages/stores/detail.tsx`**

```tsx
import { useParams } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@market/ui';
import { useStore } from '../../hooks/use-store.js';

export function StoreDetailPage() {
  const { idOrSlug } = useParams({ from: '/stores/$idOrSlug' });
  const { data, isLoading, error } = useStore(idOrSlug);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive">{String(error)}</p>;
  if (!data) return <p>Not found.</p>;

  const s = data.store;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{s.name}</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>Vendor: {s.vendor}</div>
          <div>Slug: {s.slug}</div>
          <div>Address: {s.address ?? '—'}</div>
          <div>Status: {s.online ? 'online' : 'offline'}</div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/stores/ apps/web/src/features/listing/
git commit -m "feat(web): add stores list and detail pages"
```

---

## Task 30: `apps/web` — pages/products list + detail

**Files:**
- Create: `apps/web/src/pages/products/list.tsx`
- Create: `apps/web/src/pages/products/detail.tsx`

- [ ] **Step 1: Create `apps/web/src/pages/products/list.tsx`**

```tsx
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@market/ui';
import { useItemsQuery } from '../../hooks/use-items-query.js';
import { parseSort } from '../../search-schemas.js';
import { PaginationControls } from '../../features/listing/pagination-controls.js';

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function ProductsListPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/products' });
  const [q, setQ] = useState(search.q ?? '');

  const { data, isLoading, error } = useItemsQuery({
    skip: search.skip,
    take: search.take,
    q: search.q,
    mode: search.mode,
    sort: parseSort(search.sort),
    vendor: search.vendor,
    storeIdOrSlug: search.storeIdOrSlug,
    minPriceMinor: search.minPriceMinor,
    maxPriceMinor: search.maxPriceMinor,
    available: search.available,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Products</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void nav({ to: '/products', search: (s) => ({ ...s, skip: 0, q: q.trim() || undefined }) });
        }}
      >
        <Input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}
      {error && <p className="text-destructive">{String(error)}</p>}
      {data && (
        <>
          <div className="grid gap-3">
            {data.data.length === 0 && <p className="text-muted-foreground">No results.</p>}
            {data.data.map((it) => (
              <Card key={it.id}>
                <CardHeader><CardTitle>
                  <a className="hover:underline" href={`/products/${it.slug}`}>{it.name}</a>
                </CardTitle></CardHeader>
                <CardContent className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{it.storeName} · {it.vendor}</span>
                  <span className="font-semibold">{formatMinor(it.priceMinor, it.currency)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationControls
            skip={data.meta.skip}
            take={data.meta.take}
            total={data.meta.total}
            onChange={(n) => void nav({ to: '/products', search: (s) => ({ ...s, ...n }) })}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/pages/products/detail.tsx`**

```tsx
import { useParams } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@market/ui';
import { useItem } from '../../hooks/use-item.js';

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function ProductDetailPage() {
  const { idOrSlug } = useParams({ from: '/products/$idOrSlug' });
  const { data, isLoading, error } = useItem(idOrSlug);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive">{String(error)}</p>;
  if (!data) return <p>Not found.</p>;

  const it = data.item;
  return (
    <Card>
      <CardHeader><CardTitle>{it.name}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{it.storeName} · {it.vendor}</span>
          <span className="font-semibold">{formatMinor(it.priceMinor, it.currency)}</span>
        </div>
        {it.description && <p className="text-muted-foreground">{it.description}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/products/
git commit -m "feat(web): add products list and detail pages"
```

---

## Task 31: `apps/web` — plan feature components

**Files:**
- Create: `apps/web/src/features/plans/plan-create-dialog.tsx`
- Create: `apps/web/src/features/plans/plan-lines.tsx`
- Create: `apps/web/src/features/plans/plan-compute-panel.tsx`
- Create: `apps/web/src/features/plans/plan-line-add-query.tsx`
- Create: `apps/web/src/features/plans/plan-line-add-item.tsx`

- [ ] **Step 1: Create `apps/web/src/features/plans/plan-create-dialog.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  Input, Label, RadioGroup, RadioGroupItem, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue,
} from '@market/ui';
import type { CreatePlanBody, PlanStrategy, PlanType } from '@market/contracts';
import { useCreatePlan } from '../../hooks/use-plan-mutations.js';

export function PlanCreateDialog() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PlanType>('mixed');
  const [strategy, setStrategy] = useState<PlanStrategy>('both');
  const create = useCreatePlan();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const body: CreatePlanBody = { name: name.trim(), type, strategy };
    const plan = await create.mutateAsync(body);
    setOpen(false);
    setName('');
    void nav({ to: '/plans/$idOrSlug', params: { idOrSlug: plan.slug } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New plan</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a plan</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as PlanType)}>
              {(['mixed', 'item-based', 'query-based'] as const).map((t) => (
                <div key={t} className="flex items-center space-x-2">
                  <RadioGroupItem value={t} id={`type-${t}`} />
                  <Label htmlFor={`type-${t}`}>{t}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Strategy</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as PlanStrategy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cheapest-per-item">Cheapest per item</SelectItem>
                <SelectItem value="single-store">Single store</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/features/plans/plan-line-add-query.tsx`**

```tsx
import { useState } from 'react';
import { Button, Input } from '@market/ui';
import { useAddPlanLine } from '../../hooks/use-plan-mutations.js';

export function PlanLineAddQuery({ planIdOrSlug }: { planIdOrSlug: string }) {
  const [q, setQ] = useState('');
  const [qty, setQty] = useState(1);
  const add = useAddPlanLine(planIdOrSlug);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    await add.mutateAsync({ kind: 'query', query: q.trim(), quantity: qty });
    setQ('');
    setQty(1);
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input placeholder="e.g. milk" value={q} onChange={(e) => setQ(e.target.value)} />
      <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} className="w-20" />
      <Button type="submit" disabled={add.isPending}>Add query line</Button>
    </form>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/features/plans/plan-line-add-item.tsx`**

```tsx
import { useState } from 'react';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, Input, Skeleton,
} from '@market/ui';
import { useItemsQuery } from '../../hooks/use-items-query.js';
import { useAddPlanLine } from '../../hooks/use-plan-mutations.js';

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function PlanLineAddItem({ planIdOrSlug }: { planIdOrSlug: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [qty, setQty] = useState(1);
  const results = useItemsQuery({ q: q.length > 0 ? q : undefined, take: 20 });
  const add = useAddPlanLine(planIdOrSlug);

  const pick = async (itemSlug: string) => {
    await add.mutateAsync({ kind: 'item', itemIdOrSlug: itemSlug, quantity: qty });
    setOpen(false);
    setQ('');
    setQty(1);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add item line</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Pick an item</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} className="w-20" />
        </div>
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {results.isLoading && <Skeleton className="h-20 w-full" />}
          {results.data?.data.length === 0 && <p className="text-muted-foreground">No results.</p>}
          {results.data?.data.map((it) => (
            <button
              key={it.id}
              type="button"
              className="flex w-full items-center justify-between rounded border p-3 text-left hover:bg-muted"
              onClick={() => void pick(it.slug)}
            >
              <div>
                <div className="font-medium">{it.name}</div>
                <div className="text-xs text-muted-foreground">{it.storeName} · {it.vendor}</div>
              </div>
              <div className="font-semibold">{formatMinor(it.priceMinor, it.currency)}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/features/plans/plan-lines.tsx`**

```tsx
import { Button } from '@market/ui';
import type { PlanLine, PlanType } from '@market/contracts';
import { PlanLineAddQuery } from './plan-line-add-query.js';
import { PlanLineAddItem } from './plan-line-add-item.js';
import { useRemovePlanLine } from '../../hooks/use-plan-mutations.js';

interface Props {
  planIdOrSlug: string;
  planType: PlanType;
  lines: PlanLine[];
}

export function PlanLines({ planIdOrSlug, planType, lines }: Props) {
  const removeLine = useRemovePlanLine(planIdOrSlug);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {(planType === 'query-based' || planType === 'mixed') && <PlanLineAddQuery planIdOrSlug={planIdOrSlug} />}
        {(planType === 'item-based'  || planType === 'mixed') && <PlanLineAddItem  planIdOrSlug={planIdOrSlug} />}
      </div>

      <div className="divide-y rounded border">
        {lines.length === 0 && <div className="p-4 text-sm text-muted-foreground">No lines yet.</div>}
        {lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between p-3">
            <div className="text-sm">
              <span className="mr-2 rounded bg-muted px-2 py-0.5 text-xs uppercase">{l.kind}</span>
              {l.kind === 'query' ? l.query : l.itemName}
              <span className="ml-2 text-muted-foreground">× {l.quantity}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void removeLine.mutateAsync(l.id)}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/src/features/plans/plan-compute-panel.tsx`**

```tsx
import type { ComputePlanResponse } from '@market/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@market/ui';

function fmt(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function PlanComputePanel({ result }: { result: ComputePlanResponse | undefined }) {
  if (!result) return null;
  return (
    <div className="space-y-4">
      {result.cheapestPerItem && (
        <Card>
          <CardHeader><CardTitle>Cheapest per item</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Subtotal: {fmt(result.cheapestPerItem.itemsSubtotalMinor, result.cheapestPerItem.currency)}</div>
            <div>Delivery: {fmt(result.cheapestPerItem.deliverySubtotalMinor, result.cheapestPerItem.currency)}</div>
            <div className="font-semibold">Total: {fmt(result.cheapestPerItem.grandTotalMinor, result.cheapestPerItem.currency)}</div>
            <div className="text-muted-foreground">Venues: {result.cheapestPerItem.uniqueVenues.join(', ') || '—'}</div>
            {result.cheapestPerItem.unmet.length > 0 && (
              <div className="text-destructive">Unmet: {result.cheapestPerItem.unmet.join(', ')}</div>
            )}
          </CardContent>
        </Card>
      )}
      {result.singleStore && (
        <Card>
          <CardHeader><CardTitle>Single store: {result.singleStore.venueName}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Subtotal: {fmt(result.singleStore.itemsSubtotalMinor, result.singleStore.currency)}</div>
            <div>Delivery: {fmt(result.singleStore.deliveryFeeMinor, result.singleStore.currency)}</div>
            <div className="font-semibold">Total: {fmt(result.singleStore.grandTotalMinor, result.singleStore.currency)}</div>
            {result.singleStore.unmet.length > 0 && (
              <div className="text-destructive">Unmet: {result.singleStore.unmet.join(', ')}</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/plans/
git commit -m "feat(web/plans): add plan create dialog, lines, and compute panel components"
```

---

## Task 32: `apps/web` — pages/plans list + detail

**Files:**
- Create: `apps/web/src/pages/plans/list.tsx`
- Create: `apps/web/src/pages/plans/detail.tsx`

- [ ] **Step 1: Create `apps/web/src/pages/plans/list.tsx`**

```tsx
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@market/ui';
import { usePlansQuery } from '../../hooks/use-plans-query.js';
import { useDeletePlan } from '../../hooks/use-plan-mutations.js';
import { parseSort } from '../../search-schemas.js';
import { PaginationControls } from '../../features/listing/pagination-controls.js';
import { PlanCreateDialog } from '../../features/plans/plan-create-dialog.js';

export function PlansListPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/plans' });
  const del = useDeletePlan();

  const { data, isLoading, error } = usePlansQuery({
    skip: search.skip,
    take: search.take,
    q: search.q,
    sort: parseSort(search.sort),
    type: search.type,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plans</h1>
        <PlanCreateDialog />
      </div>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}
      {error && <p className="text-destructive">{String(error)}</p>}
      {data && (
        <>
          <div className="grid gap-3">
            {data.data.length === 0 && <p className="text-muted-foreground">No plans yet.</p>}
            {data.data.map((p) => (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>
                    <a className="hover:underline" href={`/plans/${p.slug}`}>{p.name}</a>
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => void del.mutateAsync(p.slug)}>Delete</Button>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {p.type} · {p.strategy} · {p.lineCount} line{p.lineCount === 1 ? '' : 's'}
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationControls
            skip={data.meta.skip}
            take={data.meta.take}
            total={data.meta.total}
            onChange={(n) => void nav({ to: '/plans', search: (s) => ({ ...s, ...n }) })}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/pages/plans/detail.tsx`**

```tsx
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import type { ComputePlanResponse } from '@market/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@market/ui';
import { usePlan } from '../../hooks/use-plan.js';
import { useComputePlan } from '../../hooks/use-plan-mutations.js';
import { PlanLines } from '../../features/plans/plan-lines.js';
import { PlanComputePanel } from '../../features/plans/plan-compute-panel.js';

export function PlanDetailPage() {
  const { idOrSlug } = useParams({ from: '/plans/$idOrSlug' });
  const { data, isLoading, error } = usePlan(idOrSlug);
  const compute = useComputePlan(idOrSlug);
  const [computed, setComputed] = useState<ComputePlanResponse | undefined>();

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive">{String(error)}</p>;
  if (!data) return <p>Not found.</p>;

  const { plan, lines } = data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{plan.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge>{plan.type}</Badge>
            <Badge variant="secondary">{plan.strategy}</Badge>
            <Button
              onClick={async () => setComputed(await compute.mutateAsync())}
              disabled={compute.isPending}
            >
              {compute.isPending ? 'Computing…' : 'Compute'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Slug: {plan.slug} · Created: {new Date(plan.createdAt).toLocaleString()}
        </CardContent>
      </Card>

      <PlanLines planIdOrSlug={plan.slug} planType={plan.type} lines={lines} />
      <PlanComputePanel result={computed} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/plans/
git commit -m "feat(web): add plans list and detail pages"
```

---

## Task 33: `apps/web` — router.ts, app.tsx, main.tsx

**Files:**
- Create: `apps/web/src/router.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Create `apps/web/src/router.ts`**

Copy spec §8.1 verbatim into `apps/web/src/router.ts`. The imports at the top of that block reference the page modules created in tasks 27–32; verify each path matches.

- [ ] **Step 2: Update `apps/web/src/app.tsx`**

```tsx
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './router.js';
import { queryClient } from './query-client.js';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Update `apps/web/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app.js';
import { ensureUser } from './api-client.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

ensureUser()
  .catch((err) => { console.error('user boot failed', err); })
  .finally(() => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
```

- [ ] **Step 4: Typecheck + build web**

Run: `pnpm --filter @market/web typecheck && pnpm --filter @market/web build`
Expected: success. If TanStack Router complains about missing route search types, double-check that `validateSearch` in `router.ts` points at the schemas from `search-schemas.ts` and the page components read via `Route.useSearch` with the right `from` path.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/router.ts apps/web/src/app.tsx apps/web/src/main.tsx
git commit -m "feat(web): wire config-based router and user boot"
```

---

## Task 34: End-to-end smoke test

- [ ] **Step 1: Make sure migrations are applied and the API is running**

```bash
pnpm --filter @market/api dev
```

- [ ] **Step 2: Crawl a test venue via the existing crawler CLI**

Pick a real wolt slug, e.g. `carrefour-express-tbilisi-didube`. Run the crawler task exactly as the existing instructions in `README.md` describe. It populates `stores`, `categories`, and `items` with slugs via the new upsert path.

Verify:
```sql
SELECT vendor, slug, name FROM stores LIMIT 5;
SELECT slug, name, price_minor FROM items LIMIT 5;
```
Every row must have a non-null `slug`.

- [ ] **Step 3: Start the web app**

```bash
pnpm --filter @market/web dev
```
Open `http://localhost:5173`.

- [ ] **Step 4: Walk the UI**

Expected behaviour:
- `/` — empty home page with the welcome text.
- `/stores` — shows the crawled stores. Click one → `/stores/<slug>` shows its detail card.
- `/products` — shows items. Search box filters results. Pagination works.
- `/vendors` — static page with 5 cards.
- `/plans` — empty list. Click **New plan**, open the dialog, create a `mixed` plan with strategy `both`, submit. You're navigated to `/plans/<slug>`.
- On the plan detail page:
  - Add a query line: "milk" × 2. It appears in the lines table.
  - Click **Add item line**, pick a product from the search. It appears in the lines table.
  - Click **Compute**. Both `Cheapest per item` and `Single store` cards appear with totals.
  - Remove a line. Click Compute again — the totals change.
- Go back to `/plans`. The plan shows `lineCount = 2`.
- Delete the plan from the list. It disappears.

- [ ] **Step 5: MCP smoke test (optional)**

With the API still running, start the MCP server pointed at it (see existing README instructions), set `MARKET_USER_ID` to the user id from localStorage (copy from browser devtools). Call `market_query_stores`, `market_query_items`, `market_query_plans`. Each should return the envelope with `{ data, meta }`.

- [ ] **Step 6: Commit any stray fixes you had to make during smoke testing**

If you had to make small fixes while testing, commit them as targeted fixes. Otherwise there's nothing to commit for this task.

---

## Self-Review Notes

(Use these while executing. If you find a conflict with the plan, prefer the spec.)

- **Spec coverage:**
  - §2 conventions → Tasks 2–6, 12, 13.
  - §3 route map → Tasks 16–19.
  - §4 schema → Tasks 8–9.
  - §5 contracts → Tasks 2–6.
  - §6 api implementation → Tasks 10–19.
  - §7 mcp → Task 21.
  - §8 web → Tasks 22–33.
  - §9 interim auth → Tasks 11, 14, 25, 33.
  - §10 task ordering → This plan follows that ordering, fanned out.
  - §11 removals → Each rename/delete covered in the corresponding task.

- **Type consistency checks done during writing:**
  - `StoreRow`, `StoreInsert`, `PlanRow`, `PlanLineRow`, `UserRow` exported from `db/types.ts` (Task 8) — used in services (Tasks 12–15).
  - `PlansService` methods (`query/create/getDetail/update/remove/addLine/updateLine/removeLine/compute`) match route handlers in Task 18 and mutation hooks in Task 26.
  - `StoreQueryResponse` envelope shape matches `storesRoutes` handler (Task 16) and `useStoresQuery` consumer (Tasks 26, 29).
  - MCP tool names in Task 21 match spec §7 exactly (16 tools).
  - Plan type-kind enforcement lives in the service (Task 15) and is surfaced as `ValidationError → 400` in the route (Task 18).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-15-web-plans-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
