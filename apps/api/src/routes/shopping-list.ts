import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  BuildShoppingListBodySchema,
  ROUTES,
  type BuildShoppingListResponse,
} from '@market/contracts';
import type { ShoppingListService } from '../services/shopping-list.js';

export function shoppingListRoutes(service: ShoppingListService): FastifyPluginAsync {
  return async (app) => {
    app.post(ROUTES.shoppingList, async (request, reply) => {
      const parsed = v.safeParse(BuildShoppingListBodySchema, request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid body', issues: parsed.issues });
        return;
      }
      const { items, strategy, venueSlugs, includeOffline } = parsed.output;
      const req = { items, venueSlugs, includeOffline };
      const response: BuildShoppingListResponse = {};
      if (strategy === 'cheapest-per-item' || strategy === 'both') {
        response.cheapestPerItem = await service.optimizeCheapestPerItem(req);
      }
      if (strategy === 'single-store' || strategy === 'both') {
        response.singleStore = await service.optimizeSingleStore(req);
      }
      return response;
    });
  };
}
