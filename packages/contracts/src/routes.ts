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
