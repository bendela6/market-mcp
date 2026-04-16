// packages/contracts/src/routes.ts

/* ----------------------------------------------------------------------------
 * Pattern tables
 *
 * Two tables because Fastify uses `:param` and TanStack Router uses `$param`.
 * The literal pattern string is what each consumer expects, so we keep the
 * patterns in the syntax their consumer wants — no translation layer.
 * -------------------------------------------------------------------------- */

export const API_PATHS = {
  stores: {
    query:             '/v1/stores/query',
    map:               '/v1/stores/map/query',
    get:               '/v1/stores/:id',
    refreshAssortment: '/v1/stores/:id/refresh-assortment',
  },
  catalog: {
    itemQuery: '/v1/catalog/items/query',
    itemGet:   '/v1/catalog/items/:id',
    stats:     '/v1/catalog/stats',
  },
  plans: {
    query:      '/v1/plans/query',
    create:     '/v1/plans',
    get:        '/v1/plans/:id',
    update:     '/v1/plans/:id',
    delete:     '/v1/plans/:id',
    addLine:    '/v1/plans/:id/lines',
    updateLine: '/v1/plans/:id/lines/:lineId',
    deleteLine: '/v1/plans/:id/lines/:lineId',
    compute:    '/v1/plans/:id/compute',
  },
  users: { create: '/v1/users', me: '/v1/users/me' },
  admin: { crawl: '/v1/admin/crawl' },
} as const;

export const WEB_PATHS = {
  home:          '/',
  stores:        '/stores',
  storeDetail:   '/stores/$id',
  products:      '/products',
  productDetail: '/products/$id',
  vendors:       '/vendors',
  plans:         '/plans',
  planDetail:    '/plans/$id',
} as const;

/* ----------------------------------------------------------------------------
 * buildPath
 *
 * `ExtractParams` is a TS-only helper that walks the pattern string and
 * collects every `:name` and `$name` segment into a record type. The runtime
 * `buildPath` does the actual interpolation and uri-encodes each value.
 * -------------------------------------------------------------------------- */

export type ExtractParams<P extends string> =
  P extends `${string}:${infer Name}/${infer Rest}`
    ? { [K in Name | keyof ExtractParams<`/${Rest}`>]: string }
  : P extends `${string}:${infer Name}`
    ? { [K in Name]: string }
  : P extends `${string}$${infer Name}/${infer Rest}`
    ? { [K in Name | keyof ExtractParams<`/${Rest}`>]: string }
  : P extends `${string}$${infer Name}`
    ? { [K in Name]: string }
  : Record<string, never>;

export function buildPath<P extends string>(
  pattern: P,
  params: ExtractParams<P>,
): string {
  return pattern.replace(/[:$](\w+)/g, (_, key) =>
    encodeURIComponent((params as Record<string, string>)[key as string] ?? ''),
  );
}

/* ----------------------------------------------------------------------------
 * Legacy `ROUTES` — DEPRECATED.
 *
 * Kept only so consumers compile during the migration. Removed in Task 5
 * after every consumer has switched to `API_PATHS` + `buildPath`.
 * -------------------------------------------------------------------------- */

export const ROUTES = {
  stores: {
    query:             API_PATHS.stores.query,
    map:               API_PATHS.stores.map,
    get:               (id: string) => buildPath(API_PATHS.stores.get, { id }),
    refreshAssortment: (id: string) => buildPath(API_PATHS.stores.refreshAssortment, { id }),
  },
  catalog: {
    itemQuery: API_PATHS.catalog.itemQuery,
    itemGet:   (id: string) => buildPath(API_PATHS.catalog.itemGet, { id }),
    stats:     API_PATHS.catalog.stats,
  },
  plans: {
    query:   API_PATHS.plans.query,
    create:  API_PATHS.plans.create,
    get:     (id: string) => buildPath(API_PATHS.plans.get, { id }),
    update:  (id: string) => buildPath(API_PATHS.plans.update, { id }),
    delete:  (id: string) => buildPath(API_PATHS.plans.delete, { id }),
    lines: {
      add:    (id: string) => buildPath(API_PATHS.plans.addLine, { id }),
      update: (id: string, lineId: string) => buildPath(API_PATHS.plans.updateLine, { id, lineId }),
      delete: (id: string, lineId: string) => buildPath(API_PATHS.plans.deleteLine, { id, lineId }),
    },
    compute: (id: string) => buildPath(API_PATHS.plans.compute, { id }),
  },
  users: API_PATHS.users,
  admin: API_PATHS.admin,
} as const;
