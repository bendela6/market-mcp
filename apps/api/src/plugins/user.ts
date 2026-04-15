import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    requireUser: preHandlerHookHandler;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const plugin: FastifyPluginAsync = async (app) => {
  const requireUser: preHandlerHookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers['x-user-id'];
    const id = Array.isArray(header) ? header[0] : header;
    if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
      reply.code(400).send({ error: 'missing or invalid X-User-Id header' });
      return reply;
    }
    req.userId = id;
  };

  app.decorate('requireUser', requireUser);
};

export const userPlugin = fp(plugin);
