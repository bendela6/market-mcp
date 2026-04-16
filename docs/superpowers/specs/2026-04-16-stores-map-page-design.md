# Stores Map Page — Design Spec

**Date:** 2026-04-16
**Status:** Approved (brainstorm); ready for plan

## Goal

Add a `/stores/map` page to `apps/web` that shows every locatable store as a pin on a Mapbox GL map alongside a synchronized, filterable sidebar list. Users can search and filter the same way they do on `/stores`, click pins or list rows to focus a store, and open the existing store detail page from a pin popup.

## Decisions

| Decision | Choice |
|---|---|
| Map library | **Mapbox GL** (no React wrapper) |
| Layout | **Split view** — sidebar (filters + list) on the left, full-height map on the right |
| Data loading | **New lightweight `POST /v1/stores/map/query` endpoint** with optional `bbox` viewport filter for future scale |
| Filters | **Search + vendor + product line + online**, matching the existing `/stores` list |
| Navigation | **New top-nav link "Map"** → `/stores/map`, independent route |
| Filter placement | **All filters live inside the sidebar**, not in a separate top bar |

## Architecture

A new `/stores/map` route is added to the tanstack-router tree. The page is **lazy-loaded** so the Mapbox bundle (~230 KB gzipped) only downloads when a user opens the map.

Data is fetched once from a new dedicated endpoint that returns only the fields needed to render pins (no `rawContent`, no addresses, no icon URLs). Filters are URL-driven via a new `storeMapSearchSchema`. Selection state (`selected=<id>`) is also in the URL, so the page is fully bookmarkable. Viewport bbox is **internal map state**, not in the URL.

### Affected packages

| Package | Change |
|---|---|
| `packages/contracts` | New `StoreMapPointSchema`, `StoreMapQueryBodySchema`, `StoreMapQueryResponseSchema`; new `ROUTES.stores.map` |
| `apps/api` | New route `POST /v1/stores/map/query`; new `storesSvc.queryForMap()` method |
| `apps/web` | New page, hook, components, route entry, nav link, env vars; new dependency `mapbox-gl` |

## API contract

### `packages/contracts/src/stores.ts`

```ts
export const StoreMapPointSchema = v.object({
  id:          v.string(),
  slug:        v.string(),
  name:        v.string(),
  vendor:      VendorIdSchema,
  vendorSlug:  v.string(),
  productLine: v.optional(ProductLineSchema),
  online:      v.optional(v.boolean()),
  location:    CoordinatesSchema, // non-optional — only locatable stores
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
    total:                       v.number(), // points returned (== data.length unless future paging)
    truncated:                   v.boolean(),
    /** Count of stores matching filters regardless of having a location. */
    totalWithoutLocationFilter:  v.number(),
  }),
});
```

Add `ROUTES.stores.map = '/v1/stores/map/query'` (POST).

### `apps/api/src/routes/stores.ts` + `services/stores.ts`

- New route: `POST /v1/stores/map/query`, parses with `StoreMapQueryBodySchema`, calls `storesSvc.queryForMap`, returns `{ data, meta }`.
- New service method `queryForMap(body)`:
  - `WHERE lat IS NOT NULL AND lon IS NOT NULL` (locatable stores only).
  - Applies the same `q`/`vendor`/`productLine`/`online` filters as the existing `query()`.
  - If `bbox = [w, s, e, n]`: adds `lat BETWEEN s AND n AND lon BETWEEN w AND e` using the same `NULLIF(...,'')::float` casts as the distance expr.
  - Selects only `id, slug, name, vendor, vendor_slug, product_line, online, lat, lon` — no `rawContent`, `address`, `currency`, or `icon_url`.
  - Enforces `limit` (default 5000, max 10000). If matching count exceeds `limit`, returns `truncated: true`.
  - Computes `totalWithoutLocationFilter` with a count query that drops the lat/lon predicate.
  - No sort (irrelevant for a map).

**Why a separate service method:** the existing `query()` returns full `Store` rows with `rawContent` and orders by expensive computed expressions. Reusing it would waste bandwidth and CPU for the map use case. A focused `queryForMap` avoids forcing either caller to compromise.

**Payload sanity check:** 3000 points × ~150 bytes ≈ 450 KB uncompressed (~50–80 KB gzipped). At 10k points: ~150–250 KB gzipped — still acceptable. Beyond that, `bbox` mode is the answer.

## Web — page, route, search schema

