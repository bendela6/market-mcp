export const ROUTES = {
  stores: {
    query:             '/v1/stores/query',
    get:               (idOrSlug: string) => `/v1/stores/${idOrSlug}`,
    refreshAssortment: (idOrSlug: string) => `/v1/stores/${idOrSlug}/refresh-assortment`,
  },
  catalog: {
    itemQuery: '/v1/catalog/items/query',
    itemGet:   (idOrSlug: string) => `/v1/catalog/items/${idOrSlug}`,
    stats:     '/v1/catalog/stats',
  },
  plans: {
    query:   '/v1/plans/query',
    create:  '/v1/plans',
    get:     (idOrSlug: string) => `/v1/plans/${idOrSlug}`,
    update:  (idOrSlug: string) => `/v1/plans/${idOrSlug}`,
    delete:  (idOrSlug: string) => `/v1/plans/${idOrSlug}`,
    lines: {
      add:    (idOrSlug: string) => `/v1/plans/${idOrSlug}/lines`,
      update: (idOrSlug: string, lineId: string) => `/v1/plans/${idOrSlug}/lines/${lineId}`,
      delete: (idOrSlug: string, lineId: string) => `/v1/plans/${idOrSlug}/lines/${lineId}`,
    },
    compute: (idOrSlug: string) => `/v1/plans/${idOrSlug}/compute`,
  },
  users: {
    create: '/v1/users',
    me:     '/v1/users/me',
  },
  admin: { crawl: '/v1/admin/crawl' },
} as const;
