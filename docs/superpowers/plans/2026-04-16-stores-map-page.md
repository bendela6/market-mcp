# Stores Map Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/stores/map` page to the web app with a Mapbox GL map and a synchronized filterable sidebar list, backed by a new lightweight store-locations API endpoint.

**Architecture:** A new lazy-loaded React route renders a split layout (filter+list sidebar on the left, full-height Mapbox map on the right). A new `POST /v1/stores/map/query` endpoint returns only the marker fields (id, slug, name, vendor, location, …) for stores with a known `lat`/`lon`, applying the same filters as the existing `/v1/stores/query`. URL search params drive filters and selection; viewport bbox is internal map state.

**Tech Stack:** TypeScript, Fastify, Drizzle, valibot, React 18, tanstack-router, tanstack-query, Mapbox GL, Tailwind CSS, shadcn-style UI components.

**Spec:** [`docs/superpowers/specs/2026-04-16-stores-map-page-design.md`](../specs/2026-04-16-stores-map-page-design.md)

---

## File Map

**Created:**
- `apps/web/src/pages/stores/map.tsx` — page component (default export for lazy import)
- `apps/web/src/features/stores/store-filters.tsx` — shared filter controls (search/vendor/productLine/online)
- `apps/web/src/features/stores/map/store-map-sidebar.tsx` — filter block + count + scrollable list + footnote
- `apps/web/src/features/stores/map/store-map.tsx` — Mapbox container component
- `apps/web/src/features/stores/map/store-map-markers.ts` — clustered GeoJSON source/layer hook
- `apps/web/src/features/stores/map/store-map-popup.tsx` — popup content
- `apps/web/src/features/stores/map/store-map-mobile-toggle.tsx` — mobile segmented toggle + filters bottom sheet
- `apps/web/src/features/stores/map/map-page-skeleton.tsx` — Suspense fallback
- `apps/web/src/features/stores/map/store-map-row.tsx` — compact row for the sidebar list
- `apps/web/src/hooks/use-stores-map-query.ts` — React Query hook over the new endpoint

**Modified:**
- `packages/contracts/src/stores.ts` — add `StoreMapPointSchema`, `StoreMapQueryBodySchema`, `StoreMapQueryResponseSchema` and types
- `packages/contracts/src/routes.ts` — add `ROUTES.stores.map`
- `apps/api/src/services/stores.ts` — add `queryForMap()` method
- `apps/api/src/routes/stores.ts` — add `POST /v1/stores/map/query` route
- `apps/web/package.json` — add `mapbox-gl` + `@types/mapbox-gl`
- `apps/web/src/environment.ts` — add `VITE_MAPBOX_TOKEN`, `VITE_DEFAULT_LAT`, `VITE_DEFAULT_LON`
- `apps/web/src/api-client.ts` — add `api.queryStoresMap()`
- `apps/web/src/search-schemas.ts` — add `storeMapSearchSchema` + types
- `apps/web/src/router.ts` — add lazy `/stores/map` route
- `apps/web/src/layout/root-layout.tsx` — add "Map" nav entry
- `.env.example` — add new env var placeholders

---

## Phase 1 — Contracts (shared types)

### Task 1: Add map endpoint contract schemas

**Files:**
- Modify: `packages/contracts/src/stores.ts`

- [ ] **Step 1: Add the schemas at the end of `stores.ts`**

Append after the existing `RefreshAssortmentResponseSchema`:

```ts
// ---------- Map endpoint ----------

export const StoreMapPointSchema = v.object({
  id:          v.string(),
  slug:        v.string(),
  name:        v.string(),
  vendor:      VendorIdSchema,
  vendorSlug:  v.string(),
  productLine: v.optional(ProductLineSchema),
  online:      v.optional(v.boolean()),
  location:    CoordinatesSchema,
});

export const StoreMapQueryBodySchema = v.object({
  q:           v.optional(v.string()),
  vendor:      v.optional(VendorIdSchema),
  productLine: v.optional(ProductLineSchema),
  online:      v.optional(v.boolean()),
  /** Optional viewport filter: [west, south, east, north] in degrees. */
  bbox:        v.optional(v.tuple([v.number(), v.number(), v.number(), v.number()])),
  /** Hard safety cap. Default 5000, max 10000. */
  limit:       v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000))),
});

export const StoreMapQueryResponseSchema = v.object({
  data: v.array(StoreMapPointSchema),
  meta: v.object({
    total:                      v.number(),
    truncated:                  v.boolean(),
    totalWithoutLocationFilter: v.number(),
  }),
});

export type StoreMapPoint         = v.InferOutput<typeof StoreMapPointSchema>;
export type StoreMapQueryBody     = v.InferOutput<typeof StoreMapQueryBodySchema>;
export type StoreMapQueryResponse = v.InferOutput<typeof StoreMapQueryResponseSchema>;
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/contracts typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/stores.ts
git commit -m "feat(contracts): add stores map endpoint schemas

Add StoreMapPoint, StoreMapQueryBody, and StoreMapQueryResponse for the
new lightweight POST /v1/stores/map/query endpoint that powers the map
page. Returns only marker fields plus optional bbox filter."
```

---

### Task 2: Add map route constant

**Files:**
- Modify: `packages/contracts/src/routes.ts`

- [ ] **Step 1: Add `map` to `ROUTES.stores`**

Edit the `stores` block:

```ts
stores: {
  query:             '/v1/stores/query',
  map:               '/v1/stores/map/query',
  get:               (id: string) => `/v1/stores/${id}`,
  refreshAssortment: (id: string) => `/v1/stores/${id}/refresh-assortment`,
},
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/contracts typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/routes.ts
git commit -m "feat(contracts): add ROUTES.stores.map constant"
```

