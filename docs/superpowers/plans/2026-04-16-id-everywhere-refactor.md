# ID-everywhere refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UUID primary keys with 12-character nanoid strings, delete all `*IdOrSlug` lookup paths, and make the web frontend, backend HTTP routes, and MCP tools use IDs exclusively. Slugs stay in the DB and UI for display only.

**Architecture:** A mechanical monorepo refactor in five phases — schema + nanoid, contracts, backend services + routes, MCP tools, frontend. Dev DB is wiped and recreated; no data preservation. Primary safety net is `tsc --noEmit` because the repo has no test infrastructure.

**Tech Stack:** Drizzle ORM + Postgres, Fastify, valibot contracts, TanStack Router + react-query frontend, nanoid (new dep), TypeScript strict mode across all packages.

**Reference spec:** [docs/superpowers/specs/2026-04-16-id-everywhere-refactor-design.md](../specs/2026-04-16-id-everywhere-refactor-design.md)

---

## File structure overview

**Touched files, grouped by responsibility:**

- **Schema & migration** — `apps/api/src/db/schema.ts`, `apps/api/drizzle/*` (new migration file), `apps/api/package.json`
- **Contracts** — `packages/contracts/src/common.ts`, `catalog.ts`, `plans.ts`, `routes.ts`
- **Backend services** — `apps/api/src/services/stores.ts`, `catalog.ts`, `plans.ts`, deletion of `apps/api/src/lib/id-or-slug.ts`
- **Backend routes** — `apps/api/src/routes/stores.ts`, `catalog.ts`, `plans.ts`
- **MCP tools** — `apps/mcp/src/tools.ts`
- **Frontend** — `apps/web/src/search-schemas.ts`, `api-client.ts`, `router.ts`, `hooks/use-store.ts`, `use-item.ts`, `use-plan.ts`, `use-plan-mutations.ts`, `pages/stores/detail.tsx`, `pages/products/detail.tsx`, `pages/products/list.tsx`, `pages/plans/detail.tsx`, `pages/plans/list.tsx`, `features/plans/plan-lines.tsx`, `plan-line-add-item.tsx`, `plan-line-add-query.tsx`, `plan-create-dialog.tsx`, `features/products/wolt-product-card.tsx`, `features/stores/wolt-store-card.tsx`

---

## Phase 1 — Schema & nanoid

### Task 1: Install nanoid and update schema to short IDs

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Install nanoid in the api package**

Run:
```bash
pnpm --filter @market/api add nanoid
```

Expected: nanoid is added to `apps/api/package.json` dependencies, lockfile updated.

- [ ] **Step 2: Add nanoid helper at the top of `schema.ts`**

Edit `apps/api/src/db/schema.ts` — replace the import block at the top:

Old:
```ts
import {
  pgTable, uuid, text, integer, boolean, timestamp,
  index, uniqueIndex, jsonb, pgEnum, customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
```

New:
```ts
import {
  pgTable, varchar, text, integer, boolean, timestamp,
  index, uniqueIndex, jsonb, pgEnum, customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const shortId = (column = 'id') =>
  varchar(column, { length: 12 }).$defaultFn(() => nanoid(12));
```

- [ ] **Step 3: Replace every `uuid('id').primaryKey().defaultRandom()` with the shortId helper**

In `apps/api/src/db/schema.ts`, apply these exact replacements:

Line 27 (users):
```ts
  id:        shortId().primaryKey(),
```

Line 33 (stores):
```ts
  id:          shortId().primaryKey(),
```

Line 55 (categories):
```ts
  id:         shortId().primaryKey(),
```

Line 56 (categories.storeId):
```ts
  storeId:    varchar('store_id', { length: 12 }).notNull().references(() => stores.id, { onDelete: 'cascade' }),
```

Line 68 (items):
```ts
  id:           shortId().primaryKey(),
```

Line 70 (items.storeId):
```ts
  storeId:      varchar('store_id', { length: 12 }).notNull().references(() => stores.id, { onDelete: 'cascade' }),
```

Line 71 (items.categoryId):
```ts
  categoryId:   varchar('category_id', { length: 12 }).references(() => categories.id, { onDelete: 'set null' }),
```

Line 99 (itemEmbeddings.itemId as PK+FK):
```ts
  itemId:       varchar('item_id', { length: 12 }).primaryKey().references(() => items.id, { onDelete: 'cascade' }),
```

Line 109 (embeddingJobs.itemId as PK+FK):
```ts
  itemId:     varchar('item_id', { length: 12 }).primaryKey().references(() => items.id, { onDelete: 'cascade' }),
```

Line 119 (priceObservations):
```ts
  id:         shortId().primaryKey(),
```

Line 120 (priceObservations.itemId):
```ts
  itemId:     varchar('item_id', { length: 12 }).notNull().references(() => items.id, { onDelete: 'cascade' }),
```

Line 130 (plans):
```ts
  id:             shortId().primaryKey(),
```

Line 132 (plans.userId):
```ts
  userId:         varchar('user_id', { length: 12 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
```

Line 149 (planLines):
```ts
  id:        shortId().primaryKey(),
```

Line 150 (planLines.planId):
```ts
  planId:    varchar('plan_id', { length: 12 }).notNull().references(() => plans.id, { onDelete: 'cascade' }),
```

Line 155 (planLines.itemId):
```ts
  itemId:    varchar('item_id', { length: 12 }).references(() => items.id, { onDelete: 'set null' }),
```

- [ ] **Step 4: Rename `plans.storeSlugs` column → `storeIds`**

In `apps/api/src/db/schema.ts`, line 137 (inside the `plans` table definition):

Old:
```ts
  storeSlugs:     jsonb('store_slugs').$type<string[]>(),
```

New:
```ts
  storeIds:       jsonb('store_ids').$type<string[]>(),
```

- [ ] **Step 5: Typecheck the api package**

Run:
```bash
pnpm --filter @market/api typecheck
```

Expected: this will fail in `services/plans.ts` and `services/catalog.ts` because those files reference `r.storeSlugs`, `body.storeSlugs`, `plans.storeSlugs`, etc. That's expected — we'll fix them in Phase 3. Ignore the api failures for now and confirm the error messages are ONLY about `storeSlugs`, `getByIdOrSlug`, `storeIdOrSlug`, `categoryIdOrSlug`, `itemIdOrSlug`, or `IdOrSlugParamsSchema`. If any unrelated error appears, stop and diagnose.

### Task 2: Drop dev DB and generate fresh migration

**Files:**
- Create: `apps/api/drizzle/<new-hash>_*.sql` (generated by drizzle-kit)

- [ ] **Step 1: Drop the dev database tables**

