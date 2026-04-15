import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { environment } from '../environment.js';

export function requireApiToken(request: FastifyRequest, reply: FastifyReply): void {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'missing bearer token' });
    return;
  }
  const token = header.slice('Bearer '.length);
  if (token !== environment.API_TOKEN) {
    reply.code(403).send({ error: 'invalid token' });
    return;
  }
}

export const authPlugin: FastifyPluginCallback = (app, _opts, done) => {
  app.decorate('requireApiToken', requireApiToken);
  done();
};

declare module 'fastify' {
  interface FastifyInstance {
    requireApiToken: typeof requireApiToken;
  }
}