---

## Phase 2 — Backend (api)

### Task 3: Add `queryForMap` service method

**Files:**
- Modify: `apps/api/src/services/stores.ts`

- [ ] **Step 1: Extend the `StoresService` interface**

In the `StoresService` interface (around line 9), add a new method signature:

```ts
import type { StoreQueryBody, Store, StoreMapQueryBody, StoreMapPoint } from '@market/contracts';

export interface StoresService {
  query(body: StoreQueryBody): Promise<{ data: Store[]; total: number }>;
  queryForMap(body: StoreMapQueryBody): Promise<{
    data: StoreMapPoint[];
    total: number;
    truncated: boolean;
    totalWithoutLocationFilter: number;
  }>;
  getByIdOrSlug(idOrSlug: string): Promise<StoreRow | undefined>;
}
```

- [ ] **Step 2: Implement `queryForMap` on the returned object**

Inside `createStoresService`, after `query()` and before `getByIdOrSlug`, add:

```ts
async queryForMap(body) {
  const filterConds = [];
  if (body.vendor)       filterConds.push(eq(stores.vendor, body.vendor));
  if (body.productLine)  filterConds.push(eq(stores.productLine, body.productLine));
  if (body.online != null) filterConds.push(eq(stores.online, body.online));
  if (body.q)            filterConds.push(ilike(stores.name, `%${body.q}%`));
  const filterWhere = filterConds.length ? and(...filterConds) : undefined;

  // location-required predicate: lat and lon present and parseable as float
  const hasLocation = sql`${stores.lat} IS NOT NULL AND ${stores.lon} IS NOT NULL
                          AND ${stores.lat} <> '' AND ${stores.lon} <> ''`;

  const conds = [hasLocation];
  if (filterWhere) conds.push(filterWhere);
  if (body.bbox) {
    const [w, s, e, n] = body.bbox;
    conds.push(sql`NULLIF(${stores.lat}, '')::float BETWEEN ${s} AND ${n}`);
    conds.push(sql`NULLIF(${stores.lon}, '')::float BETWEEN ${w} AND ${e}`);
  }
  const where = and(...conds);

  const limit = body.limit ?? 5000;

  // Fetch one extra row to detect truncation
  const rows = await db.select({
    id:          stores.id,
    slug:        stores.slug,
    name:        stores.name,
    vendor:      stores.vendor,
    vendorSlug:  stores.vendorSlug,
    productLine: stores.productLine,
    online:      stores.online,
    lat:         stores.lat,
    lon:         stores.lon,
  })
    .from(stores)
    .where(where)
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const trimmed = truncated ? rows.slice(0, limit) : rows;

  const data: StoreMapPoint[] = trimmed.map((r) => ({
    id:          r.id,
    slug:        r.slug,
    name:        r.name,
    vendor:      r.vendor,
    vendorSlug:  r.vendorSlug,
    productLine: r.productLine ?? undefined,
    online:      r.online,
    location:    { lat: Number(r.lat), lon: Number(r.lon) },
  }));

  // Count without location filter (filters only)
  const [allMatchingRow] = await db.select({ n: count() })
    .from(stores)
    .where(filterWhere);

  return {
    data,
    total: data.length,
    truncated,
    totalWithoutLocationFilter: Number(allMatchingRow?.n ?? 0),
  };
},
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm --filter @market/api typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/stores.ts
git commit -m "feat(api/stores): add queryForMap service method

Lightweight query for the map page: returns only marker fields, only for
stores with a known location, with optional bbox viewport filter and a
truncation flag. Computes the locatable-vs-total count for the sidebar
'N of M' footnote."
```

---

### Task 4: Add the new route handler

**Files:**
- Modify: `apps/api/src/routes/stores.ts`

- [ ] **Step 1: Add the new imports at the top**

Update the `@market/contracts` import block to include the new schemas:

```ts
import {
  IdOrSlugParamsSchema,
  ROUTES,
  StoreMapQueryBodySchema,
  StoreQueryBodySchema,
  type GetStoreResponse,
  type RefreshAssortmentResponse,
  type StoreMapQueryResponse,
  type StoreQueryResponse,
} from '@market/contracts';
```

- [ ] **Step 2: Register the new route**

After the existing `app.post(ROUTES.stores.query, …)` handler and before `app.get('/v1/stores/:idOrSlug', …)`, add:

```ts
app.post(ROUTES.stores.map, async (request, reply) => {
  const parsed = v.safeParse(StoreMapQueryBodySchema, request.body);
  if (!parsed.success) {
    reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
    return;
  }
  const result = await storesSvc.queryForMap(parsed.output);
  const response: StoreMapQueryResponse = {
    data: result.data,
    meta: {
      total: result.total,
      truncated: result.truncated,
      totalWithoutLocationFilter: result.totalWithoutLocationFilter,
    },
  };
  return response;
});
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm --filter @market/api typecheck`
Expected: no errors.

- [ ] **Step 4: Smoke-test the endpoint**

Start the api dev server in a background terminal: `pnpm --filter @market/api dev`

Then in another terminal:

```bash
curl -s -X POST http://localhost:3000/v1/stores/map/query \
  -H 'content-type: application/json' \
  -d '{}' | head -c 1000
```

Expected: a JSON response with `data: [...]` (some stores) and `meta: { total, truncated: false, totalWithoutLocationFilter }`. Stop the dev server (Ctrl+C) when done.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/stores.ts
git commit -m "feat(api/stores): expose POST /v1/stores/map/query route

