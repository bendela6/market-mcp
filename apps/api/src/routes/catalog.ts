import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  CatalogStatsResponseSchema,
  ROUTES,
  SearchItemsQuerySchema,
  type CatalogStatsResponse,
  type SearchItemsResponse,
} from '@market/contracts';
import type { CatalogService, HybridItemHit } from '../services/catalog.js';
import type { Embedder } from '../embeddings/index.js';

function hitToResult(h: HybridItemHit) {
  return {
    id: h.id,
    vendor: h.vendor,
    venueSlug: h.venueSlug,
    venueName: h.venueName,
    name: h.name,
    description: h.description ?? undefined,
    priceMinor: h.priceMinor,
    currency: h.currency,
    gtin: h.gtin ?? undefined,
    imageUrl: h.imageUrl ?? undefined,
    score: h.score ?? undefined,
  };
}

export function catalogRoutes(catalog: CatalogService, embedder: Embedder): FastifyPluginAsync {
  return async (app) => {
    app.get(ROUTES.catalog.search, async (request, reply) => {
      const parsed = v.safeParse(SearchItemsQuerySchema, request.query);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid query', issues: parsed.issues });
        return;
      }
      const { q, mode, limit } = parsed.output;
      let hits: HybridItemHit[];
      switch (mode) {
        case 'keyword':
          hits = await catalog.searchItemsKeyword(q, limit);
          break;
        case 'semantic':
        case 'hybrid':
        default:
          hits = await catalog.searchItemsHybrid(q, embedder, limit);
          break;
      }
      const response: SearchItemsResponse = { items: hits.map(hitToResult), mode };
      return response;
    });

    app.get(ROUTES.catalog.stats, async () => {
      const s = await catalog.stats();
      const response: CatalogStatsResponse = s;
      v.parse(CatalogStatsResponseSchema, response);
      return response;
    });
  };
}
