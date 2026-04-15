import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  GetVenueParamsSchema,
  ListVenuesQuerySchema,
  RefreshAssortmentParamsSchema,
  ROUTES,
  type GetVenueResponse,
  type ListVenuesResponse,
  type RefreshAssortmentResponse,
} from '@market/contracts';
import type { CatalogService } from '../services/catalog.js';
import type { VendorRegistry } from '@market/vendor-core';

export function venuesRoutes(
  catalog: CatalogService,
  registry: VendorRegistry,
): FastifyPluginAsync {
  return async (app) => {
    app.get(ROUTES.venues.list, async (request, reply) => {
      const parsed = v.safeParse(ListVenuesQuerySchema, request.query);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid query', issues: parsed.issues });
        return;
      }
      const rows = await catalog.listVenues({
        vendor: parsed.output.vendor,
        productLine: parsed.output.productLine,
        online: parsed.output.online,
        q: parsed.output.q,
        limit: parsed.output.limit,
      });
      const response: ListVenuesResponse = {
        venues: rows.map((r) => ({
          vendor: r.vendor,
          id: r.id,
          slug: r.vendorSlug,
          name: r.name,
          address: r.address ?? undefined,
          currency: r.currency,
          productLine: r.productLine ?? undefined,
          online: r.online,
        })),
      };
      return response;
    });

    app.get(ROUTES.venues.get(':vendor', ':slug'), async (request, reply) => {
      const parsed = v.safeParse(GetVenueParamsSchema, request.params);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid params' });
        return;
      }
      const row = await catalog.getVenue(parsed.output.vendor, parsed.output.slug);
      if (!row) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      const response: GetVenueResponse = {
        venue: {
          vendor: row.vendor,
          id: row.id,
          slug: row.vendorSlug,
          name: row.name,
          address: row.address ?? undefined,
          currency: row.currency,
          productLine: row.productLine ?? undefined,
          online: row.online,
        },
      };
      return response;
    });

    app.post(
      ROUTES.venues.refreshAssortment(':vendor', ':slug'),
      async (request, reply) => {
        const parsed = v.safeParse(RefreshAssortmentParamsSchema, request.params);
        if (!parsed.success) {
          reply.code(400).send({ error: 'invalid params' });
          return;
        }
        const vendor = registry.get(parsed.output.vendor);
        const index = await vendor.getAssortmentIndex(parsed.output.slug);
        await catalog.upsertCategories(parsed.output.vendor, parsed.output.slug, index.categories);
        const flat: typeof index.categories = [];
        const walk = (list: typeof index.categories) => {
          for (const c of list) {
            flat.push(c);
            if (c.subcategories?.length) walk(c.subcategories);
          }
        };
        walk(index.categories);

        let itemsCount = 0;
        let errors = 0;
        for (const cat of flat) {
          try {
            const page = await vendor.getCategoryItems(parsed.output.slug, cat.slug);
            const n = await catalog.upsertItems(parsed.output.vendor, parsed.output.slug, page.items);
            itemsCount += n;
          } catch (err) {
            errors++;
            app.log.warn({ err, slug: parsed.output.slug, category: cat.slug }, 'refresh cat failed');
          }
        }
        await catalog.touchVenueAssortmentRefresh(parsed.output.vendor, parsed.output.slug);
        const response: RefreshAssortmentResponse = {
          slug: parsed.output.slug,
          categories: flat.length,
          items: itemsCount,
          errors,
        };
        return response;
      },
    );
  };
}