### Route (`apps/web/src/router.ts`)

```ts
const MapPage = lazy(() => import('./pages/stores/map.js'));

createRoute({
  getParentRoute: () => rootRoute,
  path: '/stores/map',
  component: () => (
    <Suspense fallback={<MapPageSkeleton />}>
      <MapPage />
    </Suspense>
  ),
  validateSearch: storeMapSearchSchema,
}),
```

The `Suspense` boundary covers the Mapbox + page chunk download. With `defaultPreload: 'intent'` already on the router, hovering the "Map" nav link begins prefetch.

### Nav (`apps/web/src/layout/root-layout.tsx`)

Add `{ to: '/stores/map', label: 'Map' }` to the `NAV` array, after `Stores`.

### Search schema (`apps/web/src/search-schemas.ts`)

```ts
export const storeMapSearchSchema = v.object({
  q:           v.optional(v.string()),
  vendor:      v.optional(VendorIdSchema),
  productLine: v.optional(ProductLineSchema),
  online:      v.optional(v.boolean()),
  selected:    v.optional(v.string()),                 // selected store id
  view:        v.optional(v.picklist(['map','list'])), // mobile only
});
export type StoreMapSearch = v.InferOutput<typeof storeMapSearchSchema>;
```

`bbox` deliberately omitted — viewport pans/zooms shouldn't pollute URL or history.

## Web — layout

### Desktop (`lg+`)

```
┌──────────────────────────────────────────────────────────────┐
│ header (RootLayout)                                          │
├────────────────────┬─────────────────────────────────────────┤
│ search             │                                         │
│ vendor             │                                         │
│ product line       │              Mapbox map                 │
│ online toggle      │          (pins + clusters)              │
│ ─────────────────  │                                         │
│ 123 stores         │                                         │
│ ─────────────────  │                                         │
│ StoreCard          │                                         │
│ StoreCard          │                                         │
│ ... (scrollable)   │                                         │
│ N of M located     │                                         │
└────────────────────┴─────────────────────────────────────────┘
```

- Sidebar: `w-96`, full height, internally split — non-scrolling filter block on top, then a divider, then the scrollable list, then a one-line footnote "*Showing N of M stores with a known location*".
- Map: fills remaining width, full viewport height (minus header).
- The page breaks out of `RootLayout`'s `container mx-auto px-6 py-8` via negative margins (`-mx-6 -my-8 -mb-8`) on just this page's root element. No layout-wide change.

### Mobile (`< lg`)

- Top: segmented toggle "Map / List" (sets `view=map|list` in URL; default `map`).
- **List mode:** sidebar expands to full width (filters on top, list below).
- **Map mode:** map fills viewport, with a floating "Filters" button bottom-right that opens a bottom sheet containing the same filter controls. The sheet closes on backdrop tap, on its drag handle, or on a "Done" button at the top of the sheet. Filter changes inside the sheet apply immediately (no Apply step) but the sheet stays open until dismissed.

## Web — components

| File | Purpose |
|---|---|
| `apps/web/src/pages/stores/map.tsx` | Page component. Reads URL search, owns mobile-view state, composes sidebar + map. Default-exported for the lazy import. |
| `apps/web/src/features/stores/map/store-map-sidebar.tsx` | Full sidebar: filter block + count + scrollable list + footnote. |
| `apps/web/src/features/stores/store-filters.tsx` | The four filter controls (search, vendor, product line, online). URL-agnostic; takes `value` + `onChange`. Reusable by `/stores` list later. |
| `apps/web/src/features/stores/map/store-map.tsx` | Mapbox container. Owns the `mapboxgl.Map` instance via a ref + effect. Props: `points`, `selectedId`, `onSelect`, `onBoundsChange`. |
| `apps/web/src/features/stores/map/store-map-markers.ts` | Hook syncing `points` to a clustered GeoJSON source + three layers (`clusters`, `cluster-count`, `unclustered-point`). |
| `apps/web/src/features/stores/map/store-map-popup.tsx` | Popup content: name, vendor + product-line badges, optional address, "View store" `<Link>`. |
| `apps/web/src/features/stores/map/store-map-mobile-toggle.tsx` | Segmented "Map / List" control + floating "Filters" button + bottom sheet. |
| `apps/web/src/features/stores/map/map-page-skeleton.tsx` | Suspense fallback: sidebar skeleton + flat panel where the map will be. |
| `apps/web/src/hooks/use-stores-map-query.ts` | React Query wrapper over the new endpoint. |

