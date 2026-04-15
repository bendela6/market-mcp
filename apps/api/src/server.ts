import Fastify from 'fastify';
import cors from '@fastify/cors';
import { environment } from './environment.js';
import { getDb, closeDb } from './db/client.js';
import { createCatalogService } from './services/catalog.js';
import { createShoppingListService } from './services/shopping-list.js';
import { getEmbedder } from './embeddings/index.js';
import { getVendorRegistry } from './vendor-registry.js';
import { authPlugin } from './plugins/auth.js';
import {
  adminRoutes,
  catalogRoutes,
  shoppingListRoutes,
  venuesRoutes,
} from './routes/index.js';
import { startEmbeddingWorker, type EmbeddingWorkerHandle } from './workers/embedding-worker.js';

async function main(): Promise<void> {
  const app = Fastify({ logger: { level: environment.NODE_ENV === 'production' ? 'info' : 'debug' } });

  await app.register(cors, { origin: true });
  await app.register(authPlugin);

  const db = getDb();
  const embedder = getEmbedder();
  const registry = getVendorRegistry();
  const catalog = createCatalogService(db);
  const shoppingList = createShoppingListService(catalog, embedder);

  await app.register(venuesRoutes(catalog, registry));
  await app.register(catalogRoutes(catalog, embedder));
  await app.register(shoppingListRoutes(shoppingList));
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
