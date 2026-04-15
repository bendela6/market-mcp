export const ROUTES = {
  venues: {
    list: '/v1/venues',
    get: (vendor: string, slug: string) => `/v1/venues/${vendor}/${slug}`,
    refreshAssortment: (vendor: string, slug: string) =>
      `/v1/venues/${vendor}/${slug}/refresh-assortment`,
  },
  catalog: {
    search: '/v1/catalog/search',
    stats: '/v1/catalog/stats',
  },
  shoppingList: '/v1/shopping-list',
  admin: {
    crawl: '/v1/admin/crawl',
  },
} as const;
