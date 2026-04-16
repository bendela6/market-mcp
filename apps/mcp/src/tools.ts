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
      title: 'Get a store by id',
      description: 'Fetch a single store (and its assortment content). Obtain the id from market_query_stores.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => ok(await api.get<GetStoreResponse>(ROUTES.stores.get(id))),
  );

  server.registerTool(
    'market_refresh_assortment',
    {
      title: 'Refresh store assortment',
      description: 'Trigger a live crawl of a store and persist results. Obtain the id from market_query_stores.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ id }) =>
      ok(await api.post<RefreshAssortmentResponse>(ROUTES.stores.refreshAssortment(id), {})),
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
      description: 'List/search items with pagination, filters, sort. storeId/categoryId are short ids.',
      inputSchema: {
        skip: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(500).optional(),
        q: z.string().optional(),
        sort: z.array(SortItem).optional(),
        mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
        vendor: VendorEnum.optional(),
        storeId: z.string().length(12).optional(),
        categoryId: z.string().length(12).optional(),
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
      title: 'Get a catalog item by id',
      description: 'Fetch a single item. Obtain the id from market_query_items.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => ok(await api.get<GetItemResponse>(ROUTES.catalog.itemGet(id))),
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
      description: 'Create a new persisted plan. storeIds is a filter list of 12-char store ids.',
      inputSchema: {
        name: z.string().min(1),
        type: z.enum(['mixed', 'item-based', 'query-based']),
        strategy: z.enum(['cheapest-per-item', 'single-store', 'both']),
        vendor: VendorEnum.optional(),
        storeIds: z.array(z.string().length(12)).optional(),
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
      description: 'Fetch a plan and its lines. Obtain the id from market_query_plans.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => ok(await api.get<PlanDetail>(ROUTES.plans.get(id), mkUser())),
  );

  server.registerTool(
    'market_update_plan',
    {
      title: 'Update plan metadata',
      description: 'Update name, strategy, filters; type is immutable.',
      inputSchema: {
        id: z.string().length(12),
        name: z.string().min(1).optional(),
        strategy: z.enum(['cheapest-per-item', 'single-store', 'both']).optional(),
        vendor: VendorEnum.optional(),
        storeIds: z.array(z.string().length(12)).optional(),
        includeOffline: z.boolean().optional(),
      },
    },
    async ({ id, ...rest }) => {
      const body = rest as UpdatePlanBody;
      return ok(await api.patch<Plan>(ROUTES.plans.update(id), body, mkUser()));
    },
  );

  server.registerTool(
    'market_delete_plan',
    {
      title: 'Delete a plan',
      description: 'Delete a plan and its lines.',
      inputSchema: { id: z.string().length(12) },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      await api.del(ROUTES.plans.delete(id), mkUser());
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    'market_add_plan_line',
    {
      title: 'Add a line to a plan',
      description: 'Add a query line or lock in a specific item. itemId is a 12-char id from market_query_items.',
      inputSchema: {
        id: z.string().length(12),
        kind: z.enum(['query', 'item']),
        query: z.string().optional(),
        itemId: z.string().length(12).optional(),
        quantity: z.number().int().min(1).optional(),
      },
    },
    async ({ id, ...rest }) => {
      const body = rest as AddPlanLineBody;
      return ok(await api.post(ROUTES.plans.lines.add(id), body, mkUser()));
    },
  );

  server.registerTool(
    'market_update_plan_line',
    {
      title: 'Update a plan line',
      description: 'Update quantity or the query text on a query line.',
      inputSchema: {
        id: z.string().length(12),
        lineId: z.string().length(12),
        quantity: z.number().int().min(1).optional(),
        query: z.string().optional(),
      },
    },
    async ({ id, lineId, ...rest }) => {
      const body = rest as UpdatePlanLineBody;
      return ok(await api.patch(ROUTES.plans.lines.update(id, lineId), body, mkUser()));
    },
  );

  server.registerTool(
    'market_remove_plan_line',
    {
      title: 'Remove a plan line',
      description: 'Delete a single line from a plan.',
      inputSchema: { id: z.string().length(12), lineId: z.string().length(12) },
      annotations: { destructiveHint: true },
    },
    async ({ id, lineId }) => {
      await api.del(ROUTES.plans.lines.delete(id, lineId), mkUser());
      return ok({ deleted: lineId });
    },
  );

  server.registerTool(
    'market_compute_plan',
    {
      title: 'Compute plan',
      description: 'Run the strategy against the stored lines and return the plan result.',
      inputSchema: { id: z.string().length(12) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) =>
      ok(await api.post<ComputePlanResponse>(ROUTES.plans.compute(id), {}, mkUser())),
  );
}