The dev DB connection string lives in `.env` as `DATABASE_URL`. Drop all tables via psql:
```bash
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

Expected: `DROP SCHEMA` and `CREATE SCHEMA` both succeed.

- [ ] **Step 2: Delete obsolete drizzle migration artifacts**

The existing migrations reference the old UUID schema. Since we're recreating from scratch, delete them so drizzle-kit generates fresh:
```bash
rm -rf apps/api/drizzle/[0-9]*.sql apps/api/drizzle/meta/
```

Expected: `apps/api/drizzle/` only contains `drizzle.config.ts` (if present) and will be repopulated when we regenerate.

- [ ] **Step 3: Generate the new migration from the updated schema**

Run:
```bash
pnpm --filter @market/api db:generate
```

Expected: drizzle-kit writes a new `0000_*.sql` file describing the current schema with varchar(12) PKs and the `store_ids` column on plans. Verify with:
```bash
ls apps/api/drizzle/
```

- [ ] **Step 4: Apply the migration to the fresh DB**

Run:
```bash
pnpm --filter @market/api db:migrate
```

Expected: migration applies cleanly. Verify with:
```bash
psql "$DATABASE_URL" -c "\d stores" -c "\d items" -c "\d plans"
```

Look for: `id | character varying(12)` and `store_ids | jsonb` in the plans table.

- [ ] **Step 5: Sanity-check that nanoid default fires on insert**

Run:
```bash
psql "$DATABASE_URL" -c "INSERT INTO users DEFAULT VALUES RETURNING id;"
```

Expected: the returned id is 12 characters, alphanumeric + `_-`. If it's NULL or fails, the `$defaultFn` didn't wire up — check the schema.ts edit.

- [ ] **Step 6: Commit Phase 1**

```bash
git add apps/api/package.json apps/api/src/db/schema.ts apps/api/drizzle/ pnpm-lock.yaml
git commit -m "refactor(db): switch primary keys to 12-char nanoid and rename plans.storeSlugs → storeIds"
```

Note: `pnpm -r typecheck` is still broken at this point because callers reference the old contracts — that's fixed in later phases.

---

## Phase 2 — Contracts

### Task 3: Replace `IdOrSlugParamsSchema` with `IdParamsSchema` and add `ShortIdSchema`

**Files:**
- Modify: `packages/contracts/src/common.ts`

- [ ] **Step 1: Update `common.ts`**

In `packages/contracts/src/common.ts`, replace the last block:

Old (lines 53–55):
```ts
export const IdOrSlugParamsSchema = v.object({
  idOrSlug: v.pipe(v.string(), v.minLength(1)),
});
```

New:
```ts
export const ShortIdSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9_-]{12}$/, 'must be a 12-char short id'),
);

export const IdParamsSchema = v.object({
  id: ShortIdSchema,
});

export const LineIdParamsSchema = v.object({
  id: ShortIdSchema,
  lineId: ShortIdSchema,
});
```

The `LineIdParamsSchema` replaces the inline `LineIdParams` that `routes/plans.ts` currently defines — moving it into contracts keeps types centralized.

- [ ] **Step 2: Typecheck contracts**

Run:
```bash
pnpm --filter @market/contracts typecheck
```

Expected: passes cleanly (contracts package has no downstream deps).

### Task 4: Rename `storeIdOrSlug` / `categoryIdOrSlug` in `catalog.ts`

**Files:**
- Modify: `packages/contracts/src/catalog.ts`

- [ ] **Step 1: Update `ItemQueryBodySchema`**

In `packages/contracts/src/catalog.ts`, replace lines 32–42:

Old:
```ts
export const ItemQueryBodySchema = v.object({
  ...PaginationBaseSchema.entries,
  sort:             v.optional(v.array(SortItemSchema(ItemSortFields))),
  mode:             v.optional(SearchModeSchema),
  vendor:           v.optional(VendorIdSchema),
  storeIdOrSlug:    v.optional(v.string()),
  categoryIdOrSlug: v.optional(v.string()),
  minPriceMinor:    v.optional(PriceMinorSchema),
  maxPriceMinor:    v.optional(PriceMinorSchema),
  available:        v.optional(v.boolean()),
});
```

New:
```ts
export const ItemQueryBodySchema = v.object({
  ...PaginationBaseSchema.entries,
  sort:          v.optional(v.array(SortItemSchema(ItemSortFields))),
  mode:          v.optional(SearchModeSchema),
  vendor:        v.optional(VendorIdSchema),
  storeId:       v.optional(ShortIdSchema),
  categoryId:    v.optional(ShortIdSchema),
  minPriceMinor: v.optional(PriceMinorSchema),
  maxPriceMinor: v.optional(PriceMinorSchema),
  available:     v.optional(v.boolean()),
});
```

- [ ] **Step 2: Import `ShortIdSchema`**

In `packages/contracts/src/catalog.ts` top imports, replace:

Old:
```ts
import {
  PriceMinorSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  SortItemSchema,
  envelope,
} from './common.js';
```

New:
```ts
import {
  PriceMinorSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  ShortIdSchema,
  SortItemSchema,
  envelope,
} from './common.js';
```

### Task 5: Rename `itemIdOrSlug` and `storeSlugs` in `plans.ts`

**Files:**
- Modify: `packages/contracts/src/plans.ts`

- [ ] **Step 1: Import `ShortIdSchema`**

At the top of `packages/contracts/src/plans.ts`, update the import:

Old:
```ts
import {
  PriceMinorSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  SortItemSchema,
  envelope,
} from './common.js';
```

New:
```ts
import {
  PriceMinorSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  ShortIdSchema,
  SortItemSchema,
  envelope,
} from './common.js';
```

- [ ] **Step 2: Rename `storeSlugs` → `storeIds` in `PlanSchema`**

In `packages/contracts/src/plans.ts`, line 84:

Old:
```ts
  storeSlugs:     v.optional(v.array(v.string())),
```

New:
```ts
  storeIds:       v.optional(v.array(ShortIdSchema)),
```

- [ ] **Step 3: Rename `storeSlugs` → `storeIds` in `CreatePlanBodySchema`**

Line 110:

Old:
```ts
  storeSlugs:     v.optional(v.array(v.string())),
```

New:
```ts
  storeIds:       v.optional(v.array(ShortIdSchema)),
```

- [ ] **Step 4: Rename `storeSlugs` → `storeIds` in `UpdatePlanBodySchema`**

Line 118:

Old:
```ts
  storeSlugs:     v.optional(v.array(v.string())),
```

New:
```ts
  storeIds:       v.optional(v.array(ShortIdSchema)),
