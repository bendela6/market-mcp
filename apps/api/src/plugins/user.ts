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

const SHORT_ID_RE = /^[A-Za-z0-9_-]{12}$/;

const plugin: FastifyPluginAsync = async (app) => {
  const requireUser: preHandlerHookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers['x-user-id'];
    const id = Array.isArray(header) ? header[0] : header;
    if (!id || typeof id !== 'string' || !SHORT_ID_RE.test(id)) {
      reply.code(400).send({ error: 'missing or invalid X-User-Id header' });
      return reply;
    }
    req.userId = id;
  };

  app.decorate('requireUser', requireUser);
};

export const userPlugin = fp(plugin);
