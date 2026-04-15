import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  IdOrSlugParamsSchema,
  ROUTES,
  StoreQueryBodySchema,
  type GetStoreResponse,
  type RefreshAssortmentResponse,
  type StoreQueryResponse,
} from '@market/contracts';
import type { CatalogService } from '../services/catalog.js';
import type { StoresService } from '../services/stores.js';
import type { VendorRegistry } from '@market/vendor-core';

export function storesRoutes(
  storesSvc: StoresService,
  catalog: CatalogService,
  registry: VendorRegistry,
): FastifyPluginAsync {
  return async (app) => {
    app.post(ROUTES.stores.query, async (request, reply) => {
      const parsed = v.safeParse(StoreQueryBodySchema, request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
        return;
      }
      const { data, total } = await storesSvc.query(parsed.output);
      const response: StoreQueryResponse = {
        data,
        meta: {
          total,
          skip: parsed.output.skip ?? 0,
          take: parsed.output.take ?? 50,
          sort: parsed.output.sort,
        },
      };
      return response;
    });

    app.get('/v1/stores/:idOrSlug', async (request, reply) => {
      const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const row = await storesSvc.getByIdOrSlug(parsed.output.idOrSlug);
      if (!row) { reply.code(404).send({ error: 'not found' }); return; }
      const response: GetStoreResponse = {
        store: {
          id: row.id,
          slug: row.slug,
          vendor: row.vendor,
          vendorSlug: row.vendorSlug,
          name: row.name,
          address: row.address ?? undefined,
          currency: row.currency,
          productLine: row.productLine ?? undefined,
          online: row.online,
          location: row.lat && row.lon ? { lat: Number(row.lat), lon: Number(row.lon) } : undefined,
          vendorData: row.rawContent ?? undefined,
        },
        content: row.rawContent ?? undefined,
      };
      return response;
    });

    app.post(
      '/v1/stores/:idOrSlug/refresh-assortment',
      async (request, reply) => {
        const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
        if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
        const storeRow = await storesSvc.getByIdOrSlug(parsed.output.idOrSlug);
        if (!storeRow) { reply.code(404).send({ error: 'not found' }); return; }

        const vendor = registry.get(storeRow.vendor);
        const index = await vendor.getAssortmentIndex(storeRow.vendorSlug);
        await catalog.upsertCategories(storeRow.vendor, storeRow.vendorSlug, index.categories);

        const flat: typeof index.categories = [];
        const walk = (list: typeof index.categories) => {
          for (const c of list) { flat.push(c); if (c.subcategories?.length) walk(c.subcategories); }
        };
        walk(index.categories);

        let itemsCount = 0;
        let errors = 0;
        for (const cat of flat) {
          try {
            const page = await vendor.getCategoryItems(storeRow.vendorSlug, cat.slug);
            itemsCount += await catalog.upsertItems(storeRow.vendor, storeRow.vendorSlug, page.items);
          } catch (err) {
            errors++;
            app.log.warn({ err, slug: storeRow.vendorSlug, category: cat.slug }, 'refresh cat failed');
          }
        }
        await catalog.touchStoreAssortmentRefresh(storeRow.vendor, storeRow.vendorSlug);
        const response: RefreshAssortmentResponse = {
          slug: storeRow.slug,
          categories: flat.length,
          items: itemsCount,
          errors,
        };
        return response;
      },
    );
  };
}
