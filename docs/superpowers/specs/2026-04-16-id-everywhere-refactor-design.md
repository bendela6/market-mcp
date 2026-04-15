# ID-everywhere refactor (short nanoid IDs, no slug lookups)

**Status:** Spec
**Date:** 2026-04-16
**Branch:** (to be created off `main`)

## Motivation

Slugs currently do two jobs in this codebase: they are a **human-readable label** and they are a **primary lookup key** used by the web frontend, MCP tools, backend routes, and service functions (`getByIdOrSlug` pattern). They are bad at job #2 because:

- Long product names generate long, brittle slugs that sometimes fail to fit cleanly into URLs or DB columns.
- Slug regeneration on rename breaks existing references.
- Having two equally-valid lookup modes (`id` OR `slug`) doubles the surface area of every route and service function.

**Goal:** Slugs become display-only. IDs become the only lookup key. To avoid UUID ugliness in URLs, IDs change from UUIDs to **12-character nanoid strings** (YouTube-style) generated with the standard base64url alphabet.

After this refactor, a product URL looks like `/products/abc123XyZ_4` — short, typable, and stable across renames.

## Scope

**In scope:**

- Database schema: all PKs/FKs for `stores`, `items`, `categories`, `plans`, `planLines`, `users`, and any other affected tables switch from `uuid` to `varchar(12)` generated via `nanoid(12)`.
- Backend API: every `:idOrSlug` route param → `:id`. Every `*IdOrSlug` contract field → `*Id`. Every `*ByIdOrSlug` service function → `*ById`. The `lib/id-or-slug.ts` helper is deleted.
- MCP tools: all tool inputs that accepted slugs (via `idOrSlug`) now accept IDs. Tool descriptions updated so LLM callers know they must `list`/`search` first to obtain an ID.
- Web frontend: router paths rename `$idOrSlug.tsx` → `$id.tsx`. Hooks, API client, card components, and search-param schemas all use IDs.
- Slugs remain in the DB, remain generated, and remain displayed in the UI where they currently render (e.g., plan detail page header). They are no longer used for any lookup.
- Migration strategy: **drop and recreate**. Dev DB is wiped; no data preservation.

**Out of scope (separate follow-up spec):**

- Live Wolt search toggle on the products list page. Parked; will be rebuilt on top of the new ID-based contracts after this refactor merges.

## Assumptions confirmed with the user

- Pre-release: dev DB can be wiped, old URLs will 404 (no redirect layer).
- Both web and MCP use IDs. No dual `by-slug` routes are introduced.
- ID format: 12 characters, default nanoid alphabet (`A-Za-z0-9_-`). Strict regex validation (`^[A-Za-z0-9_-]{12}$`) on ID path params and filter fields, to catch typos early.
- Single PR sequencing (not staged) — there is no production state to protect and no need for incremental rollout.

## Architecture

### Schema: short IDs via nanoid

**File:** `apps/api/src/db/schema.ts`

Every table with a UUID primary key changes from:

```ts
id: uuid('id').primaryKey().defaultRandom(),
```

to:

```ts
id: varchar('id', { length: 12 }).primaryKey().$defaultFn(() => nanoid(12)),
```

Every FK referencing one of those tables swaps from `uuid(...)` to `varchar(..., { length: 12 })`.

**Affected tables** (verified in `apps/api/src/db/schema.ts`):

- `users` (line 26) — PK only.
- `stores` (line 32) — PK only.
- `categories` (line 54) — PK + `storeId` FK.
- `items` (line 67) — PK + `storeId` FK + `categoryId` FK.
- `itemEmbeddings` (line 98) — `itemId` PK/FK.
- `embeddingJobs` (line 108) — `itemId` PK/FK.
- `priceObservations` (line 118) — PK + `itemId` FK.
- `plans` (line 129) — PK + `userId` FK.
- `planLines` (line 148) — PK + `planId` FK + `itemId` FK.