```

- [ ] **Step 5: Rename `itemIdOrSlug` → `itemId` in `AddPlanLineBodySchema`**

Line 130:

Old:
```ts
  v.object({
    kind:         v.literal('item'),
    itemIdOrSlug: v.string(),
    quantity:     v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
```

New:
```ts
  v.object({
    kind:     v.literal('item'),
    itemId:   ShortIdSchema,
    quantity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
```

### Task 6: Update `routes.ts` URL builders to take `id`

**Files:**
- Modify: `packages/contracts/src/routes.ts`

- [ ] **Step 1: Replace `idOrSlug` with `id` in every URL builder**

Replace the entire contents of `packages/contracts/src/routes.ts` with:

```ts
export const ROUTES = {
  stores: {
    query:             '/v1/stores/query',
    get:               (id: string) => `/v1/stores/${id}`,
    refreshAssortment: (id: string) => `/v1/stores/${id}/refresh-assortment`,
  },
  catalog: {
    itemQuery: '/v1/catalog/items/query',
    itemGet:   (id: string) => `/v1/catalog/items/${id}`,
    stats:     '/v1/catalog/stats',
  },
  plans: {
    query:   '/v1/plans/query',
    create:  '/v1/plans',
    get:     (id: string) => `/v1/plans/${id}`,
    update:  (id: string) => `/v1/plans/${id}`,
    delete:  (id: string) => `/v1/plans/${id}`,
    lines: {
      add:    (id: string) => `/v1/plans/${id}/lines`,
      update: (id: string, lineId: string) => `/v1/plans/${id}/lines/${lineId}`,
      delete: (id: string, lineId: string) => `/v1/plans/${id}/lines/${lineId}`,
    },
    compute: (id: string) => `/v1/plans/${id}/compute`,
  },
  users: {
    create: '/v1/users',
    me:     '/v1/users/me',
  },
  admin: { crawl: '/v1/admin/crawl' },
} as const;
```

- [ ] **Step 2: Build contracts and confirm typecheck**

Run:
```bash
pnpm --filter @market/contracts typecheck
pnpm --filter @market/contracts build
```

Expected: both pass cleanly. The build step rebuilds `dist/` so downstream packages pick up the new types.

---

## Phase 3 — Backend services and routes

### Task 7: Delete `lib/id-or-slug.ts`

**Files:**
- Delete: `apps/api/src/lib/id-or-slug.ts`

- [ ] **Step 1: Delete the file**

```bash
rm apps/api/src/lib/id-or-slug.ts
```

Expected: file is gone. Services that import from it will fail to compile — fixed in tasks 8–10.

### Task 8: Update `services/stores.ts`

**Files:**
- Modify: `apps/api/src/services/stores.ts`

- [ ] **Step 1: Remove the id-or-slug import**

In `apps/api/src/services/stores.ts`, delete this line near the top:

Old (line 6):
```ts
import { storeWhere } from '../lib/id-or-slug.js';
```

(Remove entirely — no replacement.)

- [ ] **Step 2: Rename the interface method**

Line 11:

Old:
```ts
  getByIdOrSlug(idOrSlug: string): Promise<StoreRow | undefined>;
```

New:
```ts
  getById(id: string): Promise<StoreRow | undefined>;
```

- [ ] **Step 3: Rewrite the implementation**

Lines 80–82:

Old:
```ts
    async getByIdOrSlug(idOrSlug) {
      return db.query.stores.findFirst({ where: storeWhere(idOrSlug) });
    },
```

New:
```ts
    async getById(id) {
      return db.query.stores.findFirst({ where: eq(stores.id, id) });
    },
```

(`eq` and `stores` are already imported at the top of the file.)

### Task 9: Update `services/catalog.ts`

**Files:**
- Modify: `apps/api/src/services/catalog.ts`

- [ ] **Step 1: Remove id-or-slug import**

Line 22:

Old:
```ts
import { itemWhere, isUuid } from '../lib/id-or-slug.js';
```

(Remove entirely.)

- [ ] **Step 2: Rename the interface method**

Line 50:

Old:
```ts
  getItemByIdOrSlug(idOrSlug: string): Promise<Item | undefined>;
```

New:
```ts
  getItemById(id: string): Promise<Item | undefined>;
```

- [ ] **Step 3: Delete `resolveStoreId` and `resolveCategoryId` helpers**

Lines 486–496 — delete the entire block:

```ts
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

- [ ] **Step 4: Update `queryItems` filter branches**

In `apps/api/src/services/catalog.ts`, lines 278–287:

Old:
```ts
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
```

New:
```ts
      if (body.storeId) conds.push(eq(items.storeId, body.storeId));
      if (body.categoryId) conds.push(eq(items.categoryId, body.categoryId));
```

- [ ] **Step 5: Rewrite `getItemByIdOrSlug` implementation**

Replace the method body (currently at lines 344–384) — rename it to `getItemById` and swap the `where` clause:

Old:
```ts
    async getItemByIdOrSlug(idOrSlug) {
      const row = await db
        .select({
          ...
        })
        .from(items)
        .innerJoin(stores, eq(stores.id, items.storeId))
        .where(itemWhere(idOrSlug))
        .limit(1);
```

New:
```ts
    async getItemById(id) {
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
          rawContent: items.rawContent,
        })
        .from(items)
        .innerJoin(stores, eq(stores.id, items.storeId))
        .where(eq(items.id, id))
        .limit(1);
```

The rest of the method body (row mapping) is unchanged.

- [ ] **Step 6: Check for stray `categories` import if it's only used by the deleted helpers**

Run:
```bash
pnpm --filter @market/api typecheck
```

If tsc complains that `categories` is imported but unused, remove `categories` from the import at the top of `catalog.ts`. If it's still referenced elsewhere in the file, leave it.

### Task 10: Update `services/plans.ts`

**Files:**
- Modify: `apps/api/src/services/plans.ts`

This is the largest service change because the `storeSlugs` filter inside `compute()` has to switch from slug-based matching to ID-based matching.

- [ ] **Step 1: Remove id-or-slug import**

Line 28:

Old:
```ts
import { isUuid, planWhere } from '../lib/id-or-slug.js';
```

(Remove entirely.)

- [ ] **Step 2: Rename interface method parameters**

Lines 38–44:

Old:
```ts
  getDetail(userId: string, idOrSlug: string): Promise<PlanDetail>;
  update(userId: string, idOrSlug: string, body: UpdatePlanBody): Promise<Plan>;
  remove(userId: string, idOrSlug: string): Promise<void>;
  addLine(userId: string, idOrSlug: string, body: AddPlanLineBody): Promise<PlanLine>;
  updateLine(userId: string, idOrSlug: string, lineId: string, body: UpdatePlanLineBody): Promise<PlanLine>;
  removeLine(userId: string, idOrSlug: string, lineId: string): Promise<void>;
  compute(userId: string, idOrSlug: string): Promise<ComputePlanResponse>;
```

New:
```ts
  getDetail(userId: string, id: string): Promise<PlanDetail>;
  update(userId: string, id: string, body: UpdatePlanBody): Promise<Plan>;
  remove(userId: string, id: string): Promise<void>;
  addLine(userId: string, id: string, body: AddPlanLineBody): Promise<PlanLine>;
  updateLine(userId: string, id: string, lineId: string, body: UpdatePlanLineBody): Promise<PlanLine>;
  removeLine(userId: string, id: string, lineId: string): Promise<void>;
  compute(userId: string, id: string): Promise<ComputePlanResponse>;
```

- [ ] **Step 3: Update `rowToPlan` to map `storeIds`**

Line 74:

Old:
```ts
    storeSlugs: r.storeSlugs ?? undefined,
```

New:
```ts
    storeIds: r.storeIds ?? undefined,
```

- [ ] **Step 4: Update `create` to write `storeIds`**

Line 151:

Old:
```ts
        storeSlugs: body.storeSlugs ?? null,
```

New:
```ts
        storeIds: body.storeIds ?? null,
```

- [ ] **Step 5: Replace every `planWhere(idOrSlug)` with `eq(plans.id, id)`**

Occurrences at lines 159, 172, 191, 199, 248, 273, 284. The pattern is the same in all of them:

Old:
```ts
      where: and(planWhere(idOrSlug), eq(plans.userId, userId)),
```

New:
```ts
      where: and(eq(plans.id, id), eq(plans.userId, userId)),
```

Apply this rewrite in every method (`getDetail`, `update`, `remove`, `addLine`, `updateLine`, `removeLine`, `compute`). At the same time, in each method body, replace the parameter destructuring `async getDetail(userId, idOrSlug)` → `async getDetail(userId, id)` and any inner `idOrSlug` reference → `id`.

- [ ] **Step 6: Update `update()` to set `storeIds`**

Line 180:

Old:
```ts
          ...(body.storeSlugs !== undefined && { storeSlugs: body.storeSlugs ?? null }),
```

New:
```ts
          ...(body.storeIds !== undefined && { storeIds: body.storeIds ?? null }),
```

- [ ] **Step 7: Rewrite `addLine` item-kind branch**

Lines 226–238:

Old:
```ts
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
```

New:
```ts
      } else {
        const itemRow = await db.query.items.findFirst({ where: eq(items.id, body.itemId) });
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
```

- [ ] **Step 8: Rewrite the `compute()` store filter to use IDs**

This is the trickiest change. `compute()` previously filtered candidates by `r.storeSlug`, which matched strings against `plan.storeSlugs`. Now we filter by store ID. The candidates flow through `HybridItemHit` which carries `storeId` already (verified at `apps/api/src/services/catalog.ts:28`), so we just switch the filter axis.

In `apps/api/src/services/plans.ts`, line 292:

Old:
```ts
      const storeFilter = plan.storeSlugs ? new Set(plan.storeSlugs) : null;
```

New:
```ts
      const storeFilter = plan.storeIds ? new Set(plan.storeIds) : null;
```

Lines 318 (inside the `item` kind branch):

Old:
```ts
          if (storeFilter && !storeFilter.has(r.storeSlug)) return { query: label, quantity, candidates: [] };
```

New:
```ts
          if (storeFilter && !storeFilter.has(r.storeId)) return { query: label, quantity, candidates: [] };
```

The `r` object here comes from a select that currently projects `storeSlug: stores.slug`. Add `storeId: stores.id` to the projection (line 308) and `storeId: items.storeId` is already there — we just read it. Update the select block (lines 299–311):

Old:
```ts
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
```

New:
```ts
          const row = await db
            .select({
              id: items.id,
              slug: items.slug,
              vendor: items.vendor,
              name: items.name,
              priceMinor: items.priceMinor,
              currency: items.currency,
              available: items.available,
              storeId: stores.id,
              storeSlug: stores.slug,
              storeName: stores.name,
            })
            .from(items)
            .innerJoin(stores, eq(stores.id, items.storeId))
            .where(eq(items.id, line.itemId!))
            .limit(1);
```

Note: `storeSlug` stays in the projection because it's used downstream for the `ItemCandidate.venueSlug` response field (line 321) — slugs remain a display concern.

Line 341 (inside the query-kind branch):

Old:
```ts
          if (storeFilter && !storeFilter.has(h.storeSlug)) continue;
```

New:
```ts
          if (storeFilter && !storeFilter.has(h.storeId)) continue;
```

Line 343:

Old:
```ts
          const existing = byStore.get(h.storeSlug);
          if (!existing || h.priceMinor < existing.priceMinor) byStore.set(h.storeSlug, h);
```

New:
```ts
          const existing = byStore.get(h.storeId);
          if (!existing || h.priceMinor < existing.priceMinor) byStore.set(h.storeId, h);
```

(`HybridItemHit.storeId` already exists — verified at `apps/api/src/services/catalog.ts:28`.)

- [ ] **Step 9: Typecheck the api package**

Run:
```bash
pnpm --filter @market/api typecheck
```

Expected: passes for services. Still fails for routes (next task).

### Task 11: Update backend routes

**Files:**
- Modify: `apps/api/src/routes/stores.ts`
- Modify: `apps/api/src/routes/catalog.ts`
- Modify: `apps/api/src/routes/plans.ts`

- [ ] **Step 1: Update `routes/stores.ts`**

Replace the import block:

Old:
```ts
import {
  IdOrSlugParamsSchema,
  ROUTES,
  StoreQueryBodySchema,
  type GetStoreResponse,
  type RefreshAssortmentResponse,
  type StoreQueryResponse,
} from '@market/contracts';
```

New:
```ts
import {
  IdParamsSchema,
  ROUTES,
  StoreQueryBodySchema,
  type GetStoreResponse,
  type RefreshAssortmentResponse,
  type StoreQueryResponse,
} from '@market/contracts';
```

Then in the two route handlers (lines 40 and 64), change the path string and param access:

Old (line 40):
```ts
    app.get('/v1/stores/:idOrSlug', async (request, reply) => {
      const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const row = await storesSvc.getByIdOrSlug(parsed.output.idOrSlug);
```

New:
```ts
    app.get('/v1/stores/:id', async (request, reply) => {
      const parsed = v.safeParse(IdParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const row = await storesSvc.getById(parsed.output.id);
```

Old (line 64):
```ts
    app.post(
      '/v1/stores/:idOrSlug/refresh-assortment',
      async (request, reply) => {
        const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
        if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
        const storeRow = await storesSvc.getByIdOrSlug(parsed.output.idOrSlug);
```

New:
```ts
    app.post(
      '/v1/stores/:id/refresh-assortment',
      async (request, reply) => {
        const parsed = v.safeParse(IdParamsSchema, request.params);
        if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
        const storeRow = await storesSvc.getById(parsed.output.id);
```

- [ ] **Step 2: Update `routes/catalog.ts`**

Replace the import block:

Old:
```ts
import {
  CatalogStatsResponseSchema,
  IdOrSlugParamsSchema,
  ItemQueryBodySchema,
  ROUTES,
  type CatalogStatsResponse,
  type GetItemResponse,
  type ItemQueryResponse,
} from '@market/contracts';
```

New:
```ts
import {
  CatalogStatsResponseSchema,
  IdParamsSchema,
  ItemQueryBodySchema,
  ROUTES,
  type CatalogStatsResponse,
  type GetItemResponse,
  type ItemQueryResponse,
} from '@market/contracts';
```

Line 33:

Old:
```ts
    app.get('/v1/catalog/items/:idOrSlug', async (request, reply) => {
      const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const item = await catalog.getItemByIdOrSlug(parsed.output.idOrSlug);
```

New:
```ts
    app.get('/v1/catalog/items/:id', async (request, reply) => {
      const parsed = v.safeParse(IdParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const item = await catalog.getItemById(parsed.output.id);
```

- [ ] **Step 3: Update `routes/plans.ts` imports and inline schema**

Replace the import block:

Old:
```ts
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
```

New:
```ts
import {
  AddPlanLineBodySchema,
  CreatePlanBodySchema,
  IdParamsSchema,
  LineIdParamsSchema,
  PlanQueryBodySchema,
  ROUTES,
  UpdatePlanBodySchema,
  UpdatePlanLineBodySchema,
  type ComputePlanResponse,
  type PlanDetail,
  type PlanQueryResponse,
} from '@market/contracts';
```

Delete the local inline schema (lines 18–21):

Old:
```ts
const LineIdParams = v.object({
  idOrSlug: v.pipe(v.string(), v.minLength(1)),
  lineId: v.pipe(v.string(), v.minLength(1)),
});
```

(Remove entirely.)

- [ ] **Step 4: Rewrite every plan route handler**

Apply these path + schema + param rewrites in `routes/plans.ts`:

GET plan (line 50):

Old:
```ts
    app.get('/v1/plans/:idOrSlug', { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const detail: PlanDetail = await plansSvc.getDetail(request.userId!, parsed.output.idOrSlug);
```

New:
```ts
    app.get('/v1/plans/:id', { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(IdParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const detail: PlanDetail = await plansSvc.getDetail(request.userId!, parsed.output.id);
```

PATCH plan (line 62):

Old:
```ts
    app.patch('/v1/plans/:idOrSlug', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.update(request.userId!, p.output.idOrSlug, b.output);
```

New:
```ts
    app.patch('/v1/plans/:id', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.update(request.userId!, p.output.id, b.output);
```

DELETE plan (line 75):

Old:
```ts
    app.delete('/v1/plans/:idOrSlug', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.remove(request.userId!, p.output.idOrSlug);
```

New:
```ts
    app.delete('/v1/plans/:id', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.remove(request.userId!, p.output.id);
```

POST add line (line 87):

Old:
```ts
    app.post('/v1/plans/:idOrSlug/lines', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(AddPlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.addLine(request.userId!, p.output.idOrSlug, b.output);
```

New:
```ts
    app.post('/v1/plans/:id/lines', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(AddPlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.addLine(request.userId!, p.output.id, b.output);
```

PATCH line (line 101):

Old:
```ts
    app.patch('/v1/plans/:idOrSlug/lines/:lineId', { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParams, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.updateLine(request.userId!, p.output.idOrSlug, p.output.lineId, b.output);
```

New:
```ts
    app.patch('/v1/plans/:id/lines/:lineId', { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.updateLine(request.userId!, p.output.id, p.output.lineId, b.output);
```

DELETE line (line 115):

Old:
```ts
    app.delete('/v1/plans/:idOrSlug/lines/:lineId', { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParams, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.removeLine(request.userId!, p.output.idOrSlug, p.output.lineId);
```

New:
```ts
    app.delete('/v1/plans/:id/lines/:lineId', { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.removeLine(request.userId!, p.output.id, p.output.lineId);
```

POST compute (line 127):

Old:
```ts
    app.post('/v1/plans/:idOrSlug/compute', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const resp: ComputePlanResponse = await plansSvc.compute(request.userId!, p.output.idOrSlug);
```

New:
```ts
    app.post('/v1/plans/:id/compute', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const resp: ComputePlanResponse = await plansSvc.compute(request.userId!, p.output.id);
```

- [ ] **Step 5: Typecheck api package**

Run:
```bash
pnpm --filter @market/api typecheck
```

Expected: passes cleanly. If any error references `storeSlugs`, `idOrSlug`, `IdOrSlug`, `getByIdOrSlug`, or `storeIdOrSlug`, fix it and re-run.

- [ ] **Step 6: Commit Phase 3**

```bash
git add packages/contracts/src/common.ts packages/contracts/src/catalog.ts \
        packages/contracts/src/plans.ts packages/contracts/src/routes.ts \
        apps/api/src/routes/stores.ts apps/api/src/routes/catalog.ts \
        apps/api/src/routes/plans.ts \
        apps/api/src/services/stores.ts apps/api/src/services/catalog.ts \
        apps/api/src/services/plans.ts
git rm apps/api/src/lib/id-or-slug.ts
git commit -m "refactor(api): switch routes, services, and contracts to id-only lookups"
```

---

## Phase 4 — MCP tools

### Task 12: Update MCP tool inputs

**Files:**
- Modify: `apps/mcp/src/tools.ts`

For each tool below, rename the `idOrSlug` input field to `id`, and rename `itemIdOrSlug` to `itemId`, and rename `storeSlugs` to `storeIds`. Tool descriptions updated to mention that IDs come from list/search tools.

- [ ] **Step 1: Update `market_get_store`**

Lines 49–58:

Old:
```ts
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
```

New:
```ts
  server.registerTool(
    'market_get_store',
    {
      title: 'Get a store by id',
      description: 'Fetch a single store (and its assortment content). Obtain the id from market_query_stores.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => ok(await api.get<GetStoreResponse>(ROUTES.stores.get(id))),
  );
```

- [ ] **Step 2: Update `market_refresh_assortment`**

Lines 60–70:

Old:
```ts
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
```

New:
```ts
  server.registerTool(
    'market_refresh_assortment',
    {
      title: 'Refresh store assortment',
      description: 'Trigger a live crawl of a store and persist results. Obtain the id from market_query_stores.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ id }) =>
      ok(await api.post<RefreshAssortmentResponse>(ROUTES.stores.refreshAssortment(id), {})),
  );
```

- [ ] **Step 3: Update `market_query_items` input schema**

Lines 92–116 — rename `storeIdOrSlug` → `storeId`, `categoryIdOrSlug` → `categoryId`:

Old:
```ts
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
```

New:
```ts
  server.registerTool(
    'market_query_items',
    {
      title: 'Query catalog items',
      description: 'List/search items with pagination, filters, sort. storeId/categoryId are short ids.',
      inputSchema: {
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(500).optional(),
        q: z.string().optional(),
        sort: z.array(SortItem).optional(),
        mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
        vendor: VendorEnum.optional(),
        storeId: z.string().length(12).optional(),
        categoryId: z.string().length(12).optional(),
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
```

- [ ] **Step 4: Update `market_get_item`**

Lines 118–127:

Old:
```ts
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
```

New:
```ts
  server.registerTool(
    'market_get_item',
    {
      title: 'Get a catalog item by id',
      description: 'Fetch a single item. Obtain the id from market_query_items.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => ok(await api.get<GetItemResponse>(ROUTES.catalog.itemGet(id))),
  );
```

- [ ] **Step 5: Update `market_create_plan` to use `storeIds`**

Lines 161–179:

Old:
```ts
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
      const body = input as CreatePlanBody;
      return ok(await api.post<Plan>(ROUTES.plans.create, body, mkUser()));
    },
  );
```

New:
```ts
  server.registerTool(
    'market_create_plan',
    {
      title: 'Create a plan',
      description: 'Create a new persisted plan. storeIds is a filter list of 12-char store ids.',
      inputSchema: {
        name: z.string().min(1),
        type: z.enum(['mixed', 'item-based', 'query-based']),
        strategy: z.enum(['cheapest-per-item', 'single-store', 'both']),
        vendor: VendorEnum.optional(),
        storeIds: z.array(z.string().length(12)).optional(),
        includeOffline: z.boolean().optional(),
      },
    },
    async (input) => {
      const body = input as CreatePlanBody;
      return ok(await api.post<Plan>(ROUTES.plans.create, body, mkUser()));
    },
  );
```

- [ ] **Step 6: Update `market_get_plan`**

Lines 181–190:

Old:
```ts
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
```

New:
```ts
  server.registerTool(
    'market_get_plan',
    {
      title: 'Get a plan',
      description: 'Fetch a plan and its lines. Obtain the id from market_query_plans.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => ok(await api.get<PlanDetail>(ROUTES.plans.get(id), mkUser())),
  );
```

- [ ] **Step 7: Update `market_update_plan`**

Lines 192–210:

Old:
```ts
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
      const body = rest as UpdatePlanBody;
      return ok(await api.patch<Plan>(ROUTES.plans.update(idOrSlug), body, mkUser()));
    },
  );
```

New:
```ts
  server.registerTool(
    'market_update_plan',
    {
      title: 'Update plan metadata',
      description: 'Update name, strategy, filters; type is immutable.',
      inputSchema: {
        id: z.string().length(12),
        name: z.string().min(1).optional(),
        strategy: z.enum(['cheapest-per-item', 'single-store', 'both']).optional(),
        vendor: VendorEnum.optional(),
        storeIds: z.array(z.string().length(12)).optional(),
        includeOffline: z.boolean().optional(),
      },
    },
    async ({ id, ...rest }) => {
      const body = rest as UpdatePlanBody;
      return ok(await api.patch<Plan>(ROUTES.plans.update(id), body, mkUser()));
    },
  );
```

- [ ] **Step 8: Update `market_delete_plan`**

Lines 212–224:

Old:
```ts
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
```

New:
```ts
  server.registerTool(
    'market_delete_plan',
    {
      title: 'Delete a plan',
      description: 'Delete a plan and its lines.',
      inputSchema: { id: z.string().length(12) },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      await api.del(ROUTES.plans.delete(id), mkUser());
      return ok({ deleted: id });
    },
  );
```

- [ ] **Step 9: Update `market_add_plan_line`**

Lines 226–243:

Old:
```ts
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
```

New:
```ts
  server.registerTool(
    'market_add_plan_line',
    {
      title: 'Add a line to a plan',
      description: 'Add a query line or lock in a specific item. itemId is a 12-char id from market_query_items.',
      inputSchema: {
        id: z.string().length(12),
        kind: z.enum(['query', 'item']),
        query: z.string().optional(),
        itemId: z.string().length(12).optional(),
        quantity: z.number().int().min(1).optional(),
      },
    },
    async ({ id, ...rest }) => {
      const body = rest as AddPlanLineBody;
      return ok(await api.post(ROUTES.plans.lines.add(id), body, mkUser()));
    },
  );
```

- [ ] **Step 10: Update `market_update_plan_line`**

Lines 245–261:

Old:
```ts
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
      const body = rest as UpdatePlanLineBody;
      return ok(await api.patch(ROUTES.plans.lines.update(idOrSlug, lineId), body, mkUser()));
    },
  );
```

New:
```ts
  server.registerTool(
    'market_update_plan_line',
    {
      title: 'Update a plan line',
      description: 'Update quantity or the query text on a query line.',
      inputSchema: {
        id: z.string().length(12),
        lineId: z.string().length(12),
        quantity: z.number().int().min(1).optional(),
        query: z.string().optional(),
      },
    },
    async ({ id, lineId, ...rest }) => {
      const body = rest as UpdatePlanLineBody;
      return ok(await api.patch(ROUTES.plans.lines.update(id, lineId), body, mkUser()));
    },
  );
```

- [ ] **Step 11: Update `market_remove_plan_line`**

Lines 263–275:

Old:
```ts
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
```

New:
```ts
  server.registerTool(
    'market_remove_plan_line',
    {
      title: 'Remove a plan line',
      description: 'Delete a single line from a plan.',
      inputSchema: { id: z.string().length(12), lineId: z.string().length(12) },
      annotations: { destructiveHint: true },
    },
    async ({ id, lineId }) => {
      await api.del(ROUTES.plans.lines.delete(id, lineId), mkUser());
      return ok({ deleted: lineId });
    },
  );
```

- [ ] **Step 12: Update `market_compute_plan`**

Lines 277–287:

Old:
```ts
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
```

New:
```ts
  server.registerTool(
    'market_compute_plan',
    {
      title: 'Compute plan',
      description: 'Run the strategy against the stored lines and return the plan result.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) =>
      ok(await api.post<ComputePlanResponse>(ROUTES.plans.compute(id), {}, mkUser())),
  );
```

- [ ] **Step 13: Typecheck MCP**

Run:
```bash
pnpm --filter @market/mcp typecheck
```

Expected: passes cleanly.

- [ ] **Step 14: Commit Phase 4**

```bash
git add apps/mcp/src/tools.ts
git commit -m "refactor(mcp): switch tool inputs from slug/idOrSlug to short ids"
```

---

## Phase 5 — Frontend

### Task 13: Update frontend search schema

**Files:**
- Modify: `apps/web/src/search-schemas.ts`

- [ ] **Step 1: Rename `storeIdOrSlug` → `storeId` in `ItemListSchema`**

`apps/web/src/search-schemas.ts`, line 25:

Old:
```ts
  storeIdOrSlug: v.optional(v.string()),
```

New:
```ts
  storeId: v.optional(v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{12}$/))),
```

### Task 14: Update the API client

**Files:**
- Modify: `apps/web/src/api-client.ts`

- [ ] **Step 1: Rename every method parameter from `idOrSlug` to `id`**

Replace lines 37–76 of `apps/web/src/api-client.ts` with:

```ts
export const api = {
  // stores
  queryStores: (body: StoreQueryBody) =>
    raw<StoreQueryResponse>(ROUTES.stores.query, { method: 'POST', body: JSON.stringify(body) }),
  getStore: (id: string) =>
    raw<GetStoreResponse>(ROUTES.stores.get(id), { method: 'GET' }),
  refreshStoreAssortment: (id: string) =>
    raw<RefreshAssortmentResponse>(ROUTES.stores.refreshAssortment(id), {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  // catalog
  queryItems: (body: ItemQueryBody) =>
    raw<ItemQueryResponse>(ROUTES.catalog.itemQuery, { method: 'POST', body: JSON.stringify(body) }),
  getItem: (id: string) =>
    raw<GetItemResponse>(ROUTES.catalog.itemGet(id), { method: 'GET' }),
  stats: () =>
    raw<CatalogStatsResponse>(ROUTES.catalog.stats, { method: 'GET' }),

  // plans
  queryPlans: (body: PlanQueryBody) =>
    raw<PlanQueryResponse>(ROUTES.plans.query, { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  createPlan: (body: CreatePlanBody) =>
    raw<Plan>(ROUTES.plans.create, { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  getPlan: (id: string) =>
    raw<PlanDetail>(ROUTES.plans.get(id), { method: 'GET', headers: userHeaders() }),
  updatePlan: (id: string, body: UpdatePlanBody) =>
    raw<Plan>(ROUTES.plans.update(id), { method: 'PATCH', body: JSON.stringify(body), headers: userHeaders() }),
  deletePlan: (id: string) =>
    raw<void>(ROUTES.plans.delete(id), { method: 'DELETE', headers: userHeaders() }),
  addPlanLine: (id: string, body: AddPlanLineBody) =>
    raw(ROUTES.plans.lines.add(id), { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  updatePlanLine: (id: string, lineId: string, body: UpdatePlanLineBody) =>
    raw(ROUTES.plans.lines.update(id, lineId), { method: 'PATCH', body: JSON.stringify(body), headers: userHeaders() }),
  removePlanLine: (id: string, lineId: string) =>
    raw<void>(ROUTES.plans.lines.delete(id, lineId), { method: 'DELETE', headers: userHeaders() }),
  computePlan: (id: string) =>
    raw<ComputePlanResponse>(ROUTES.plans.compute(id), { method: 'POST', body: JSON.stringify({}), headers: userHeaders() }),
};
```

### Task 15: Update the fetch hooks

**Files:**
- Modify: `apps/web/src/hooks/use-store.ts`
- Modify: `apps/web/src/hooks/use-store-mutations.ts`
- Modify: `apps/web/src/hooks/use-item.ts`
- Modify: `apps/web/src/hooks/use-plan.ts`
- Modify: `apps/web/src/hooks/use-plan-mutations.ts`

- [ ] **Step 1: Rewrite `use-store.ts`**

Replace the full contents of `apps/web/src/hooks/use-store.ts` with:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useStore(id: string) {
  return useQuery({
    queryKey: ['stores', 'get', id],
    queryFn: () => api.getStore(id),
    enabled: id.length > 0,
  });
}
```

- [ ] **Step 2: Rewrite `use-item.ts`**

Replace the full contents of `apps/web/src/hooks/use-item.ts` with:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useItem(id: string) {
  return useQuery({
    queryKey: ['items', 'get', id],
    queryFn: () => api.getItem(id),
    enabled: id.length > 0,
  });
}
```

- [ ] **Step 3: Rewrite `use-plan.ts`**

Replace the full contents of `apps/web/src/hooks/use-plan.ts` with:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function usePlan(id: string) {
  return useQuery({
    queryKey: ['plans', 'get', id],
    queryFn: () => api.getPlan(id),
    enabled: id.length > 0,
  });
}
```

- [ ] **Step 4: Rewrite `use-store-mutations.ts`**

Replace the full contents of `apps/web/src/hooks/use-store-mutations.ts` with:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RefreshAssortmentResponse } from '@market/contracts';
import { api } from '../api-client.js';

export function useRefreshStoreAssortment(id: string) {
  const qc = useQueryClient();
  return useMutation<RefreshAssortmentResponse>({
    mutationFn: () => api.refreshStoreAssortment(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stores', 'get', id] });
    },
  });
}
```

- [ ] **Step 5: Rewrite `use-plan-mutations.ts`**

Replace the full contents of `apps/web/src/hooks/use-plan-mutations.ts` with:

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

export function useUpdatePlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlanBody) => api.updatePlan(id, body),
    onSuccess: (_plan: Plan) => {
      void qc.invalidateQueries({ queryKey: ['plans', 'get', id] });
      void qc.invalidateQueries({ queryKey: ['plans', 'query'] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePlan(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'query'] }); },
  });
}

