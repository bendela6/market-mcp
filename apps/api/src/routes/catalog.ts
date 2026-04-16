import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  API_PATHS,
  CatalogStatsResponseSchema,
  IdParamsSchema,
  ItemQueryBodySchema,
  type CatalogStatsResponse,
  type GetItemResponse,
  type ItemQueryResponse,
} from '@market/contracts';
import type { CatalogService } from '../services/catalog.js';
import type { Embedder } from '../embeddings/index.js';

export function catalogRoutes(catalog: CatalogService, embedder: Embedder): FastifyPluginAsync {
  return async (app) => {
    app.post(API_PATHS.catalog.itemQuery, async (request, reply) => {
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

    app.get(API_PATHS.catalog.itemGet, async (request, reply) => {
      const parsed = v.safeParse(IdParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const item = await catalog.getItemById(parsed.output.id);
      if (!item) { reply.code(404).send({ error: 'not found' }); return; }
      const response: GetItemResponse = { item };
      return response;
    });

    app.get(API_PATHS.catalog.stats, async () => {
      const s = await catalog.stats();
      const response: CatalogStatsResponse = s;
      v.parse(CatalogStatsResponseSchema, response);
      return response;
    });
  };
}