Wires the new queryForMap service method as a Fastify route returning
the StoreMapQueryResponse contract envelope."
```

---

## Phase 3 — Web env, deps, and shared bits

### Task 5: Add `mapbox-gl` dependency

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the package**

```bash
pnpm --filter @market/web add mapbox-gl@^3
pnpm --filter @market/web add -D @types/mapbox-gl@^3
```

- [ ] **Step 2: Verify the install succeeded**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add mapbox-gl dependency"
```

---

### Task 6: Add web env vars

**Files:**
- Modify: `apps/web/src/environment.ts`
- Modify: `.env.example`

- [ ] **Step 1: Extend the web env schema**

Replace the contents of `apps/web/src/environment.ts` with:

```ts
import * as v from 'valibot';
import { parseEnv } from '@market/env';

const Schema = v.object({
  VITE_API_URL:       v.pipe(v.string(), v.url()),
  VITE_APP_NAME:      v.optional(v.string(), 'Market'),
  VITE_MAPBOX_TOKEN:  v.optional(v.string(), ''),
  VITE_DEFAULT_LAT:   v.optional(v.pipe(v.string(), v.transform((s) => Number(s)), v.number()), '41.7151'),
  VITE_DEFAULT_LON:   v.optional(v.pipe(v.string(), v.transform((s) => Number(s)), v.number()), '44.8271'),
});

export type Environment = v.InferOutput<typeof Schema>;

export const environment = parseEnv({
  schema: Schema,
  source: import.meta.env,
  label: '@market/web',
});
```

(The defaults match the existing `WOLT_LAT` / `WOLT_LON` city center.)

- [ ] **Step 2: Update `.env.example`**

Replace the `# --- web (Vite) ---` block at the bottom of `.env.example` with:

```
# --- web (Vite) ---
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=Market
# Mapbox public token (pk.…). Required for /stores/map.
# Get one at https://account.mapbox.com/access-tokens/
VITE_MAPBOX_TOKEN=
# Default map center (Tbilisi)
VITE_DEFAULT_LAT=41.7151
VITE_DEFAULT_LON=44.8271
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/environment.ts .env.example
git commit -m "feat(web/env): add VITE_MAPBOX_TOKEN and default map center

VITE_MAPBOX_TOKEN is required for the /stores/map page; absent token
shows a friendly inline message and the rest of the page still works.
VITE_DEFAULT_LAT/LON drive the initial map view."
```

---

### Task 7: Add `storeMapSearchSchema`

**Files:**
- Modify: `apps/web/src/search-schemas.ts`

- [ ] **Step 1: Add the new schema and exporter**

Append after the existing `PlanListSchema` block:

```ts
const StoreMapSchema = v.object({
  q:           v.optional(v.string()),
  vendor:      v.optional(VendorId),
  productLine: v.optional(ProductLine),
  online:      v.optional(v.boolean()),
  selected:    v.optional(v.string()),
  view:        v.optional(v.picklist(['map', 'list'] as const)),
});

export type StoreMapSearch = v.InferOutput<typeof StoreMapSchema>;

export const storeMapSearchSchema = (input: Record<string, unknown>): StoreMapSearch =>
  v.parse(StoreMapSchema, input);
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/search-schemas.ts
git commit -m "feat(web): add storeMapSearchSchema for /stores/map URL state

Filters mirror the list page; selected (id) and view (mobile map|list)
are bookmarkable. bbox is intentionally NOT in the URL."
```

---

### Task 8: Add `api.queryStoresMap` client method

**Files:**
- Modify: `apps/web/src/api-client.ts`

- [ ] **Step 1: Add the new types to the import block**

Update the `@market/contracts` type import block to include:

```ts
import type {
  AddPlanLineBody, CatalogStatsResponse, ComputePlanResponse, CreatePlanBody,
  CreateUserBody, GetItemResponse, GetStoreResponse, ItemQueryBody, ItemQueryResponse,
  Plan, PlanDetail, PlanQueryBody, PlanQueryResponse, RefreshAssortmentResponse,
  StoreMapQueryBody, StoreMapQueryResponse,
  StoreQueryBody, StoreQueryResponse, UpdatePlanBody, UpdatePlanLineBody, User,
} from '@market/contracts';
```

- [ ] **Step 2: Add the api method**

Inside the `api` object, after the existing `refreshStoreAssortment` line and before the `// catalog` comment, add:

```ts
  queryStoresMap: (body: StoreMapQueryBody) =>
    raw<StoreMapQueryResponse>(ROUTES.stores.map, { method: 'POST', body: JSON.stringify(body) }),
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api-client.ts
git commit -m "feat(web/api-client): add queryStoresMap"
```

---

### Task 9: Add `useStoresMapQuery` hook

**Files:**
- Create: `apps/web/src/hooks/use-stores-map-query.ts`

- [ ] **Step 1: Create the file**

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { StoreMapQueryBody } from '@market/contracts';
import { api } from '../api-client.js';

