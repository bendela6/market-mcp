# Market Monorepo — Design

**Date:** 2026-04-14
**Status:** Approved (pending user spec review)
**Scope:** Convert the existing single-app `wolt-mcp` project into a pnpm + Turborepo monorepo, refactor it into three apps (`web`, `api`, `mcp`), introduce a multi-vendor scraping architecture, and add pgvector-backed hybrid search.

---

## 1. Repository Layout

```
wolt_mcp/                          (repo root — rename later)
├── apps/
│   ├── web/                       Vite + React + TS + Tailwind
│   ├── api/                       Fastify + Drizzle + Postgres + Valibot
│   └── mcp/                       @modelcontextprotocol/sdk (thin client of api)
├── packages/
│   ├── config/                    eslint, prettier, tsconfig, madge (subpath exports)
│   ├── contracts/                 valibot schemas + TS types (shared api↔web↔mcp)
│   ├── ui/                        shadcn/ui components (web-only)
│   └── vendors/
│       ├── core/                  Vendor interface + shared types
│       ├── wolt/                  current wolt client, ported
│       ├── glovo/                 stub
│       ├── bolt-food/             stub
│       ├── europroduct/           stub
│       └── goodwill/              stub
├── docker-compose.yml             postgres:pgvector + optional api/mcp
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                   root, private, devDeps only
├── tsconfig.json                  root, references children
└── .env                           shared dev env
```

**Package scope:** `@market/*` — e.g. `@market/ui`, `@market/api`, `@market/contracts`, `@market/config`, `@market/vendor-core`, `@market/vendor-wolt`.

**Package manager:** pnpm 9.12.0 (via `packageManager` field + corepack).
**Runtime:** Node 22+.
**Monorepo orchestrator:** Turborepo 2.3+.

---

## 2. Dependency Graph

```
            ┌────────────┐
            │ @market/ui │
            └─────┬──────┘
                  │
            ┌─────▼──────┐      ┌──────────────────┐
            │  apps/web  ├─────▶│ @market/contracts│
            └────────────┘      └────────┬─────────┘
                                         │
            ┌────────────┐               │
            │  apps/mcp  ├───────────────┤
            └─────┬──────┘               │
                  │ HTTP                 │
                  ▼                      │
            ┌────────────┐               │
            │  apps/api  ├───────────────┘
            └─────┬──────┘
                  │
         ┌────────▼────────┐
         │ @market/vendor-*│
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │ @market/        │
         │   vendor-core   │
         └─────────────────┘
```

**Rules (enforced by `eslint-plugin-boundaries` + `madge`):**

- `apps/*` never imports from another `apps/*` — only via HTTP.
- `packages/vendors/*` (non-core) only imports from `@market/vendor-core` and `@market/config`.
- `apps/api` is the only package allowed to import `drizzle-orm/node-postgres` and the DB client.
- `packages/ui` has no dependency on any `packages/vendors/*` or `apps/api`.
- Circular dependencies are errors (madge fails).

---

## 3. Data Flow, Vendor Interface, and REST Surface

### 3.1 Vendor interface

Every vendor implementation (`@market/vendor-<name>`) exports a factory returning an object satisfying this interface, defined in `@market/vendor-core`:

```ts
// packages/vendors/core/src/vendor.ts
import type { Venue, VenueContent, AssortmentIndex, CategoryPage } from './types.js';

export type VendorId =
  | 'wolt' | 'glovo' | 'bolt-food' | 'europroduct' | 'goodwill';

export interface Vendor {
  readonly id: VendorId;
  readonly displayName: string;
  readonly defaultCurrency: string; // 'GEL', 'EUR', etc.

  searchVenues(input: { query: string; lat: number; lon: number }): Promise<Venue[]>;
  discoverVenues(input: { lat: number; lon: number }): Promise<Venue[]>;
  getVenueContent(slug: string): Promise<VenueContent>;
  getAssortmentIndex(slug: string): Promise<AssortmentIndex>;
  getCategoryItems(venueSlug: string, categorySlug: string): Promise<CategoryPage>;
}
```

