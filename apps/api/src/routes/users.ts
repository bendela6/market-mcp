import type { FastifyPluginAsync } from 'fastify';
import * as v from 'valibot';
import { API_PATHS, CreateUserBodySchema, type User } from '@market/contracts';
import type { UsersService } from '../services/users.js';

export function usersRoutes(users: UsersService): FastifyPluginAsync {
  return async (app) => {
    app.post(API_PATHS.users.create, async (request, reply) => {
      const parsed = v.safeParse(CreateUserBodySchema, request.body ?? {});
      if (!parsed.success) { reply.code(400).send({ error: 'invalid body', issues: parsed.issues }); return; }
      const user = await users.create(parsed.output);
      return user;
    });

    app.get(API_PATHS.users.me, async (request, reply) => {
      const header = request.headers['x-user-id'];
      const id = Array.isArray(header) ? header[0] : header;
      if (!id || typeof id !== 'string') { reply.code(400).send({ error: 'missing X-User-Id' }); return; }
      const user = await users.getById(id);
      if (!user) { reply.code(404).send({ error: 'not found' }); return; }
      const response: User = user;
      return response;
    });
  };
}
