import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ROUTES } from '@market/contracts';
import type {
  AddPlanLineBody, CatalogStatsResponse, ComputePlanResponse, CreatePlanBody,
  GetItemResponse, GetStoreResponse, ItemQueryBody, ItemQueryResponse, Plan,
  PlanDetail, PlanQueryBody, PlanQueryResponse, RefreshAssortmentResponse,
  StoreQueryBody, StoreQueryResponse, UpdatePlanBody, UpdatePlanLineBody,
} from '@market/contracts';
import type { ApiClient } from './api-client.js';
import { userHeaders } from './api-client.js';
import { environment } from './environment.js';

const VendorEnum = z.enum(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill']);
const ProductLineEnum = z.enum(['restaurant', 'store', 'grocery', 'pharmacy', 'other']);

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function mkUser() { return userHeaders(environment.MARKET_USER_ID); }

const SortItem = z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) });

export function registerMarketTools(server: McpServer, api: ApiClient): void {
  // --- stores ---
  server.registerTool(
    'market_query_stores',
    {
      title: 'Query stores',
      description: 'List/search stores with pagination, filters, sort.',
      inputSchema: {
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(500).optional(),
        q: z.string().optional(),
        sort: z.array(SortItem).optional(),
        vendor: VendorEnum.optional(),
        productLine: ProductLineEnum.optional(),
        online: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const body: StoreQueryBody = input as StoreQueryBody;
      return ok(await api.post<StoreQueryResponse>(ROUTES.stores.query, body));
    },
  );

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

  server.registerTool(
    'market_discover_stores',
    {
      title: 'Discover stores via vendor SDK',
      description: 'Query vendor SDK directly (ephemeral, bypasses DB).',
      inputSchema: {
        vendor: VendorEnum.optional(),
        productLine: ProductLineEnum.optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      const { limit, ...rest } = input;
      const body = { ...rest, take: limit ?? 200 } as StoreQueryBody;
      return ok(await api.post<StoreQueryResponse>(ROUTES.stores.query, body));
    },
  );

  // --- catalog ---
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

  server.registerTool(
    'market_catalog_stats',
    {
      title: 'Catalog statistics',
      description: 'Indexed stores, categories, items, embeddings.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => ok(await api.get<CatalogStatsResponse>(ROUTES.catalog.stats)),
  );

  // --- plans ---
  server.registerTool(
    'market_query_plans',
    {
      title: 'Query plans',
      description: 'List plans for the configured user.',
      inputSchema: {
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(500).optional(),
        q: z.string().optional(),
        sort: z.array(SortItem).optional(),
        type: z.enum(['mixed', 'item-based', 'query-based']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const body: PlanQueryBody = input as PlanQueryBody;
      return ok(await api.post<PlanQueryResponse>(ROUTES.plans.query, body, mkUser()));
    },
  );

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
}