`@market/vendor-core` also exports shared types: `Venue`, `VenueContent`, `Product`, `Price` (integer minor units + currency), `AssortmentCategory`, `AssortmentIndex`, `CategoryPage`, plus a `VendorRegistry` helper (`createRegistry([woltVendor, glovoVendor, ...])`).

`apps/api` wires enabled vendors from env (`ENABLED_VENDORS=wolt,glovo`).

### 3.2 End-to-end data flow

```
1. Scheduled crawl (inside apps/api)
   ┌──────────────────┐     ┌──────────────┐     ┌──────────┐
   │ node-cron in api ├────▶│ VendorRegistry├────▶│ Postgres │
   └──────────────────┘     └──────────────┘     └──────────┘
        every N hours        for each enabled    drizzle upserts
                             vendor, walk        (venues, categories,
                             venues + assortment  items, price obs)

2. User hits web
   web ──(TanStack Query: GET /v1/catalog/search)──▶ api ──▶ drizzle ──▶ postgres

3. LLM hits mcp
   claude ──(MCP tool call)──▶ apps/mcp ──(fetch)──▶ api ──▶ drizzle ──▶ postgres

4. Live vendor passthrough (optional tools)
   mcp/web ──▶ api ──▶ VendorRegistry ──▶ upstream Wolt/Glovo/... HTTP
                                      ──▶ drizzle upsert (side effect)
```

**Invariant:** the DB is the source of truth. Live vendor calls are always orchestrated by api and their results pass through the drizzle writer. Neither `mcp` nor `web` know that vendors exist as a concept — they consume api's REST surface.

### 3.3 REST surface (api)

```
GET    /v1/venues                 ?q=&vendor=&productLine=&online=&limit=
GET    /v1/venues/:vendor/:slug
POST   /v1/venues/:vendor/:slug/refresh-assortment
GET    /v1/catalog/search         ?q=&vendor=&mode=hybrid&limit=
GET    /v1/catalog/stats
POST   /v1/shopping-list          body: { items, strategy, vendorSlugs?, includeOffline? }

POST   /v1/admin/crawl            body: { vendor?: VendorId, venueSlugs?: string[] }   (bearer API_TOKEN)
```

Every endpoint's request/response schema lives in `@market/contracts` as a **valibot schema**. `apps/api` uses them for Fastify validation via `@fastify/type-provider-standard-schema`. `apps/web` uses them for typed TanStack Query hooks. `apps/mcp` uses them to build its tool input schemas and typed fetch client.

Authentication: bearer `API_TOKEN` header on admin endpoints; public endpoints open in dev, gated by the same token or upstream reverse proxy in prod.

### 3.4 MCP tools — renamed to `market_*`

All tools get the `market_` prefix. Every tool takes an optional `vendor: VendorId` parameter (omitted = all enabled vendors, or a configured default).

| Old                             | New                             |
|---------------------------------|---------------------------------|
| `wolt_search_venues`            | `market_search_venues`          |
| `wolt_discover_venues`          | `market_discover_venues`        |
| `wolt_list_cached_venues`       | `market_list_venues`            |
| `wolt_get_venue`                | `market_get_venue`              |
| `wolt_get_assortment_index`     | `market_get_assortment_index`   |
| `wolt_get_category_items`       | `market_get_category_items`     |
| `wolt_refresh_venue_assortment` | `market_refresh_assortment`     |
| `wolt_catalog_search_items`     | `market_search_items`           |
| `wolt_catalog_stats`            | `market_catalog_stats`          |
| `wolt_build_shopping_list`      | `market_build_shopping_list`    |

`apps/mcp` keeps the existing dual transport (stdio default, `MCP_HTTP=1` for streamable HTTP on port 8787), but each tool handler is now a ~6-line wrapper: parse input → `fetch(API_URL + endpoint)` → return result.

---

## 4. Persistence (Drizzle + pgvector)

