import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  AddPlanLineBodySchema,
  CreatePlanBodySchema,
  IdOrSlugParamsSchema,
  PlanQueryBodySchema,
  ROUTES,
  UpdatePlanBodySchema,
  UpdatePlanLineBodySchema,
  type ComputePlanResponse,
  type PlanDetail,
  type PlanQueryResponse,
} from '@market/contracts';
import type { PlansService } from '../services/plans.js';
import { NotFoundError, ValidationError } from '../services/plans.js';

const LineIdParams = v.object({
  idOrSlug: v.pipe(v.string(), v.minLength(1)),
  lineId: v.pipe(v.string(), v.minLength(1)),
});

export function plansRoutes(plansSvc: PlansService): FastifyPluginAsync {
  return async (app) => {
    const preHandler = app.requireUser;

    app.post(ROUTES.plans.query, { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(PlanQueryBodySchema, request.body ?? {});
      if (!parsed.success) { reply.code(400).send({ error: 'invalid body', issues: parsed.issues }); return; }
      const { data, total } = await plansSvc.query(request.userId!, parsed.output);
      const response: PlanQueryResponse = {
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

    app.post(ROUTES.plans.create, { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(CreatePlanBodySchema, request.body);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid body', issues: parsed.issues }); return; }
      const plan = await plansSvc.create(request.userId!, parsed.output);
      return plan;
    });

    app.get('/v1/plans/:idOrSlug', { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const detail: PlanDetail = await plansSvc.getDetail(request.userId!, parsed.output.idOrSlug);
        return detail;
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.patch('/v1/plans/:idOrSlug', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.update(request.userId!, p.output.idOrSlug, b.output);
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.delete('/v1/plans/:idOrSlug', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.remove(request.userId!, p.output.idOrSlug);
        reply.code(204).send();
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.post('/v1/plans/:idOrSlug/lines', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(AddPlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.addLine(request.userId!, p.output.idOrSlug, b.output);
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        if (e instanceof ValidationError) { reply.code(400).send({ error: e.message }); return; }
        throw e;
      }
    });

    app.patch('/v1/plans/:idOrSlug/lines/:lineId', { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParams, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.updateLine(request.userId!, p.output.idOrSlug, p.output.lineId, b.output);
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        if (e instanceof ValidationError) { reply.code(400).send({ error: e.message }); return; }
        throw e;
      }
    });

    app.delete('/v1/plans/:idOrSlug/lines/:lineId', { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParams, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.removeLine(request.userId!, p.output.idOrSlug, p.output.lineId);
        reply.code(204).send();
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.post('/v1/plans/:idOrSlug/compute', { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdOrSlugParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const resp: ComputePlanResponse = await plansSvc.compute(request.userId!, p.output.idOrSlug);
        return resp;
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });
  };
}