export function useAddPlanLine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPlanLineBody) => api.addPlanLine(id, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', id] }); },
  });
}

export function useUpdatePlanLine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: UpdatePlanLineBody }) =>
      api.updatePlanLine(id, lineId, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', id] }); },
  });
}

export function useRemovePlanLine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => api.removePlanLine(id, lineId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', id] }); },
  });
}

export function useComputePlan(id: string) {
  return useMutation<ComputePlanResponse>({
    mutationFn: () => api.computePlan(id),
  });
}
```

Note: `useUpdatePlan` used to also invalidate by the mutated plan's new slug — that second invalidation is gone because we key queries by id, and the id doesn't change on update.

### Task 16: Update the router

**Files:**
- Modify: `apps/web/src/router.ts`

- [ ] **Step 1: Update route paths**

In `apps/web/src/router.ts`, replace lines 17–32 with:

```ts
const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/stores',
                component: StoresListPage, validateSearch: storeListSearchSchema }),
  createRoute({ getParentRoute: () => rootRoute, path: '/stores/$id',
                component: StoreDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/products',
                component: ProductsListPage, validateSearch: itemListSearchSchema }),
  createRoute({ getParentRoute: () => rootRoute, path: '/products/$id',
                component: ProductDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/vendors', component: VendorsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/plans',
                component: PlansListPage, validateSearch: planListSearchSchema }),
  createRoute({ getParentRoute: () => rootRoute, path: '/plans/$id',
                component: PlanDetailPage }),
];
```

### Task 17: Update detail pages

**Files:**
- Modify: `apps/web/src/pages/stores/detail.tsx`
- Modify: `apps/web/src/pages/products/detail.tsx`
- Modify: `apps/web/src/pages/plans/detail.tsx`

- [ ] **Step 1: Update `pages/stores/detail.tsx`**

Line 8:

Old:
```ts
  const { idOrSlug } = useParams({ from: '/stores/$idOrSlug' });
  const { data, isLoading, error } = useStore(idOrSlug);
  const refresh = useRefreshStoreAssortment(idOrSlug);