### 4.1 Sizing target

Catalog scale estimates for Georgia:

| Phase | Vendors | Raw items | After GTIN dedup |
|---|---|---|---|
| MVP | Wolt only | ~400K | ~400K |
| Phase 1 | Wolt + Glovo + Bolt Food | ~2.0M | ~1.4M |
| Phase 2 | + Europroduct + Goodwill | ~3.0M | ~2.1M |
| Upper bound | all 5, full catalog | ~5M | ~3.5M |

Storage (full `vector(1024)`, HNSW index): ~6 GB at MVP, ~31 GB at phase 2. Embedding cost across all phases is trivial ($0.24–$10.50 per full re-embed).

**Decisions:**
- Use full `vector(1024)` (not `halfvec`). Simpler, battle-tested, revisit only if DB exceeds ~40 GB.
- Store prices as `integer` minor units (tetri for GEL).
- Index GTIN (barcode) for cross-vendor dedup later.
- pgvector sufficient through 10M rows; no separate vector DB.

### 4.2 Postgres extensions

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram fuzzy search
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector
```

Docker image: `pgvector/pgvector:pg16` (bundles all three).

### 4.3 Schema (Drizzle, Postgres)

```ts
// apps/api/src/db/schema.ts

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
                    sql`${items.name} || ' ' || coalesce(${items.description}, '')`,
                    { mode: 'stored' }
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
  modelVersion:  text('model_version').notNull(),  // 'voyage-3', 'openai-3-small-1024', 'bge-m3', ...
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
```

### 4.4 Embeddings

**Provider interface** (in `apps/api/src/embeddings/embedder.ts`):

```ts
export interface Embedder {
  readonly id: string;             // 'voyage-3', 'openai-3-small-1024', 'bge-m3'
  readonly dimensions: number;     // always 1024 in v1
  readonly maxBatch: number;
  embed(texts: string[]): Promise<number[][]>;
}
```

Implementations: `createVoyageEmbedder`, `createOpenAIEmbedder` (truncated to 1024 dims via `dimensions` param), `createOllamaEmbedder`, `createCohereEmbedder`. Selection via `EMBEDDER` env var. All producers normalize to 1024 dims so switching providers requires only a re-embed, not a schema change.

**Recommended defaults:**
- Quality-first production: Voyage `voyage-3`
- Ubiquity/cost default in `.env.example`: OpenAI `text-embedding-3-small` with `dimensions: 1024`
- Local/private escape hatch: Ollama `bge-m3`

**Worker loop** (`apps/api/src/workers/embedding-worker.ts`):

- Polled every 5s, batches up to 100 items per tick.
- Uses `SELECT ... FOR UPDATE SKIP LOCKED` with a 5-minute lock expiry for multi-worker safety.
- On success: upsert `item_embeddings` (with `model_version = embedder.id`), delete job row.
- On failure: increment attempts, store `last_error`, release lock; retried next tick.
- Started from api bootstrap when `EMBEDDING_WORKER=on`.

**Enqueue trigger:** catalog upsert service inserts into `embedding_jobs` with `ON CONFLICT DO NOTHING` after any item write.

**Model version migration:** a background task can enqueue all rows where `item_embeddings.model_version != currentEmbedder.id` to trigger a full re-embed; re-embed cost is pennies across all phases.

### 4.5 Hybrid search

`/v1/catalog/search?mode=hybrid` runs Reciprocal Rank Fusion (RRF, k=60) over Postgres full-text and pgvector cosine:

```sql
WITH
  q AS (SELECT $1::text AS qtext, $2::vector(1024) AS qvec),
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
SELECT i.*, v.name AS venue_name, v.vendor, f.score
FROM fused f
JOIN items i ON i.id = f.id
JOIN venues v ON v.id = i.venue_id
ORDER BY f.score DESC
LIMIT $3;
```

Raw `sql` in drizzle, wrapped in a `searchItemsHybrid(query, embedder, limit)` service function. Modes: `keyword` (FTS only), `semantic` (vector only), `hybrid` (default).

### 4.6 Dedup hook (future)

Items carry `gtin`, indexed. A later `product_clusters` table can map logical products (one per GTIN) to cross-vendor items. Out of scope for v1 but the schema supports it.

---

## 5. Tooling (Turbo, pnpm, ESLint, Prettier, madge, TypeScript, Docker)

### 5.1 pnpm workspace

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/vendors/*"
```

