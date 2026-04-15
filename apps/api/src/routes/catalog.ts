import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  CatalogStatsResponseSchema,
  IdOrSlugParamsSchema,
  ItemQueryBodySchema,
  ROUTES,
  type CatalogStatsResponse,
  type GetItemResponse,
  type ItemQueryResponse,
} from '@market/contracts';
import type { CatalogService } from '../services/catalog.js';
import type { Embedder } from '../embeddings/index.js';

export function catalogRoutes(catalog: CatalogService, embedder: Embedder): FastifyPluginAsync {
  return async (app) => {
    app.post(ROUTES.catalog.itemQuery, async (request, reply) => {
      const parsed = v.safeParse(ItemQueryBodySchema, request.body);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid body', issues: parsed.issues }); return; }
      const { data, total } = await catalog.queryItems(parsed.output, embedder);
      const response: ItemQueryResponse = {
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

    app.get('/v1/catalog/items/:idOrSlug', async (request, reply) => {
      const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const item = await catalog.getItemByIdOrSlug(parsed.output.idOrSlug);
      if (!item) { reply.code(404).send({ error: 'not found' }); return; }
      const response: GetItemResponse = { item };
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