```

New:
```ts
  const { id } = useParams({ from: '/stores/$id' });
  const { data, isLoading, error } = useStore(id);
  const refresh = useRefreshStoreAssortment(id);
```

- [ ] **Step 2: Update `pages/products/detail.tsx`**

Lines 7–8:

Old:
```tsx
  const { idOrSlug } = useParams({ from: '/products/$idOrSlug' });
  const { data, isLoading, error } = useItem(idOrSlug);
```

New:
```tsx
  const { id } = useParams({ from: '/products/$id' });
  const { data, isLoading, error } = useItem(id);
```

- [ ] **Step 3: Update `pages/plans/detail.tsx`**

Lines 11–13:

Old:
```ts
  const { idOrSlug } = useParams({ from: '/plans/$idOrSlug' });
  const { data, isLoading, error } = usePlan(idOrSlug);
  const compute = useComputePlan(idOrSlug);
```

New:
```ts
  const { id } = useParams({ from: '/plans/$id' });
  const { data, isLoading, error } = usePlan(id);
  const compute = useComputePlan(id);
```

Also update the `PlanLines` prop on line 43:

Old:
```tsx
      <PlanLines planIdOrSlug={plan.slug} planType={plan.type} lines={lines} />
```

New:
```tsx
      <PlanLines planId={plan.id} planType={plan.type} lines={lines} />
