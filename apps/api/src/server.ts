import Fastify from 'fastify';
import cors from '@fastify/cors';
import { environment } from './environment.js';
import { getDb, closeDb } from './db/client.js';
import { createCatalogService } from './services/catalog.js';
import { createStoresService } from './services/stores.js';
import { createPlansService } from './services/plans.js';
import { createUsersService } from './services/users.js';
import { getEmbedder } from './embeddings/index.js';
import { getVendorRegistry } from './vendor-registry.js';
import { authPlugin } from './plugins/auth.js';
import { userPlugin } from './plugins/user.js';
import {
  adminRoutes,
  catalogRoutes,
  plansRoutes,
  storesRoutes,
  usersRoutes,
} from './routes/index.js';
import { startEmbeddingWorker, type EmbeddingWorkerHandle } from './workers/embedding-worker.js';

async function main(): Promise<void> {
  const app = Fastify({ logger: { level: environment.NODE_ENV === 'production' ? 'info' : 'debug' } });

  await app.register(cors, {
    origin: true,
    allowedHeaders: ['content-type', 'authorization', 'x-user-id'],
  });
  await app.register(authPlugin);
  await app.register(userPlugin);

  const db = getDb();
  const embedder = getEmbedder();
  const registry = getVendorRegistry();
  const catalog = createCatalogService(db);
  const storesSvc = createStoresService(db);
  const usersSvc = createUsersService(db);
  const plansSvc = createPlansService(db, catalog, embedder);

  await app.register(storesRoutes(storesSvc, catalog, registry));
  await app.register(catalogRoutes(catalog, embedder));
  await app.register(plansRoutes(plansSvc));
  await app.register(usersRoutes(usersSvc));
  await app.register(adminRoutes(catalog, registry));

  app.get('/health', async () => ({ ok: true }));

  let worker: EmbeddingWorkerHandle | null = null;
  if (environment.EMBEDDING_WORKER === 'on') {
    worker = startEmbeddingWorker(db, embedder);
    app.log.info('embedding worker started');
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      if (worker) await worker.stop();
      await app.close();
      await closeDb();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: environment.API_PORT, host: '0.0.0.0' });
  app.log.info(`listening on :${environment.API_PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