**Root `package.json`:**

```json
{
  "name": "market",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22", "pnpm": ">=9" },
  "scripts": {
    "build":          "turbo run build",
    "dev":            "turbo run dev",
    "lint":           "turbo run lint",
    "typecheck":      "turbo run typecheck",
    "check:circular": "turbo run check:circular",
    "format":         "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "format:check":   "prettier --check \"**/*.{ts,tsx,json,md}\"",
    "clean":          "turbo run clean && rimraf node_modules",
    "test":           "turbo run test",
    "db:generate":    "pnpm --filter @market/api db:generate",
    "db:migrate":     "pnpm --filter @market/api db:migrate",
    "crawl":          "pnpm --filter @market/api crawl"
  },
  "devDependencies": {
    "turbo":      "^2.3.0",
    "prettier":   "^3.3.3",
    "rimraf":     "^6.0.1",
    "typescript": "^5.6.3"
  }
}
```

### 5.2 Turborepo config

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": ["**/.env.*local", ".env"],
  "globalEnv": [
    "NODE_ENV", "DATABASE_URL", "API_URL", "API_TOKEN",
    "EMBEDDER", "VOYAGE_API_KEY", "OPENAI_API_KEY", "OLLAMA_BASE_URL", "COHERE_API_KEY",
    "ENABLED_VENDORS", "WOLT_LAT", "WOLT_LON"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "build/**"]
    },
    "dev":            { "cache": false, "persistent": true, "dependsOn": ["^build"] },
    "lint":           { "dependsOn": ["^build"], "outputs": [] },
    "typecheck":      { "dependsOn": ["^build"], "outputs": [] },
    "check:circular": { "dependsOn": ["^build"], "outputs": [] },
    "test":           { "dependsOn": ["^build"], "outputs": [] },
    "clean":          { "cache": false }
  }
}
```

`dependsOn: ["^build"]` on lint/typecheck ensures cross-package type resolution picks up the dependency's `dist/`.

### 5.3 `@market/config` (single package, subpath exports)

```
packages/config/
├── package.json
├── eslint/
│   ├── base.js            shared TS rules
│   ├── node.js            extends base, adds node globals + process.env ban
│   ├── react.js           extends base, adds react/jsx-a11y
│   └── boundaries.js      eslint-plugin-boundaries rules (dependency graph)
├── prettier/
│   └── index.js
├── tsconfig/
│   ├── base.json          strict, ES2022, moduleResolution bundler
│   ├── node.json          extends base, module NodeNext
│   ├── react.json         extends base, jsx react-jsx, dom libs
│   └── package.json       extends base, emit .d.ts
└── madge/
    └── madge.config.cjs   circular check config