```

(The `PlanLines` prop rename is in the next task.)

### Task 18: Rename `planIdOrSlug` → `planId` in plan-lines features

**Files:**
- Modify: `apps/web/src/features/plans/plan-lines.tsx`
- Modify: `apps/web/src/features/plans/plan-line-add-query.tsx`
- Modify: `apps/web/src/features/plans/plan-line-add-item.tsx`

- [ ] **Step 1: Update `plan-lines.tsx`**

Replace the full contents of `apps/web/src/features/plans/plan-lines.tsx` with:

```tsx
import { Button } from '@market/ui';
import type { PlanLine, PlanType } from '@market/contracts';
import { PlanLineAddQuery } from './plan-line-add-query.js';
import { PlanLineAddItem } from './plan-line-add-item.js';
import { useRemovePlanLine } from '../../hooks/use-plan-mutations.js';

interface Props {
  planId: string;
  planType: PlanType;
  lines: PlanLine[];
}

export function PlanLines({ planId, planType, lines }: Props) {
  const removeLine = useRemovePlanLine(planId);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {(planType === 'query-based' || planType === 'mixed') && <PlanLineAddQuery planId={planId} />}
        {(planType === 'item-based'  || planType === 'mixed') && <PlanLineAddItem  planId={planId} />}
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

- [ ] **Step 2: Update `plan-line-add-query.tsx`**

Replace the full contents of `apps/web/src/features/plans/plan-line-add-query.tsx` with:

```tsx
import { useState } from 'react';
import { Button, Input } from '@market/ui';
import { useAddPlanLine } from '../../hooks/use-plan-mutations.js';

export function PlanLineAddQuery({ planId }: { planId: string }) {
  const [q, setQ] = useState('');
  const [qty, setQty] = useState(1);
  const add = useAddPlanLine(planId);

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

- [ ] **Step 3: Update `plan-line-add-item.tsx`**

Replace the full contents of `apps/web/src/features/plans/plan-line-add-item.tsx` with:

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

export function PlanLineAddItem({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [qty, setQty] = useState(1);
  const results = useItemsQuery({ skip: 0, take: 20, q: q.length > 0 ? q : undefined });
  const add = useAddPlanLine(planId);

  const pick = async (itemId: string) => {
    await add.mutateAsync({ kind: 'item', itemId, quantity: qty });
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
              onClick={() => void pick(it.id)}
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

The key changes: `planIdOrSlug` → `planId` in the prop, `pick(itemSlug)` → `pick(itemId)` with `it.id` passed instead of `it.slug`, and `itemIdOrSlug: itemSlug` → `itemId` in the mutation payload.

### Task 19: Update the plan create dialog

**Files:**
- Modify: `apps/web/src/features/plans/plan-create-dialog.tsx`

- [ ] **Step 1: Update the post-create navigation**

Line 26:

Old:
```ts
    void nav({ to: '/plans/$idOrSlug', params: { idOrSlug: plan.slug } });
```

New:
```ts
    void nav({ to: '/plans/$id', params: { id: plan.id } });
```

### Task 20: Update card link hotspots

**Files:**
- Modify: `apps/web/src/pages/plans/list.tsx`
- Modify: `apps/web/src/features/products/wolt-product-card.tsx`
- Modify: `apps/web/src/features/stores/wolt-store-card.tsx`

- [ ] **Step 1: Update `pages/plans/list.tsx`**

Line 39:

Old:
```tsx
                    <a className="hover:underline" href={`/plans/${p.slug}`}>{p.name}</a>
```

New:
```tsx
                    <a className="hover:underline" href={`/plans/${p.id}`}>{p.name}</a>
```

Line 41:

Old:
```tsx
                  <Button variant="ghost" size="sm" onClick={() => void del.mutateAsync(p.slug)}>Delete</Button>
```

New:
```tsx
                  <Button variant="ghost" size="sm" onClick={() => void del.mutateAsync(p.id)}>Delete</Button>
```

- [ ] **Step 2: Update `features/products/wolt-product-card.tsx`**

Line 62:

Old:
```tsx
      href={`/products/${item.slug}`}
```

New:
```tsx
      href={`/products/${item.id}`}
```

- [ ] **Step 3: Update `features/stores/wolt-store-card.tsx`**

Line 107:

Old:
```tsx
      href={`/stores/${store.slug}`}
```

New:
```tsx
      href={`/stores/${store.id}`}
```

### Task 21: Update products list page to pass `storeId`

**Files:**
- Modify: `apps/web/src/pages/products/list.tsx`

- [ ] **Step 1: Rename `storeIdOrSlug` → `storeId` in the query invocation**

Line 39:

Old:
```tsx
    storeIdOrSlug: search.storeIdOrSlug,
```

New:
```tsx
    storeId: search.storeId,
```

Note: `useItemsQuery` (`apps/web/src/hooks/use-items-query.ts`) is a thin pass-through wrapper that accepts `ItemQueryBody` directly, so it picks up the field rename from the contract update automatically — no code change needed in that hook.

### Task 22: Typecheck the web package

- [ ] **Step 1: Run web typecheck**

```bash
pnpm --filter @market/web typecheck
```

Expected: passes cleanly. If any error references `idOrSlug`, `storeIdOrSlug`, `itemIdOrSlug`, `storeSlugs`, or `planIdOrSlug`, fix at the referenced location.

- [ ] **Step 2: Commit Phase 5**

```bash
git add apps/web/src/
git commit -m "refactor(web): switch routes, hooks, and links to id-only"
```

---

## Phase 6 — Verification

### Task 23: Full monorepo verification

- [ ] **Step 1: Typecheck every package**

```bash
pnpm -r typecheck
```

Expected: all packages pass.

- [ ] **Step 2: Circular import check on all touched packages**

```bash
pnpm --filter @market/api check:circular
pnpm --filter @market/contracts check:circular
```

Expected: no circular dependencies introduced.

- [ ] **Step 3: Grep for any leftover idOrSlug references**

```bash
grep -Ern "idOrSlug|storeSlugs|planIdOrSlug|getByIdOrSlug|IdOrSlugParamsSchema|itemIdOrSlug|storeIdOrSlug|categoryIdOrSlug" apps packages 2>/dev/null | grep -v node_modules | grep -v dist
```

Expected: no results. If any appear in source files (ignore any in `docs/` or old archived plans), patch them and re-run typecheck.

### Task 24: Manual smoke test

- [ ] **Step 1: Start the stack**

```bash
pnpm dev
```

This runs the api, web, and any turbo-wired services. Wait for both api and web to report "listening".

- [ ] **Step 2: Seed data via the web UI or curl**

Open `http://localhost:<web-port>/stores`, discover some Wolt venues, click "Refresh assortment" on a venue. Verify the call succeeds (toast or success indicator) and that items appear.

Alternatively, via curl (replacing `<STORE_ID>` with a real 12-char id from `/stores`):
```bash
curl -X POST http://localhost:<api-port>/v1/stores/<STORE_ID>/refresh-assortment
```

Expected: 200 response with `{ categories, items, errors }`.

- [ ] **Step 3: Navigate through every ID-bearing URL**

In the browser:
1. `/stores` → click a store card → URL must be `/stores/<12-char-id>` → detail page loads.
2. `/products` → click a product card → URL must be `/products/<12-char-id>` → detail page loads.
3. `/plans` → create a new plan via the dialog → after creation, navigates to `/plans/<12-char-id>` → detail page loads.
4. Inside the plan, add a query line and (for item-based or mixed plans) an item line. Click Compute. Verify a result renders.

If any step fails with a 400 on a route, the most likely cause is the 12-char regex rejecting a malformed id — check the URL and the service that produced it.

- [ ] **Step 4: Smoke test an MCP tool**

From whatever MCP client is configured for this repo, run:
1. `market_query_stores` to get a list of stores. Copy one `id` from the response.
2. `market_get_store` with `{ id: "<that id>" }`. Expected: the store row.
3. `market_query_plans` to get plan ids. Copy a `planId`.
4. `market_compute_plan` with `{ id: "<planId>" }`. Expected: a compute response.

- [ ] **Step 5: Final grep for stragglers**

```bash
grep -rn "uuid" apps/api/src/db 2>/dev/null
```

Expected: no `uuid` references in the schema file (except possibly in comments). The column type is entirely `varchar(12)` now.

```bash
grep -rn "\.defaultRandom" apps/api/src 2>/dev/null
```

Expected: no results.

---

## Self-review notes

Spec coverage:

- Schema + nanoid migration → Tasks 1, 2
- `plans.storeSlugs` → `storeIds` → Tasks 1, 5, 10
- `lib/id-or-slug.ts` deletion → Task 7
- Contracts renames (common, catalog, plans, routes) → Tasks 3–6
- Backend services rewritten → Tasks 8–10
- Backend routes rewritten → Task 11
- MCP tools → Task 12
- Frontend (router, hooks, api-client, pages, features) → Tasks 13–21
- Typecheck + manual verification → Tasks 22–24

Type consistency:

- `ShortIdSchema` is defined once in `common.ts` and reused in `catalog.ts`, `plans.ts`, `IdParamsSchema`, and `LineIdParamsSchema`.
- Service method names match across interface, implementation, and call sites: `getById`, `getItemById`, `getDetail(id)`, `update(id)`, etc.
- Frontend hook params are uniformly `id: string`.
- Database column names: `store_ids` (new), all PKs remain `id`, all FKs keep their original snake_case column names with the new varchar(12) type.