**Why a thin Mapbox hook instead of `react-map-gl`:** the interaction model is simple (fly to point, open popup, sync selection), so an ~80-line hook holding the `mapboxgl.Map` ref is lighter than another dependency with its own React reconciliation per pin.

**`StoreFilters` extraction:** the existing `/stores` list page reads vendor / product-line / online from URL params but exposes no UI for them. We extract the new shared `StoreFilters` component as part of this work; the list page can adopt it in a follow-up without coupling URL shapes.

## State, URL, and data flow

### Query hook

```ts
useStoresMapQuery({ q, vendor, productLine, online, bbox? })
```

- React Query key: `['stores-map', { q, vendor, productLine, online, bbox }]`.
- `staleTime: 60_000`, `placeholderData: keepPreviousData`.
- v1: `bbox` is **not** wired up — single fetch returns everything matching filters (~3k stores at launch). The plumbing exists in the hook + endpoint for the day total grows past ~5000 or the response comes back `truncated: true`.

### Filter changes

- All filter changes go through `nav({ to: '/stores/map', search: ... })`.
- Search input is debounced 300 ms before writing to the URL.
- Any filter change clears `selected` from the URL (the previously selected store may no longer be in results).

### Selection

- Selecting a pin or list row writes `selected=<id>` to the URL.
- The map watches `selected` and `flyTo`s the pin (with sidebar-side `padding`) and opens its popup.
- The list watches `selected` and scrolls the matching row into view + highlights it.
- Clicking the map background or closing the popup clears `selected`.
- If `selected` references a store not in current results, it's silently cleared on next render.

### Mobile `view`

Defaults to `map` if absent. The segmented toggle writes `view=list` or `view=map`.

## Map interaction & rendering

### Initial view

- Center: `VITE_DEFAULT_LAT` / `VITE_DEFAULT_LON` env (defaults to the same city used by the existing `WOLT_LAT` / `WOLT_LON` distance default).
- Zoom: `11`.
- Style: `mapbox://styles/mapbox/light-v11`.

### Clustered GeoJSON source

A single Mapbox source with `cluster: true, clusterRadius: 50, clusterMaxZoom: 14`, with three layers on top:

1. `clusters` — circle layer, sized + colored by `point_count` (small / medium / large breakpoints).
2. `cluster-count` — symbol layer showing the count number.
3. `unclustered-point` — circle layer, radius 6, vendor-color fill, white stroke 2 px.

This is the Mapbox-recommended pattern. It scales to ~50k points smoothly because clustering and rendering happen GPU-side.

**Why GeoJSON layers, not `mapboxgl.Marker` per store:** `Marker` instances are DOM nodes — fine for ~100 pins, slow at 3000, unusable at 10000.

### Vendor color encoding

`circle-color` on `unclustered-point` is a `match` expression on the `vendor` property. Initial palette: `wolt = #00C2E8`, fallback gray. New cases added as vendors come online.

### Interaction table

| Trigger | Behavior |
|---|---|
| Click cluster | Zoom in via `getClusterExpansionZoom`, `easeTo` centered on the cluster. |
| Click unclustered point | Set `selected=<id>` in URL → effect opens popup + highlights list row. |
| Click empty map | Clear `selected`. |
| Hover unclustered point | Cursor → pointer. |
| Hover list row | Set transient `hoveredId` (component state); raise that pin's stroke via `feature-state`. |
| Click list row | Set `selected=<id>`. |
| Map `moveend` (bbox mode) | Debounce 250 ms, then update bbox in query key. (Off in v1.) |

### Popup

`store-map-popup.tsx`: name (h3), vendor + product-line badges, optional address line, "View store" `<Link to="/stores/$idOrSlug">`. ~240 px wide.

## Env, dependencies, bundle

### Env (`apps/web`)

| Var | Where | Purpose |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | `.env.example` (placeholder) + `.env.local` (real) | Mapbox public token (`pk.…`). Safe to ship in bundle; restrict by URL allowlist for prod. |
| `VITE_DEFAULT_LAT` | `.env.example` + `.env.local` | Default map center latitude. |
| `VITE_DEFAULT_LON` | `.env.example` + `.env.local` | Default map center longitude. |

`apps/web/src/environment.ts` exposes these as typed values. A runtime check in `store-map.tsx` shows a friendly error if `VITE_MAPBOX_TOKEN` is missing — the rest of the page (sidebar, list) keeps working.