**`plans.storeSlugs` (line 137) — separate concern.** This column stores a user-selected array of store slugs used by the plan compute logic as a filter ("compute prices only across these stores"). Under the ID-everywhere rule, this column is renamed to `storeIds` and its type becomes `jsonb<string[]>` holding 12-char nanoid IDs. The rename propagates to:

- `packages/contracts/src/plans.ts` (lines 84, 110, 118) — `storeSlugs` → `storeIds` in `PlanResponseSchema`, `CreatePlanBodySchema`, `UpdatePlanBodySchema`.
- `apps/api/src/services/plans.ts` — any filter logic that looks up stores by slug switches to lookup by ID.
- `apps/mcp/src/tools.ts` — plan create/update tools pass `storeIds`.
- `apps/web/src/features/plans/plan-create-dialog.tsx` and any other plan editor UI.

**Nanoid configuration:**

- Alphabet: default (`A-Za-z0-9_-`, 64 chars, URL-safe, identical to YouTube's video ID alphabet).
- Length: 12.
- Collision probability at 10M rows ≈ 3×10⁻¹¹ — effectively zero. The PK unique constraint is the safety net; no retry-on-conflict logic is introduced.

**Migration:**

1. Add `nanoid` to `apps/api/package.json` dependencies.
2. Edit `schema.ts` to switch all affected columns.
3. Run `drizzle-kit generate` to produce a migration. Because the affected columns are PKs with dependent FKs, Drizzle will emit a drop-and-recreate. That's acceptable here.
4. Run `drizzle-kit migrate` against dev DB. All existing rows are lost.
5. Re-seed via existing flows (e.g., `POST /v1/stores/:id/refresh-assortment` after importing venues).

### Backend: contracts, services, routes

**Contracts — `packages/contracts/src/`**

- `common.ts`: delete `IdOrSlugParamsSchema`. Replace with:
  ```ts
  export const IdParamsSchema = v.object({
    id: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{12}$/)),
  });
  ```
- `catalog.ts`: in `ItemQueryBodySchema`, rename `storeIdOrSlug` → `storeId` and `categoryIdOrSlug` → `categoryId`. Both get the same 12-char regex validator.
- `plans.ts`: in `AddPlanLineBodySchema`, rename `itemIdOrSlug` → `itemId`, with the 12-char regex validator.
- `routes.ts`: URL builders drop the `idOrSlug` parameter name → `id`. For example, `stores.get(id)` returns `/v1/stores/${id}`. This file is shared between frontend and MCP — one edit updates both callers.

**Service layer — `apps/api/src/services/` and `apps/api/src/lib/`**

- **Delete** `apps/api/src/lib/id-or-slug.ts` and all its helper functions (`storeWhere`, `itemWhere`, `planWhere`).
- `services/stores.ts`: `getByIdOrSlug(idOrSlug)` → `getById(id)`. Implementation becomes a plain `db.query.stores.findFirst({ where: eq(stores.id, id) })`.
- `services/catalog.ts`:
  - `getItemByIdOrSlug(idOrSlug)` → `getItemById(id)`.
  - In `queryItems`, the `storeIdOrSlug` and `categoryIdOrSlug` branches become direct equality on `storeId` / `categoryId`. No more UUID-vs-slug branching.
- `services/plans.ts`:
  - Interface methods (`getDetail`, `update`, `remove`, `addLine`, `updateLine`, `removeLine`, `compute`) rename `idOrSlug` param → `id`. Drop slug fallback lookups.
  - `generateUniqueSlug()` **stays as-is** — slugs are still generated for display on new plans, and the uniqueness check against `plans.slug` remains valid since the column and its unique index are unchanged.
  - The `eq(items.slug, body.itemIdOrSlug)` lookup in `addLine` (services/plans.ts:229) becomes `eq(items.id, body.itemId)`.

**Routes — `apps/api/src/routes/`**

- Every path param `:idOrSlug` renames to `:id` in all Fastify route declarations.
- Every import of `IdOrSlugParamsSchema` switches to `IdParamsSchema`.
- Every `parsed.output.idOrSlug` access switches to `parsed.output.id`.
- No business logic changes in route handlers — they only thread `id` through to services.

Affected route files:

- `routes/catalog.ts` (GET single item)
- `routes/stores.ts` (GET single store, POST refresh-assortment)
- `routes/plans.ts` (GET/PATCH/DELETE plan, POST/PATCH/DELETE plan line, POST compute)

### MCP tools — `apps/mcp/src/tools.ts`

Every tool currently accepting `idOrSlug` (10 tools, per the earlier surface-area enumeration) gets updated:

- Input schema: `idOrSlug: z.string()` → a specific name (`storeId`, `itemId`, `planId`) using `z.string().regex(/^[A-Za-z0-9_-]{12}$/)`.
- Tool description updated to clarify that IDs are obtained from list/search tools (`query_items`, `list_stores`, `list_plans`, etc.). Example:

  > **get_store** — Fetch a store by its ID. IDs can be obtained from `list_stores` or `discover_venues` tools.

**UX consequence for LLM callers:** A request like "update the quantity in my groceries plan" now requires the LLM to make 2–3 tool calls instead of 1 (list/search first, then mutate). This is acceptable and is how most REST-style tool ecosystems already work.

### Web frontend — `apps/web/src/`

**Router — `apps/web/src/router.ts`**

Routes are defined inline with `createRoute` (not file-based), so only the `path` strings change — no files to rename on disk:

- `/stores/$idOrSlug` → `/stores/$id` (line 21)
- `/products/$idOrSlug` → `/products/$id` (line 25)
- `/plans/$idOrSlug` → `/plans/$id` (line 30)

The component files (`pages/stores/detail.tsx`, `pages/products/detail.tsx`, `pages/plans/detail.tsx`) stay put — only their `useParams` calls change.

**Detail pages**

Each detail page changes `useParams({ from: '/.../$idOrSlug' })` → `useParams({ from: '/.../$id' })` and `params.idOrSlug` → `params.id`. The value is passed through to the hook unchanged in shape.

**Hooks — `apps/web/src/hooks/`**

- `use-store.ts`: `useStore(idOrSlug)` → `useStore(id)`. Query key becomes `['stores', 'get', id]`.
- `use-item.ts`: same rename.
- `use-plan.ts`: same rename.
- `use-plan-mutations.ts`: all plan mutation hooks (`useUpdatePlan`, `useDeletePlan`, `useAddPlanLine`, `useRemovePlanLine`, `useComputePlan`) rename the constructor param.

**API client — `api-client.ts`**

Method signatures lose the `idOrSlug` name: `getStore(id)`, `getItem(id)`, `getPlan(id)`, `updatePlan(id, body)`, `deletePlan(id)`, `addPlanLine(id, body)`, `updatePlanLine(id, lineId, body)`, `removePlanLine(id, lineId)`, `computePlan(id)`.

**Card components and other navigation hotspots**

Five hardcoded slug-based navigation sites are rewritten to use IDs:

- `pages/plans/list.tsx:39` — `href={`/plans/${p.slug}`}` → `href={`/plans/${p.id}`}`
- `pages/plans/list.tsx:41` — `del.mutateAsync(p.slug)` → `del.mutateAsync(p.id)`
- `features/products/wolt-product-card.tsx:62` — `href={`/products/${item.slug}`}` → `href={`/products/${item.id}`}`
- `features/stores/wolt-store-card.tsx:107` — `href={`/stores/${store.slug}`}` → `href={`/stores/${store.id}`}`
- `features/plans/plan-create-dialog.tsx:26` — `nav({ to: '/plans/$idOrSlug', params: { idOrSlug: plan.slug } })` → `nav({ to: '/plans/$id', params: { id: plan.id } })`

**Search-param schemas — `search-schemas.ts:25`**

`ItemListSchema.storeIdOrSlug` → `ItemListSchema.storeId`. `pages/products/list.tsx:39` updated to read `search.storeId` instead of `search.storeIdOrSlug`.

**Features sub-component — `features/plans/plan-lines.tsx`**

Prop `planIdOrSlug` → `planId`. Callers in the plan detail page update the prop name.

## Data flow

The data flow is essentially unchanged — only the shape of the identifier passed through each layer changes.

```
User clicks a store card
  → href={`/stores/${store.id}`}          // 12-char nanoid
  → router matches /stores/$id
  → StoreDetailPage reads params.id
  → useStore(id)
  → api-client.getStore(id)
  → GET /v1/stores/{id}
  → IdParamsSchema validates id regex
  → stores service getById(id)
  → db.query.stores.findFirst({ where: eq(stores.id, id) })
  → returns StoreRow
```

No fallback lookups, no branching, no detection of "is this a UUID or a slug."

## Error handling

- **Invalid ID shape** (wrong length, wrong alphabet): `IdParamsSchema` regex rejection → 400 with a validation error message. Same for body filter fields like `storeId`.
- **ID not found**: service returns `undefined`, route returns 404 (same as current behavior).
- **Nanoid collision** on insert: the PK unique constraint throws. Because the collision probability at realistic scale is effectively zero, we do **not** catch this and retry — it would be a sign of something genuinely wrong with the nanoid module and should surface as a 500.

## Testing

**Reality check:** the repo currently has **no test infrastructure** — no test runner, no test files, no test scripts in any `package.json`. Bootstrapping a test runner is its own separate workstream and is out of scope for this refactor. The primary safety net is `tsc --noEmit` in strict mode, which catches renamed parameters, missing fields, and mismatched types across the monorepo. Given the mechanical nature of this refactor, type-checking is a strong guarantee.

Verification relies on:

- **`pnpm -r typecheck`** after each logical task group. Must pass before moving on.
- **`madge --circular`** on affected packages to confirm no new circular imports.
- **Manual smoke testing** at the end (enumerated below).

**Manual verification:**

1. `drizzle-kit migrate` runs clean against a freshly-dropped dev DB.
2. `pnpm dev` (api + web) starts without errors.
3. Run `POST /v1/stores/:id/refresh-assortment` (via curl or the stores page action) to seed data.
4. Navigate stores list → store detail → products list → product detail → plans list → plan detail → add plan line → compute plan. Every navigation uses the new ID URLs.
5. Invoke an MCP tool (`get_store` with an ID from `list_stores`) and verify it works.

## Sequencing

**Single PR.**

Reasons:

- Drop-and-recreate means no coexistence is needed between old and new schema.
- The changes are mechanically related (`idOrSlug` → `id`, `uuid` → `varchar(12)`) and reviewing them in isolation is harder than reviewing them together.
- Estimated blast radius: ~40–50 files, ~500–800 lines changed, ~90% mechanical renames.

The PR is still structured into logical commits (schema, contracts, services, routes, mcp, frontend, tests) so the history is readable.

## Risk & rollback

- **Main risk:** missed references to old `idOrSlug` names after the rename. Mitigation: grep for `idOrSlug`, `IdOrSlug`, `getByIdOrSlug`, `by-slug` after implementation; CI should run `tsc` strict and catch any broken references.
- **Rollback:** revert the PR, re-run the old migration against a fresh dev DB. Because dev DB is disposable, rollback is fast.

## Out of scope (explicit non-goals)

- Redirect layer for old slug URLs.
- Preserving any existing data across the schema migration.
- Touching vendor packages (Wolt/etc.) — they already deal in vendor-specific item IDs, not our internal UUIDs, so they're unaffected.
- Live Wolt product search toggle on products list page (deferred spec).
- Changing how slugs are generated or displayed in the UI beyond what's required to stop using them as lookup keys.