```

```json
// packages/config/package.json
{
  "name": "@market/config",
  "private": true,
  "type": "module",
  "exports": {
    "./eslint/base":       "./eslint/base.js",
    "./eslint/node":       "./eslint/node.js",
    "./eslint/react":      "./eslint/react.js",
    "./eslint/boundaries": "./eslint/boundaries.js",
    "./prettier":          "./prettier/index.js",
    "./tsconfig/base":     "./tsconfig/base.json",
    "./tsconfig/node":     "./tsconfig/node.json",
    "./tsconfig/react":    "./tsconfig/react.json",
    "./tsconfig/package":  "./tsconfig/package.json",
    "./madge":             "./madge/madge.config.cjs"
  }
}
```

Consumer example:

```js
// apps/api/eslint.config.js
import node from '@market/config/eslint/node';
import boundaries from '@market/config/eslint/boundaries';
export default [...node, ...boundaries];
```

**Boundaries rules** (cross-package isolation):

```js
// packages/config/eslint/boundaries.js
export default [{
  plugins: { boundaries },
  settings: {
    'boundaries/elements': [
      { type: 'app',       pattern: 'apps/*' },
      { type: 'vendor',    pattern: 'packages/vendors/*' },
      { type: 'contracts', pattern: 'packages/contracts' },
      { type: 'ui',        pattern: 'packages/ui' },
      { type: 'config',    pattern: 'packages/config' },
    ],
  },
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        { from: 'app',    allow: ['contracts', 'ui', 'vendor', 'config'] },
        { from: 'vendor', allow: ['vendor', 'config'] },
        { from: 'ui',     allow: ['config'] },
      ],
    }],
  },
}];
```

### 5.4 TypeScript base

```jsonc
// packages/config/tsconfig/base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- `tsconfig/node.json` extends base, sets `module: NodeNext`, `moduleResolution: NodeNext`, `types: ["node"]`.
- `tsconfig/react.json` extends base, sets `jsx: react-jsx`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: ["vite/client"]`.

Each app/package `tsconfig.json` extends one of these plus its own `outDir`, `rootDir`, `include`.

### 5.5 madge (circular dependency check)

```js
// packages/config/madge/madge.config.cjs
module.exports = {
  fileExtensions: ['ts', 'tsx'],
  tsConfig: './tsconfig.json',
  excludeRegExp: [/\.d\.ts$/, /node_modules/, /dist/],
  detectiveOptions: {
    ts: { skipTypeImports: true },
    tsx: { skipTypeImports: true },
  },
};
```

Per-package script (pnpm symlinks `@market/config` into every consumer's `node_modules`, so this path resolves from any depth):
`"check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src"` — task fails if any cycle found.

### 5.6 Prettier

```js
// packages/config/prettier/index.js
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss'],
};
```

Root reads via `"prettier": "@market/config/prettier"` in root `package.json`.

### 5.7 Per-package scripts (convention)

Every app/package exposes the same task names so `turbo run <task>` is uniform:

```json
{
  "scripts": {
    "build":          "tsc -p tsconfig.json",
    "dev":            "tsx watch src/server.ts",
    "lint":           "eslint src",
    "typecheck":      "tsc --noEmit",
    "check:circular": "madge --circular --config node_modules/@market/config/madge/madge.config.cjs src",
    "clean":          "rimraf dist"
  }
}
```

Packages without build output (e.g., `@market/config`) either omit the script or no-op it. Turbo tolerates absence.

### 5.8 Environment validation (`src/environment.ts` per app)

Every app owns a `src/environment.ts` that parses env vars with **valibot**, fails fast on startup, and exports a frozen `environment` object. All env reads go through this module — direct `process.env.*` access outside it is an ESLint error.

**Shared helper (inlined per app):**

```ts
function parseEnv<T>(schema: v.GenericSchema<unknown, T>, source: unknown, label: string): T {
  const result = v.safeParse(schema, source);
  if (result.success) return Object.freeze(result.output) as T;
  const issues = result.issues
    .map((i) => `  - ${(i.path ?? []).map((p: any) => p.key).join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(`[${label}] invalid environment:\n${issues}`);
  process.exit(1);
}
```

**`apps/api/src/environment.ts`:**

```ts
import * as v from 'valibot';

const NumberFromString = v.pipe(
  v.string(),
  v.transform((s) => Number(s)),
  v.number(),
  v.integer(),
);

const CsvList = v.pipe(
  v.string(),
  v.transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  v.array(v.string()),
);

const VendorId = v.picklist(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill'] as const);

const Schema = v.pipe(
  v.object({
    NODE_ENV:          v.picklist(['development', 'production', 'test'] as const),
    API_PORT:          v.pipe(NumberFromString, v.minValue(1), v.maxValue(65535)),
    API_TOKEN:         v.pipe(v.string(), v.minLength(8)),
    DATABASE_URL:      v.pipe(v.string(), v.url()),
    EMBEDDING_WORKER:  v.picklist(['on', 'off'] as const),
    ENABLED_VENDORS:   v.pipe(CsvList, v.array(VendorId)),
    EMBEDDER:          v.picklist(['voyage', 'openai', 'ollama', 'cohere'] as const),
    VOYAGE_API_KEY:    v.optional(v.string()),
    OPENAI_API_KEY:    v.optional(v.string()),
    OLLAMA_BASE_URL:   v.optional(v.pipe(v.string(), v.url())),
    COHERE_API_KEY:    v.optional(v.string()),
    WOLT_LAT:          NumberFromString,
    WOLT_LON:          NumberFromString,
  }),
  v.forward(
    v.partialCheck(
      [['EMBEDDER'], ['VOYAGE_API_KEY'], ['OPENAI_API_KEY'], ['OLLAMA_BASE_URL'], ['COHERE_API_KEY']],
      (input) => {
        switch (input.EMBEDDER) {
          case 'voyage':  return !!input.VOYAGE_API_KEY;
          case 'openai':  return !!input.OPENAI_API_KEY;
          case 'cohere':  return !!input.COHERE_API_KEY;
          case 'ollama':  return !!input.OLLAMA_BASE_URL;
        }
      },
      'Selected EMBEDDER requires its corresponding API key / base URL',
    ),
    ['EMBEDDER'],
  ),
);

export type Environment = v.InferOutput<typeof Schema>;
export const environment = parseEnv(Schema, process.env, '@market/api');
```

**`apps/mcp/src/environment.ts`:**

```ts
import * as v from 'valibot';

const Schema = v.object({
  NODE_ENV:     v.picklist(['development', 'production', 'test'] as const),
  API_URL:      v.pipe(v.string(), v.url()),
  API_TOKEN:    v.pipe(v.string(), v.minLength(8)),
  MCP_HTTP:     v.optional(v.picklist(['0', '1'] as const), '0'),
  MCP_PORT:     v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), '8787'),
  MCP_TLS_CERT: v.optional(v.string()),
  MCP_TLS_KEY:  v.optional(v.string()),
});

export type Environment = v.InferOutput<typeof Schema>;
export const environment = parseEnv(Schema, process.env, '@market/mcp');
```

**`apps/web/src/environment.ts`:**

```ts
import * as v from 'valibot';

const Schema = v.object({
  VITE_API_URL:  v.pipe(v.string(), v.url()),
  VITE_APP_NAME: v.optional(v.string(), 'Market'),
});

export type Environment = v.InferOutput<typeof Schema>;
export const environment = parseEnv(Schema, import.meta.env, '@market/web');
```

**ESLint rule enforcing the pattern** (`packages/config/eslint/node.js`):

```js
rules: {
  'no-restricted-properties': ['error', {
    object: 'process',
    property: 'env',
    message: 'Read env via ./environment.ts, not process.env directly.',
  }],
}
```

`environment.ts` itself is allowed to break this rule via an inline disable.

### 5.9 Docker

**`docker-compose.yml`** (dev default = Postgres only; `--profile full` = everything containerized):

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: market
      POSTGRES_PASSWORD: market
      POSTGRES_DB: market
    ports: ["5432:5432"]
    volumes: [postgres-data:/var/lib/postgresql/data]

  api:
    profiles: ["full"]
    build: { context: ., target: api }
    depends_on: [postgres]
    environment:
      DATABASE_URL: postgres://market:market@postgres:5432/market
    ports: ["3000:3000"]

  mcp:
    profiles: ["full"]
    build: { context: ., target: mcp }
    depends_on: [api]
    environment:
      API_URL: http://api:3000
      API_TOKEN: devtoken
      MCP_HTTP: "1"
      MCP_PORT: "8787"
    ports: ["8787:8787"]

volumes:
  postgres-data:
```

**Multi-stage Dockerfile (api + mcp targets via `turbo prune`):**

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @market/api @market/mcp --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@market/api --filter=@market/mcp

FROM base AS api
WORKDIR /app
COPY --from=installer /app .
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]

FROM base AS mcp
WORKDIR /app
COPY --from=installer /app .
WORKDIR /app/apps/mcp
CMD ["node", "dist/server.js"]
```

### 5.10 `.env.example` (root, shared dev surface)

```
# --- db ---
DATABASE_URL=postgres://market:market@localhost:5432/market

# --- api ---
NODE_ENV=development
API_PORT=3000
API_TOKEN=devtoken
EMBEDDING_WORKER=on
ENABLED_VENDORS=wolt

# --- mcp ---
API_URL=http://localhost:3000
MCP_HTTP=0
MCP_PORT=8787

# --- embedder ---
EMBEDDER=openai              # voyage | openai | ollama | cohere
VOYAGE_API_KEY=
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
COHERE_API_KEY=

# --- vendors / wolt ---
WOLT_LAT=41.7151
WOLT_LON=44.8271

# --- web (Vite) ---
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=Market
```

---

## 6. Port Plan (existing code → monorepo)

Step-by-step mapping of the current `src/*` tree to the new layout. This is *not* the implementation plan — that is produced by the `writing-plans` skill from this spec.

### 6.1 File mapping

| Current file | New location | Notes |
|---|---|---|
| `src/server.ts` | `apps/mcp/src/server.ts` | Gutted: db/services removed. Each tool becomes a ~6-line HTTP wrapper calling `apps/api`. Stdio + streamable-HTTP transports preserved. |
| `src/server.ts` (tool logic) | `apps/api/src/routes/*.ts` | Tool bodies (search, refresh, shopping list) move to Fastify route handlers. |
| `src/config.ts` | Split: vendor config → `packages/vendors/wolt/src/config.ts`; app config → `apps/api/src/environment.ts` + `apps/mcp/src/environment.ts`. |
| `src/wolt/client.ts` | `packages/vendors/wolt/src/client.ts` | Unchanged HTTP logic. Wrapped in `createWoltVendor(): Vendor` factory. |
| `src/wolt/client.ts` types (`AssortmentCategory`, `CategoryPage`, etc.) | `packages/vendors/core/src/types.ts` | Promoted to shared types. |
| `src/db/schema.ts` (sqlite) | **deleted** | Replaced by `apps/api/src/db/schema.ts` (Drizzle/Postgres, §4). |
| `src/db/store.ts` | `apps/api/src/services/catalog.ts` | Rewritten against Drizzle. Methods map 1:1; `searchItems` becomes hybrid. |
| `src/services/shoppingList.ts` | `apps/api/src/services/shopping-list.ts` | Ported to drizzle queries. Interface unchanged. |
| `src/crawler/crawl.ts` | `apps/api/src/crawler/crawl.ts` + CLI bin | Orchestration in api; fetching in `@market/vendor-wolt`. Runnable via `pnpm crawl`. |
| `wolt.sqlite` | **deleted** | Re-crawled into Postgres. |
| `Dockerfile` | Replaced | Multi-stage Turborepo Dockerfile (§5.9). |
| `docker-compose.yml` | Replaced | Adds `pgvector/pgvector:pg16` (§5.9). |
| `tailscale-serve.json` | Kept at root | Still relevant if mcp is exposed over Tailscale. |
| `.env.example` | Expanded | New vars (§5.10). |
| `.gitignore` | Expanded | Adds `dist/`, `.turbo/`, `node_modules/`, `.env.local`, `apps/api/drizzle/meta/`. |
| `README.md` | Rewritten | Monorepo + multi-vendor + pgvector story. |
| `package.json` (root) | Replaced | Workspace root (§5.1). Old deps move to packages that need them. |
| `tsconfig.json` (root) | Replaced | References children; per-package extends `@market/config/tsconfig/*`. |

### 6.2 New files (no existing counterpart)

- `apps/api/src/server.ts` — Fastify bootstrap, routes, worker startup, graceful shutdown
- `apps/api/src/routes/{venues,catalog,shopping-list,admin}.ts`
- `apps/api/src/db/client.ts` — Drizzle client factory
- `apps/api/drizzle/` — generated migrations
- `apps/api/src/embeddings/{embedder,openai,voyage,ollama,cohere}.ts`
- `apps/api/src/workers/embedding-worker.ts`
- `apps/api/src/vendor-registry.ts` — wires enabled vendors from env
- `apps/web/src/*` — Vite + React + TanStack Router scaffold, initial catalog browser page
- `apps/mcp/src/api-client.ts` — typed fetch wrapper importing valibot schemas from `@market/contracts`
- `packages/contracts/src/*` — valibot schemas for every api endpoint + inferred TS types
- `packages/ui/src/*` — shadcn components (button, input, card, command, sonner, etc.)
- `packages/vendors/core/src/{vendor,types,registry}.ts`
- `packages/vendors/{glovo,bolt-food,europroduct,goodwill}/src/client.ts` — stubs implementing `Vendor`, throwing `NotImplemented` on every method

### 6.3 Ordering (becomes the implementation plan)

1. Scaffold workspace: root config, `packages/config`, `pnpm-workspace.yaml`, `turbo.json`.
2. Create `packages/vendors/core` (types + interface).
3. Create `packages/vendors/wolt` (port `src/wolt/client.ts`, wrap as `Vendor`).
4. Create `packages/vendors/{glovo,bolt-food,europroduct,goodwill}` stubs.
5. Create `packages/contracts` (valibot schemas for api surface).
6. Scaffold `apps/api`: `environment.ts`, Fastify, Drizzle, migrations, routes, embedding worker, vendor registry, crawler CLI; port `db/store.ts` and `services/shoppingList.ts`.
7. Scaffold `packages/ui` with shadcn init + starter set (button, input, card, command, sonner wiring).
8. Scaffold `apps/web`: `environment.ts`, Vite + React + Tailwind + TanStack Router/Query + initial catalog search page wired to api via contracts.
9. Scaffold `apps/mcp`: `environment.ts`, gut `server.ts`, replace tool bodies with api-client calls, rename tools to `market_*`, preserve stdio + streamable-HTTP transports.
10. New `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`.
11. Delete obsolete root files (`src/`, `wolt.sqlite`, old `package.json` deps, old `tsconfig.json`).
12. End-to-end verification: `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm check:circular`.
13. Smoke test: `pnpm db:migrate`, `pnpm crawl` (single venue), `pnpm --filter @market/api dev`, hit `/v1/catalog/search` via curl, hit via mcp stdio.

### 6.4 Non-goals (v1 scope fence)

- No new features beyond the existing tool semantics + embeddings + hybrid search.
- No UI beyond a working catalog search page in `apps/web`.
- Non-wolt vendors are stubs that throw `NotImplemented`. Adding a real vendor later is a one-package PR.
- No new tests introduced for the scaffold (tests deferred per user decision).
- Crawler remains in-process inside `apps/api` as a CLI + cron job, not a separate deployable.

---

## 7. Open Questions / Deferred Decisions

- **Scheduled crawl cadence** — initially on-demand via `pnpm crawl`; production cron cadence TBD post-MVP.
- **Production authentication** — `API_TOKEN` bearer is sufficient for v1. Proper auth (JWT, OAuth) deferred.
- **Rate limiting on api endpoints** — none in v1; add Fastify rate limiter if abuse surfaces.
- **Observability** — stdout logs only in v1; OpenTelemetry deferred.
- **Multi-region support** — coordinates hard-coded to Tbilisi defaults in v1.
- **`halfvec` migration** — revisit only if DB exceeds ~40 GB.
- **Product clustering via GTIN** — schema supports it (`items.gtin` indexed), implementation deferred.