### Dependencies (`apps/web/package.json`)

- `mapbox-gl@^3` (~230 KB gzipped)
- `@types/mapbox-gl@^3` (devDep)

No React wrapper. No `supercluster` (Mapbox handles clustering internally). CSS imported once inside the lazy chunk: `import 'mapbox-gl/dist/mapbox-gl.css'`.

### Bundle impact

The route is lazy-loaded, so Mapbox + the page code split into a chunk that downloads on first map navigation only. `defaultPreload: 'intent'` prefetches on nav-link hover. No change to `vite.config.ts` needed.

## Error handling, edge cases, accessibility

### Loading

- Initial route: `<MapPageSkeleton />` from the `Suspense` boundary.
- Initial query: map shows base style + tiles (no pins yet); sidebar shows skeletons.
- Re-fetch after filter change: `keepPreviousData` keeps existing pins until new ones arrive; subtle progress indicator at top of sidebar.

### Errors

| Failure | UX |
|---|---|
| Mapbox token missing | Map area: *"Map view requires `VITE_MAPBOX_TOKEN`. See `.env.example`."* Sidebar/list still work. |
| Tile/style load failure | Map area: *"Couldn't load the map. Check your connection or token."* + Retry button. |
| `/stores/map/query` failure | Sidebar shows error string (matches existing list pattern). Map shows previous data, or "No data" overlay if first load. |
| `selected` references nonexistent store | Silently clear from URL on next render. |

### Edge cases

- **Zero results:** sidebar: *"No stores match these filters."* Map: base tiles, no pins.
- **`truncated: true`:** sidebar banner: *"Showing first N stores. Zoom in or refine filters to see more."* (Won't fire at v1 scale; plumbing only.)
- **Selected store offscreen:** map `flyTo` with `padding` on the sidebar side so popup isn't covered.
- **Browser back/forward:** filter and selection history just works via tanstack-router.
- **Window resize:** call `map.resize()` on resize so the canvas refits.
- **Switching mobile view to "list" while filter sheet is open:** sheet closes automatically — the filters are now visible in the sidebar at the top of the list.

### Accessibility

- Sidebar list is a `<ul>` of focusable rows; arrow keys move focus, `Enter` selects.
- Filter controls retain shadcn `Select` / `Input` accessibility.
- Mapbox canvas has `aria-label="Map of stores"`. Pins themselves are not keyboard-accessible (a Mapbox limitation); the sidebar list is the keyboard equivalent — keyboard-only users lose nothing.
- Mobile segmented toggle uses `role="tablist"` with `aria-selected`.
- White 2 px stroke on pins ensures contrast on any tile background.

## Testing

The web app has no test infrastructure today (no `test` script, no vitest, no test files). This feature does **not** add it — that's a separate project decision.

For api: follow the existing api package's pattern. If tests exist, add tests for `queryForMap` (filter combinations, bbox filtering, `truncated` boundary, selection of only locatable stores). If not, rely on contract types + manual verification.

### Manual verification checklist (must all pass before "done")

1. Map page loads; pins appear within ~1.5 s on a typical connection.
2. Top-nav "Map" link highlights when active.
3. Each filter (search, vendor, product line, online) updates both pins and list.
4. Pin click opens popup, sets `selected` in URL, highlights matching list row.
5. List row click flies map to pin, opens popup, sets `selected`.
6. Map background click clears `selected`.
7. Cluster click zooms in.
8. Bookmarked URL with all filters set restores the view on refresh.
9. Browser back/forward navigates filter/selection history correctly.
10. Mobile breakpoint: segmented toggle works; filters bottom sheet works.
11. With `VITE_MAPBOX_TOKEN` missing: friendly error in map area; sidebar list still works.
12. `/stores` list page still works unchanged after `StoreFilters` extraction.

### Type / lint safety net

- Contract types (`StoreMapPoint`, `StoreMapQueryBody`, `StoreMapQueryResponse`) shared via `@market/contracts`.
- `tsc --noEmit` gates web and api.
- `madge --circular` gates web.

## Out of scope (v1)

- Bbox-driven viewport fetching (plumbing only — not wired to map `moveend`).
- Dark-mode map style swap.
- Map-page tests / vitest setup.
- Adopting `StoreFilters` on the `/stores` list page (extracted but not adopted there).
- Address-based geocoding for stores missing `location`.
- Drawing custom pin shapes per vendor (vendor color only for v1).