export function useStoresMapQuery(body: StoreMapQueryBody) {
  return useQuery({
    queryKey: ['stores-map', body],
    queryFn: () => api.queryStoresMap(body),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-stores-map-query.ts
git commit -m "feat(web/hooks): add useStoresMapQuery

Wraps queryStoresMap with React Query. staleTime keeps re-renders cheap;
keepPreviousData prevents the map blanking during filter changes."
```

---

## Phase 4 — Shared filter component

### Task 10: Extract `StoreFilters` (URL-agnostic)

**Files:**
- Create: `apps/web/src/features/stores/store-filters.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@market/ui';
import type { ProductLine, VendorId } from '@market/contracts';

const VENDORS: Array<{ value: VendorId; label: string }> = [
  { value: 'wolt',        label: 'Wolt' },
  { value: 'glovo',       label: 'Glovo' },
  { value: 'bolt-food',   label: 'Bolt Food' },
  { value: 'europroduct', label: 'Europroduct' },
  { value: 'goodwill',    label: 'Goodwill' },
];

const PRODUCT_LINES: Array<{ value: ProductLine; label: string }> = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'store',      label: 'Store' },
  { value: 'grocery',    label: 'Grocery' },
  { value: 'pharmacy',   label: 'Pharmacy' },
  { value: 'other',      label: 'Other' },
];

const ANY = '__any__';

export interface StoreFiltersValue {
  q?:           string;
  vendor?:      VendorId;
  productLine?: ProductLine;
  online?:      boolean;
}

interface Props {
  value:    StoreFiltersValue;
  onChange: (next: StoreFiltersValue) => void;
  /** Debounce ms for the search input. Default 300. */
  searchDebounceMs?: number;
}

export function StoreFilters({ value, onChange, searchDebounceMs = 300 }: Props) {
  const [qLocal, setQLocal] = useState(value.q ?? '');

  // Sync external value changes (e.g., URL navigation) into local input
  useEffect(() => { setQLocal(value.q ?? ''); }, [value.q]);

  // Debounced commit of the search input back up to the parent
  useEffect(() => {
    const next = qLocal.trim() || undefined;
    if (next === value.q) return;
    const t = setTimeout(() => onChange({ ...value, q: next }), searchDebounceMs);
    return () => clearTimeout(t);
  }, [qLocal, value, onChange, searchDebounceMs]);

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search stores…"
        value={qLocal}
        onChange={(e) => setQLocal(e.target.value)}
        aria-label="Search stores"
      />

      <Select
        value={value.vendor ?? ANY}
        onValueChange={(v) =>
          onChange({ ...value, vendor: v === ANY ? undefined : (v as VendorId) })
        }
      >
        <SelectTrigger><SelectValue placeholder="Any vendor" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any vendor</SelectItem>
          {VENDORS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.productLine ?? ANY}
        onValueChange={(v) =>
          onChange({ ...value, productLine: v === ANY ? undefined : (v as ProductLine) })
        }
      >
        <SelectTrigger><SelectValue placeholder="Any type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any type</SelectItem>
          {PRODUCT_LINES.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={value.online === true}
          onChange={(e) => onChange({ ...value, online: e.target.checked ? true : undefined })}
        />
        Online only
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/stores/store-filters.tsx
git commit -m "feat(web/stores): add shared StoreFilters component

URL-agnostic value+onChange API. Search input is locally controlled and
debounced 300ms before bubbling up so filter URL changes don't spam the
history. Reusable by both the list and map pages."
```

---

## Phase 5 — Map page UI

### Task 11: Add the Mapbox container component

**Files:**
- Create: `apps/web/src/features/stores/map/store-map.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { StoreMapPoint } from '@market/contracts';
import { environment } from '../../../environment.js';
import { useStoreMapMarkers } from './store-map-markers.js';

interface Props {
  points:        StoreMapPoint[];
  selectedId:    string | undefined;
  onSelect:      (id: string | undefined) => void;
  /** Approximate left padding (in px) when flying to a point so the popup isn't covered. */
  sidebarPaddingPx?: number;
}

export function StoreMap({ points, selectedId, onSelect, sidebarPaddingPx = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const initialCenter = useMemo<[number, number]>(
    () => [environment.VITE_DEFAULT_LON, environment.VITE_DEFAULT_LAT],
    [],
  );

  // Token check — surface a friendly message if missing.
  const hasToken = environment.VITE_MAPBOX_TOKEN.length > 0;

  // Initialize the map exactly once.
  useEffect(() => {
    if (!hasToken || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = environment.VITE_MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: initialCenter,
      zoom: 11,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [hasToken, initialCenter]);

  // Resize when the container dimensions change (window resize, sidebar collapse, etc.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handle = () => map.resize();
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  // Sync points + selection to the map.
  useStoreMapMarkers({
    map: mapRef.current,
    points,
    selectedId,
    onSelect,
    sidebarPaddingPx,
  });

  if (!hasToken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-center text-sm text-muted-foreground">
        <div className="max-w-sm space-y-2 px-4">
          <p className="font-medium text-foreground">Map view requires a Mapbox token.</p>
          <p>
            Set <code className="rounded bg-background px-1">VITE_MAPBOX_TOKEN</code> in your env.
            See <code className="rounded bg-background px-1">.env.example</code> for details.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" aria-label="Map of stores" role="application" />;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: error — `useStoreMapMarkers` doesn't exist yet. We'll add it next.

- [ ] **Step 3: Commit (skip if typecheck fails for the expected reason)**

Defer the commit until Task 12 is in.

---

### Task 12: Add `useStoreMapMarkers` hook

**Files:**
- Create: `apps/web/src/features/stores/map/store-map-markers.ts`

- [ ] **Step 1: Create the file**

```ts
import { useEffect, useRef } from 'react';
import type mapboxgl from 'mapbox-gl';
import type { GeoJSONSource } from 'mapbox-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { StoreMapPoint } from '@market/contracts';

const SOURCE_ID = 'stores';
const CLUSTERS_LAYER = 'stores-clusters';
const CLUSTER_COUNT_LAYER = 'stores-cluster-count';
const POINT_LAYER = 'stores-points';

interface FeatureProps {
  id:     string;
  vendor: string;
  name:   string;
}

function pointsToGeoJSON(points: StoreMapPoint[]): FeatureCollection<Point, FeatureProps> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      id:   p.id,
      geometry: { type: 'Point', coordinates: [p.location.lon, p.location.lat] },
      properties: { id: p.id, vendor: p.vendor, name: p.name },
    })),
  };
}

interface Args {
  map:              mapboxgl.Map | null;
  points:           StoreMapPoint[];
  selectedId:       string | undefined;
  onSelect:         (id: string | undefined) => void;
  sidebarPaddingPx: number;
}

export function useStoreMapMarkers({ map, points, selectedId, onSelect, sidebarPaddingPx }: Args) {
  const layersInitialized = useRef(false);

  // Add source + layers once the map style is ready.
  useEffect(() => {
    if (!map) return;

    const setup = () => {
      if (layersInitialized.current || map.getSource(SOURCE_ID)) return;

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      map.addLayer({
        id: CLUSTERS_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#94a3b8', 25,    // < 25  : slate-400
            '#64748b', 100,   // < 100 : slate-500
            '#334155',        // 100+  : slate-700
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            16, 25,
            22, 100,
            28,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match', ['get', 'vendor'],
            'wolt',        '#00C2E8',
            'glovo',       '#FFC244',
            'bolt-food',   '#34D186',
            'europroduct', '#7C3AED',
            'goodwill',    '#F97316',
            /* default */  '#64748b',
          ],
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 9,
            6,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      // Cluster click → zoom in
      map.on('click', CLUSTERS_LAYER, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.['cluster_id'] as number | undefined;
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        if (clusterId == null) return;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          const geom = feature.geometry as Point;
          map.easeTo({ center: geom.coordinates as [number, number], zoom });
        });
      });

      // Point click → select
      map.on('click', POINT_LAYER, (e) => {
        const id = e.features?.[0]?.properties?.['id'] as string | undefined;
        if (id) onSelect(id);
      });

      // Background click (not on a point/cluster) → clear selection
      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [POINT_LAYER, CLUSTERS_LAYER],
        });
        if (hits.length === 0) onSelect(undefined);
      });

      // Cursor styling
      for (const layer of [CLUSTERS_LAYER, POINT_LAYER]) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }

      layersInitialized.current = true;
    };

    if (map.isStyleLoaded()) setup();
    else map.once('load', setup);
  }, [map, onSelect]);

  // Push current `points` into the source whenever they change.
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData(pointsToGeoJSON(points));
    };
    if (map.isStyleLoaded() && layersInitialized.current) apply();
    else map.once('idle', apply);
  }, [map, points]);

  // Sync selected feature-state + flyTo when selectedId changes.
  const prevSelectedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      const prev = prevSelectedRef.current;
      if (prev) {
        map.setFeatureState({ source: SOURCE_ID, id: prev }, { selected: false });
      }
      if (selectedId) {
        map.setFeatureState({ source: SOURCE_ID, id: selectedId }, { selected: true });
        const point = points.find((p) => p.id === selectedId);
        if (point) {
          map.easeTo({
            center: [point.location.lon, point.location.lat],
            zoom: Math.max(map.getZoom(), 13),
            padding: { left: sidebarPaddingPx, top: 0, right: 0, bottom: 0 },
          });
        }
      }
      prevSelectedRef.current = selectedId;
    };
    if (map.isStyleLoaded() && layersInitialized.current) apply();
    else map.once('idle', apply);
  }, [map, selectedId, points, sidebarPaddingPx]);
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors. (`store-map.tsx` from Task 11 should now compile too.)

- [ ] **Step 3: Commit both files**

```bash
git add apps/web/src/features/stores/map/store-map.tsx apps/web/src/features/stores/map/store-map-markers.ts
git commit -m "feat(web/stores/map): add Mapbox container and clustered marker source

StoreMap renders a Mapbox GL canvas (or a friendly token-missing message)
and delegates point/cluster rendering + interactions to a useStoreMapMarkers
hook backed by a single clustered GeoJSON source with three layers."
```

---

### Task 13: Add the popup component (rendered via tanstack `<Link>`)

**Files:**
- Create: `apps/web/src/features/stores/map/store-map-popup.tsx`

> The popup is rendered via React (mounted in a portal we control) instead of `mapboxgl.Popup`'s string HTML, so the "View store" link uses tanstack-router properly. We position it as an absolutely-positioned overlay aligned to the selected pin's projected pixel coordinates, recomputed on map `move`.

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import { Link } from '@tanstack/react-router';
import type { StoreMapPoint } from '@market/contracts';
import { Badge } from '@market/ui';

interface Props {
  map:    mapboxgl.Map | null;
  point:  StoreMapPoint;
  onClose: () => void;
}

export function StoreMapPopup({ map, point, onClose }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    const reposition = () => {
      const p = map.project([point.location.lon, point.location.lat]);
      setPos({ x: p.x, y: p.y });
    };
    reposition();
    map.on('move', reposition);
    map.on('zoom', reposition);
    return () => {
      map.off('move', reposition);
      map.off('zoom', reposition);
    };
  }, [map, point.location.lon, point.location.lat]);

  if (!pos) return null;

  return (
    <div
      className="pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-md border bg-background p-3 shadow-lg"
      style={{ left: pos.x, top: pos.y, width: 240 }}
      role="dialog"
      aria-label={`${point.name} details`}
    >
      <button
        type="button"
        className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
      <h3 className="pr-4 text-sm font-semibold">{point.name}</h3>
      <div className="mt-1 flex flex-wrap gap-1">
        <Badge variant="secondary">{point.vendor}</Badge>
        {point.productLine && <Badge variant="outline">{point.productLine}</Badge>}
      </div>
      <Link
        to="/stores/$idOrSlug"
        params={{ idOrSlug: point.id }}
        className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
      >
        View store →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/stores/map/store-map-popup.tsx
git commit -m "feat(web/stores/map): add StoreMapPopup overlay

React-rendered popup positioned via map.project so 'View store' uses
tanstack Link instead of inline HTML. Repositions on map move/zoom."
```

---

### Task 14: Add the sidebar list row component

**Files:**
- Create: `apps/web/src/features/stores/map/store-map-row.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useRef } from 'react';
import type { StoreMapPoint } from '@market/contracts';
import { Badge, cn } from '@market/ui';

interface Props {
  point:    StoreMapPoint;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function StoreMapRow({ point, selected, onSelect }: Props) {
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selected]);

  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={() => onSelect(point.id)}
        className={cn(
          'flex w-full flex-col items-start gap-0.5 rounded-md border-l-2 px-3 py-2 text-left text-sm',
          'transition-colors hover:bg-muted/60',
          selected
            ? 'border-primary bg-muted'
            : 'border-transparent',
        )}
        aria-current={selected || undefined}
      >
        <span className="font-medium">{point.name}</span>
        <span className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px]">{point.vendor}</Badge>
          {point.productLine && (
            <Badge variant="outline" className="text-[10px]">{point.productLine}</Badge>
          )}
          {point.online === false && (
            <Badge variant="destructive" className="text-[10px]">offline</Badge>
          )}
        </span>
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/stores/map/store-map-row.tsx
git commit -m "feat(web/stores/map): add compact StoreMapRow for the sidebar list

Auto-scrolls into view when selected; click selects the store."
```

---

### Task 15: Add the sidebar component

**Files:**
- Create: `apps/web/src/features/stores/map/store-map-sidebar.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { StoreMapPoint } from '@market/contracts';
import { Skeleton } from '@market/ui';
import { StoreFilters, type StoreFiltersValue } from '../store-filters.js';
import { StoreMapRow } from './store-map-row.js';

interface Props {
  filters:    StoreFiltersValue;
  onFilters:  (next: StoreFiltersValue) => void;
  points:     StoreMapPoint[] | undefined;
  totalAll:   number | undefined;
  isLoading:  boolean;
  error:      unknown;
  selectedId: string | undefined;
  onSelect:   (id: string) => void;
}

export function StoreMapSidebar(props: Props) {
  const { filters, onFilters, points, totalAll, isLoading, error, selectedId, onSelect } = props;

  return (
    <aside className="flex h-full w-full flex-col border-r bg-background">
      <div className="border-b p-3">
        <StoreFilters value={filters} onChange={onFilters} />
      </div>

      <div className="border-b px-3 py-2 text-xs text-muted-foreground">
        {isLoading && !points
          ? 'Loading…'
          : `${points?.length ?? 0} ${(points?.length ?? 0) === 1 ? 'store' : 'stores'}`}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <p className="p-3 text-sm text-destructive">{String(error)}</p>
        )}
        {isLoading && !points && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {points && points.length === 0 && !isLoading && (
          <p className="p-3 text-sm text-muted-foreground">No stores match these filters.</p>
        )}
        {points && points.length > 0 && (
          <ul className="space-y-1 p-2">
            {points.map((p) => (
              <StoreMapRow
                key={p.id}
                point={p}
                selected={selectedId === p.id}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>

      {points && totalAll != null && totalAll > points.length && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing {points.length} of {totalAll} stores with a known location.
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/stores/map/store-map-sidebar.tsx
git commit -m "feat(web/stores/map): add StoreMapSidebar

Composes filters, count, scrollable list, and the 'N of M' footnote.
Owns no URL/router state — pure value+callback API."
```

---

### Task 16: Add mobile toggle + filters bottom sheet

**Files:**
- Create: `apps/web/src/features/stores/map/store-map-mobile-toggle.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react';
import { cn } from '@market/ui';
import { StoreFilters, type StoreFiltersValue } from '../store-filters.js';

interface Props {
  view:      'map' | 'list';
  onView:    (view: 'map' | 'list') => void;
  filters:   StoreFiltersValue;
  onFilters: (next: StoreFiltersValue) => void;
}

export function StoreMapMobileToggle({ view, onView, filters, onFilters }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close the sheet automatically when switching to list view
  // (filters become visible inline at the top of the sidebar).
  useEffect(() => {
    if (view === 'list') setSheetOpen(false);
  }, [view]);

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b bg-background p-2 lg:hidden">
        <div role="tablist" className="inline-flex rounded-md border bg-muted p-0.5">
          {(['map', 'list'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => onView(v)}
              className={cn(
                'rounded px-3 py-1 text-sm capitalize',
                view === v ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {view === 'map' && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="rounded-md border bg-background px-3 py-1 text-sm"
          >
            Filters
          </button>
        )}
      </div>

      {sheetOpen && view === 'map' && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSheetOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-xl bg-background p-4 shadow-2xl lg:hidden">
            <div className="mx-auto mb-3 h-1 w-10 rounded bg-muted" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="text-sm font-medium text-primary"
              >
                Done
              </button>
            </div>
            <StoreFilters value={filters} onChange={onFilters} />
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/stores/map/store-map-mobile-toggle.tsx
git commit -m "feat(web/stores/map): add mobile toggle + filters bottom sheet

Segmented Map/List control plus a 'Filters' button that opens a bottom
sheet with the same StoreFilters controls. Closes on backdrop tap, Done
button, or when the user switches to list view."
```

---

### Task 17: Add the page skeleton

**Files:**
- Create: `apps/web/src/features/stores/map/map-page-skeleton.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { Skeleton } from '@market/ui';

export function MapPageSkeleton() {
  return (
    <div className="-mx-6 -my-8 flex h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <div className="flex w-full flex-col gap-2 border-b p-3 lg:w-96 lg:border-b-0 lg:border-r">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="flex-1 bg-muted" />
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/stores/map/map-page-skeleton.tsx
git commit -m "feat(web/stores/map): add MapPageSkeleton suspense fallback"
```

---

### Task 18: Add the page composer

**Files:**
- Create: `apps/web/src/pages/stores/map.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { StoreMapPoint } from '@market/contracts';
import { useStoresMapQuery } from '../../hooks/use-stores-map-query.js';
import type { StoreMapSearch } from '../../search-schemas.js';
import { StoreMap } from '../../features/stores/map/store-map.js';
import { StoreMapPopup } from '../../features/stores/map/store-map-popup.js';
import { StoreMapSidebar } from '../../features/stores/map/store-map-sidebar.js';
import { StoreMapMobileToggle } from '../../features/stores/map/store-map-mobile-toggle.js';

const SIDEBAR_PX = 384; // matches lg:w-96

export default function StoresMapPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/stores/map' }) as StoreMapSearch;

  const filters = useMemo(
    () => ({
      q:           search.q,
      vendor:      search.vendor,
      productLine: search.productLine,
      online:      search.online,
    }),
    [search.q, search.vendor, search.productLine, search.online],
  );

  const view: 'map' | 'list' = search.view ?? 'map';

  const { data, isLoading, error } = useStoresMapQuery(filters);

  const points: StoreMapPoint[] | undefined = data?.data;
  const totalAll = data?.meta.totalWithoutLocationFilter;

  const updateSearch = useCallback(
    (patch: Partial<StoreMapSearch>) => {
      void nav({ to: '/stores/map', search: { ...search, ...patch } });
    },
    [nav, search],
  );

  const onFilters = useCallback(
    (next: { q?: string; vendor?: typeof search.vendor; productLine?: typeof search.productLine; online?: boolean }) => {
      // Filter changes always clear `selected` (it might no longer match).
      updateSearch({ ...next, selected: undefined });
    },
    [updateSearch],
  );

  const onSelect = useCallback(
    (id: string | undefined) => updateSearch({ selected: id }),
    [updateSearch],
  );

  // Auto-clear selection if the selected id is not in current results.
  useEffect(() => {
    if (!points || !search.selected) return;
    if (!points.some((p) => p.id === search.selected)) {
      updateSearch({ selected: undefined });
    }
  }, [points, search.selected, updateSearch]);

  const onView = useCallback(
    (next: 'map' | 'list') => updateSearch({ view: next }),
    [updateSearch],
  );

  // Keep map ref so the popup can position relative to it.
  const [mapRef, setMapRef] = useState<import('mapbox-gl').Map | null>(null);
  const selectedPoint = points?.find((p) => p.id === search.selected);

  return (
    <div className="-mx-6 -my-8 flex h-[calc(100vh-4rem)] flex-col">
      <StoreMapMobileToggle view={view} onView={onView} filters={filters} onFilters={onFilters} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={view === 'map' ? 'hidden h-full w-full lg:flex lg:w-96' : 'flex h-full w-full lg:flex lg:w-96'}>
          <StoreMapSidebar
            filters={filters}
            onFilters={onFilters}
            points={points}
            totalAll={totalAll}
            isLoading={isLoading}
            error={error}
            selectedId={search.selected}
            onSelect={onSelect}
          />
        </div>

        <div className={view === 'list' ? 'relative hidden flex-1 lg:block' : 'relative block flex-1'}>
          <StoreMap
            points={points ?? []}
            selectedId={search.selected}
            onSelect={onSelect}
            sidebarPaddingPx={SIDEBAR_PX}
            onMapReady={setMapRef}
          />
          {selectedPoint && (
            <StoreMapPopup map={mapRef} point={selectedPoint} onClose={() => onSelect(undefined)} />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Refactor `StoreMap` to expose its map instance via an optional `onMapReady` prop**

The page composer needs the `mapboxgl.Map` reference so `StoreMapPopup` can call `map.project()`. Modify `apps/web/src/features/stores/map/store-map.tsx`:

In the `Props` interface, add:

```ts
  /** Called once the map instance is created, and again with null on unmount. */
  onMapReady?: (map: import('mapbox-gl').Map | null) => void;
```

In the function signature destructure, add `onMapReady`:

```ts
export function StoreMap({ points, selectedId, onSelect, sidebarPaddingPx = 0, onMapReady }: Props) {
```

In the init `useEffect`, after `mapRef.current = map;` add:

```ts
    onMapReady?.(map);
```

And in its cleanup, before `mapRef.current = null;` add:

```ts
      onMapReady?.(null);
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/stores/map.tsx apps/web/src/features/stores/map/store-map.tsx
git commit -m "feat(web): add /stores/map page composer

Composes filters, sidebar, map, and popup using URL search params as the
source of truth. Mobile view toggles between map and list while keeping
the same filter state. Exposes the underlying Mapbox instance via a
StoreMap onMapReady callback so the popup can project pixel coordinates."
```

---

## Phase 6 — Wire route + nav

### Task 19: Add the lazy route to the router

**Files:**
- Modify: `apps/web/src/router.ts`

- [ ] **Step 1: Add imports**

At the top of the file, add:

```ts
import { lazy, Suspense } from 'react';
import { MapPageSkeleton } from './features/stores/map/map-page-skeleton.js';
```

And update the search-schemas import to include the new one:

```ts
import {
  storeListSearchSchema, itemListSearchSchema, planListSearchSchema,
  storeMapSearchSchema,
} from './search-schemas.js';
```

- [ ] **Step 2: Add the lazy component above the routes array**

Above `const routes = [` add:

```ts
const StoresMapPage = lazy(() => import('./pages/stores/map.js'));
```

- [ ] **Step 3: Insert the new route**

In the `routes` array, immediately after the existing `'/stores/$idOrSlug'` route, add:

```ts
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/stores/map',
    component: () => (
      <Suspense fallback={<MapPageSkeleton />}>
        <StoresMapPage />
      </Suspense>
    ),
    validateSearch: storeMapSearchSchema,
  }),
```

> Note: `router.ts` will now contain JSX. Rename it to `router.tsx` (`git mv`) so the TS compiler accepts it. Update any imports referencing `./router.js` to `./router.js` still works (TS resolves the `.tsx` source automatically; the `.js` extension in the import is the bundled output convention used throughout this repo).

- [ ] **Step 4: Rename router.ts → router.tsx**

```bash
git mv apps/web/src/router.ts apps/web/src/router.tsx
```

- [ ] **Step 5: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/router.tsx
git commit -m "feat(web/router): add lazy /stores/map route

Lazy-imports the map page so the ~230 KB Mapbox bundle only loads when a
user navigates to the map. With defaultPreload: 'intent' the chunk
prefetches on nav-link hover."
```

---

### Task 20: Add the "Map" nav link

**Files:**
- Modify: `apps/web/src/layout/root-layout.tsx`

- [ ] **Step 1: Add the nav entry**

Update the `NAV` array:

```ts
const NAV = [
  { to: '/', label: 'Home' },
  { to: '/stores', label: 'Stores' },
  { to: '/stores/map', label: 'Map' },
  { to: '/products', label: 'Products' },
  { to: '/vendors', label: 'Vendors' },
  { to: '/plans', label: 'Plans' },
];
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @market/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/layout/root-layout.tsx
git commit -m "feat(web): add Map link to top nav"
```

---

## Phase 7 — Manual verification & polish

### Task 21: End-to-end manual smoke

**Files:** none (manual)

- [ ] **Step 1: Set the Mapbox token locally**

Add a real Mapbox public token to `apps/web/.env.local`:

```
VITE_MAPBOX_TOKEN=pk.your_token_here
VITE_DEFAULT_LAT=41.7151
VITE_DEFAULT_LON=44.8271
```

- [ ] **Step 2: Run both dev servers**

Terminal A: `pnpm --filter @market/api dev`
Terminal B: `pnpm --filter @market/web dev`

- [ ] **Step 3: Walk through the verification checklist**

Open the printed Vite URL in a browser. Confirm each of these:

1. Top-nav "Map" link is present and goes to `/stores/map`.
2. Map renders within ~1.5 s; pins appear; sidebar shows store count.
3. Typing in search updates pin set + list after ~300 ms.
4. Vendor / Product line / Online filters update both sides.
5. Click a pin → popup opens, URL gets `?selected=<id>`, list row highlights and scrolls into view.
6. Click a list row → map flies to pin, popup opens, URL updates.
7. Click empty map area → `selected` clears.
8. Cluster click zooms in.
9. Refresh a URL with all filters set → restores the same view.
10. Browser back/forward navigates filter/selection history.
11. Resize the window → map canvas refits with no gap.
12. Mobile breakpoint (DevTools, 390 px wide):
    - Segmented Map/List toggle visible.
    - In Map mode, "Filters" button opens bottom sheet; selecting a filter applies live.
    - Switching to List mode auto-closes the sheet and shows full-width list.
13. Temporarily blank `VITE_MAPBOX_TOKEN`, restart dev: map area shows the friendly token-required message; sidebar list still works.
14. Visit `/stores` (the existing list page) — confirm it still works unchanged.

- [ ] **Step 4: If anything failed, file the fix as a follow-up commit**

For each failure, identify the root cause, fix it in the relevant file, run `pnpm --filter @market/web typecheck`, and commit with a descriptive message.

- [ ] **Step 5: Final commit message tying off the feature** (only if no fixes were needed)

If the verification was clean and you have nothing additional staged, no commit is needed. The previous task commits already capture the work.

---

## Spec Coverage Self-Check

| Spec section | Tasks |
|---|---|
| API contract — `StoreMapPointSchema`, body, response | Task 1 |
| API route constant `ROUTES.stores.map` | Task 2 |
| Backend service `queryForMap` (filters, bbox, location predicate, truncation, totalWithoutLocationFilter) | Task 3 |
| Backend route `POST /v1/stores/map/query` | Task 4 |
| Mapbox + types dependency | Task 5 |
| Env: `VITE_MAPBOX_TOKEN`, `VITE_DEFAULT_LAT`, `VITE_DEFAULT_LON` | Task 6 |
| Web search schema `storeMapSearchSchema` | Task 7 |
| API client `queryStoresMap` | Task 8 |
| `useStoresMapQuery` hook (`staleTime`, `keepPreviousData`) | Task 9 |
| Shared `StoreFilters` component (search debounced, vendor, productLine, online) | Task 10 |
| Mapbox container + token-missing fallback + resize | Task 11 |
| Clustered GeoJSON source + 3 layers + click handlers + cursor + feature-state selection + flyTo with sidebar padding | Task 12 |
| Popup with tanstack `<Link>` + reposition on map move | Task 13 |
| Sidebar list row with selected highlight + scrollIntoView | Task 14 |
| Sidebar (filters + count + list + N-of-M footnote + loading/error/empty) | Task 15 |
| Mobile segmented toggle + filters bottom sheet (backdrop, Done, auto-close on view→list) | Task 16 |
| Suspense fallback skeleton | Task 17 |
| Page composer (URL state, selection auto-clear, mobile view, breakout from container) | Task 18 |
| Lazy route registration | Task 19 |
| Top-nav "Map" link | Task 20 |
| Manual verification checklist (12 items from spec) | Task 21 |

**Out-of-scope items confirmed not implemented:** bbox wiring to map `moveend`, dark-mode style swap, vitest setup, `StoreFilters` adopted on `/stores` list page, geocoding, custom pin shapes — all per spec's "Out of scope (v1)" list.
