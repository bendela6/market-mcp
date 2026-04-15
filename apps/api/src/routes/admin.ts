import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import { CrawlBodySchema, ROUTES, type CrawlResponse } from '@market/contracts';
import type { VendorRegistry } from '@market/vendor-core';
import type { CatalogService } from '../services/catalog.js';
import { environment } from '../environment.js';

export function adminRoutes(
  catalog: CatalogService,
  registry: VendorRegistry,
): FastifyPluginAsync {
  return async (app) => {
    app.post(ROUTES.admin.crawl, { preHandler: app.requireApiToken }, async (request, reply) => {
      const parsed = v.safeParse(CrawlBodySchema, request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
        return;
      }
      const vendorIds = parsed.output.vendor ? [parsed.output.vendor] : registry.ids();

      let venuesSeen = 0;
      let itemsSeen = 0;
      let errors = 0;

      for (const vid of vendorIds) {
        const vendor = registry.get(vid);
        try {
          const list = await vendor.discoverVenues({
            lat: environment.WOLT_LAT,
            lon: environment.WOLT_LON,
          });
          await catalog.upsertStores(vid, list);
          venuesSeen += list.length;
          if (parsed.output.venuesOnly) continue;

          const targetSlugs = parsed.output.venueSlugs ?? list.map((v) => v.slug);
          for (const slug of targetSlugs) {
            try {
              const index = await vendor.getAssortmentIndex(slug);
              await catalog.upsertCategories(vid, slug, index.categories);
              const flat = [] as typeof index.categories;
              const walk = (l: typeof index.categories) => {
                for (const c of l) {
                  flat.push(c);
                  if (c.subcategories?.length) walk(c.subcategories);
                }
              };
              walk(index.categories);
              for (const cat of flat) {
                try {
                  const page = await vendor.getCategoryItems(slug, cat.slug);
                  itemsSeen += await catalog.upsertItems(vid, slug, page.items);
                } catch (err) {
                  errors++;
                  app.log.warn({ err, vid, slug, cat: cat.slug }, 'crawl cat failed');
                }
              }
              await catalog.touchStoreAssortmentRefresh(vid, slug);
            } catch (err) {
              errors++;
              app.log.warn({ err, vid, slug }, 'crawl venue failed');
            }
          }
        } catch (err) {
          errors++;
          app.log.warn({ err, vid }, 'crawl vendor failed');
        }
      }

      const response: CrawlResponse = {
        vendor: parsed.output.vendor,
        venues: venuesSeen,
        items: itemsSeen,
        errors,
      };
      return response;
    });
  };
}
