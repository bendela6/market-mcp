import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ROUTES } from '@market/contracts';
import type {
  BuildShoppingListBody,
  BuildShoppingListResponse,
  CatalogStatsResponse,
  GetVenueResponse,
  ListVenuesResponse,
  RefreshAssortmentResponse,
  SearchItemsResponse,
} from '@market/contracts';
import type { ApiClient } from './api-client.js';

const VendorEnum = z.enum(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill']);

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerMarketTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    'market_search_venues',
    {
      title: 'Search venues across market vendors',
      description:
        'Search venues (restaurants, grocery stores) by free-text query. Hits api which proxies to the chosen vendor (wolt/glovo/etc).',
      inputSchema: {
        query: z.string().min(1).describe('Free-text query'),
        vendor: VendorEnum.optional().describe('Limit to one vendor; omit for all'),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, vendor, limit }) => {
      const q = new URLSearchParams({ q: query });
      if (vendor) q.set('vendor', vendor);
      if (limit) q.set('limit', String(limit));
      const result = await api.get<ListVenuesResponse>(`${ROUTES.venues.list}?${q.toString()}`);
      return ok(result);
    },
  );

  server.registerTool(
    'market_discover_venues',
    {
      title: 'Discover venues',
      description: 'List venues for the configured location. Same endpoint as search without a query.',
      inputSchema: {
        vendor: VendorEnum.optional(),
        productLine: z.enum(['restaurant', 'store', 'grocery', 'pharmacy', 'other']).optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ vendor, productLine, limit }) => {
      const q = new URLSearchParams();
      if (vendor) q.set('vendor', vendor);
      if (productLine) q.set('productLine', productLine);
      if (limit) q.set('limit', String(limit));
      const result = await api.get<ListVenuesResponse>(`${ROUTES.venues.list}?${q.toString()}`);
      return ok(result);
    },
  );

  server.registerTool(
    'market_list_venues',
    {
      title: 'List stored venues',
      description: 'List venues already stored in the local catalog without fetching upstream.',
      inputSchema: {
        vendor: VendorEnum.optional(),
        productLine: z.enum(['restaurant', 'store', 'grocery', 'pharmacy', 'other']).optional(),
        online: z.boolean().optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ vendor, productLine, online, limit }) => {
      const q = new URLSearchParams();
      if (vendor) q.set('vendor', vendor);
      if (productLine) q.set('productLine', productLine);
      if (online != null) q.set('online', String(online));
      if (limit) q.set('limit', String(limit));
      const result = await api.get<ListVenuesResponse>(`${ROUTES.venues.list}?${q.toString()}`);
      return ok(result);
    },
  );

  server.registerTool(
    'market_get_venue',
    {
      title: 'Get a venue by vendor + slug',
      description: 'Fetch venue detail from api.',
      inputSchema: { vendor: VendorEnum, slug: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ vendor, slug }) => {
      const result = await api.get<GetVenueResponse>(ROUTES.venues.get(vendor, slug));
      return ok(result);
    },
  );

  server.registerTool(
    'market_refresh_assortment',
    {
      title: 'Refresh venue assortment',
      description: 'Trigger a live fetch of a venue assortment and persist it.',
      inputSchema: { vendor: VendorEnum, slug: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ vendor, slug }) => {
      const result = await api.post<RefreshAssortmentResponse>(
        ROUTES.venues.refreshAssortment(vendor, slug),
        {},
      );
      return ok(result);
    },
  );

  server.registerTool(
    'market_search_items',
    {
      title: 'Search items in the catalog',
      description:
        'Full-text + semantic (hybrid) search over stored items. Use refresh_assortment or the crawler to populate.',
      inputSchema: {
        query: z.string().min(1),
        mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
        vendor: VendorEnum.optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ query, mode, vendor, limit }) => {
      const q = new URLSearchParams({ q: query });
      if (mode) q.set('mode', mode);
      if (vendor) q.set('vendor', vendor);
      if (limit) q.set('limit', String(limit));
      const result = await api.get<SearchItemsResponse>(`${ROUTES.catalog.search}?${q.toString()}`);
      return ok(result);
    },
  );

  server.registerTool(
    'market_catalog_stats',
    {
      title: 'Catalog statistics',
      description: 'How many venues, categories, and items are indexed.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async () => {
      const result = await api.get<CatalogStatsResponse>(ROUTES.catalog.stats);
      return ok(result);
    },
  );

  server.registerTool(
    'market_build_shopping_list',
    {
      title: 'Build an optimized shopping list',
      description:
        'Given items (name or barcode) and a strategy, return the optimized plan. Prices are integer minor units (e.g. tetri for GEL).',
      inputSchema: {
        items: z
          .array(
            z.object({
              query: z.string().min(1),
              quantity: z.number().int().min(1).optional(),
            }),
          )
          .min(1),
        strategy: z.enum(['cheapest-per-item', 'single-store', 'both']),
        vendor: VendorEnum.optional(),
        venueSlugs: z.array(z.string()).optional(),
        includeOffline: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      const body: BuildShoppingListBody = {
        items: input.items.map((i) => ({ query: i.query, quantity: i.quantity ?? 1 })),
        strategy: input.strategy,
        vendor: input.vendor,
        venueSlugs: input.venueSlugs,
        includeOffline: input.includeOffline ?? false,
      };
      const result = await api.post<BuildShoppingListResponse>(ROUTES.shoppingList, body);
      return ok(result);
    },
  );
}
