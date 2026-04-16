import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import {
  API_PATHS,
  AddPlanLineBodySchema,
  CreatePlanBodySchema,
  IdParamsSchema,
  LineIdParamsSchema,
  PlanQueryBodySchema,
  UpdatePlanBodySchema,
  UpdatePlanLineBodySchema,
  type ComputePlanResponse,
  type PlanDetail,
  type PlanQueryResponse,
} from '@market/contracts';
import type { PlansService } from '../services/plans.js';
import { NotFoundError, ValidationError } from '../services/plans.js';

export function plansRoutes(plansSvc: PlansService): FastifyPluginAsync {
  return async (app) => {
    const preHandler = app.requireUser;

    app.post(API_PATHS.plans.query, { preHandler }, async (request, reply) => {
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

    app.post(API_PATHS.plans.create, { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(CreatePlanBodySchema, request.body);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid body', issues: parsed.issues }); return; }
      const plan = await plansSvc.create(request.userId!, parsed.output);
      return plan;
    });

    app.get(API_PATHS.plans.get, { preHandler }, async (request, reply) => {
      const parsed = v.safeParse(IdParamsSchema, request.params);
      if (!parsed.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const detail: PlanDetail = await plansSvc.getDetail(request.userId!, parsed.output.id);
        return detail;
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.patch(API_PATHS.plans.update, { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.update(request.userId!, p.output.id, b.output);
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.delete(API_PATHS.plans.delete, { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.remove(request.userId!, p.output.id);
        reply.code(204).send();
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.post(API_PATHS.plans.addLine, { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(AddPlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.addLine(request.userId!, p.output.id, b.output);
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        if (e instanceof ValidationError) { reply.code(400).send({ error: e.message }); return; }
        throw e;
      }
    });

    app.patch(API_PATHS.plans.updateLine, { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      const b = v.safeParse(UpdatePlanLineBodySchema, request.body);
      if (!b.success) { reply.code(400).send({ error: 'invalid body', issues: b.issues }); return; }
      try {
        return await plansSvc.updateLine(request.userId!, p.output.id, p.output.lineId, b.output);
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        if (e instanceof ValidationError) { reply.code(400).send({ error: e.message }); return; }
        throw e;
      }
    });

    app.delete(API_PATHS.plans.deleteLine, { preHandler }, async (request, reply) => {
      const p = v.safeParse(LineIdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        await plansSvc.removeLine(request.userId!, p.output.id, p.output.lineId);
        reply.code(204).send();
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });

    app.post(API_PATHS.plans.compute, { preHandler }, async (request, reply) => {
      const p = v.safeParse(IdParamsSchema, request.params);
      if (!p.success) { reply.code(400).send({ error: 'invalid params' }); return; }
      try {
        const resp: ComputePlanResponse = await plansSvc.compute(request.userId!, p.output.id);
        return resp;
      } catch (e) {
        if (e instanceof NotFoundError) { reply.code(404).send({ error: 'not found' }); return; }
        throw e;
      }
    });
  };
}
