import { sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { itemEmbeddings, items } from '../db/schema.js';
import type { Embedder } from '../embeddings/index.js';

export interface EmbeddingWorkerHandle {
  stop(): Promise<void>;
}

const BATCH_SIZE = 100;
const TICK_MS = 5_000;

export function startEmbeddingWorker(db: DbClient, embedder: Embedder): EmbeddingWorkerHandle {
  let stopped = false;
  let pending: Promise<void> = Promise.resolve();

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      await db.transaction(async (tx) => {
        const locked = await tx.execute<{ item_id: string }>(sql`
          WITH candidate AS (
            SELECT item_id FROM embedding_jobs
            WHERE locked_at IS NULL OR locked_at < now() - interval '5 minutes'
            ORDER BY enqueued_at
            LIMIT ${BATCH_SIZE}
            FOR UPDATE SKIP LOCKED
          )
          UPDATE embedding_jobs j
          SET locked_at = now(), attempts = attempts + 1
          FROM candidate c
          WHERE j.item_id = c.item_id
          RETURNING j.item_id;
        `);
        const ids = locked.rows.map((r) => r.item_id);
        if (ids.length === 0) return;

        const rows = await tx
          .select({ id: items.id, name: items.name, description: items.description })
          .from(items)
          .where(sql`${items.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);

        const texts = rows.map((r) => `${r.name} ${r.description ?? ''}`.trim());
        const vectors = await embedder.embed(texts);

        if (vectors.length !== rows.length) {
          throw new Error(`embedder returned ${vectors.length} vectors for ${rows.length} inputs`);
        }

        const values = rows.map((r, i) => ({
          itemId: r.id,
          embedding: vectors[i]!,
          modelVersion: embedder.id,
        }));

        await tx
          .insert(itemEmbeddings)
          .values(values)
          .onConflictDoUpdate({
            target: itemEmbeddings.itemId,
            set: {
              embedding: sql`excluded.embedding`,
              modelVersion: sql`excluded.model_version`,
              embeddedAt: sql`now()`,
            },
          });

        await tx.execute(sql`
          DELETE FROM embedding_jobs
          WHERE item_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)});
        `);
      });
    } catch (err) {
      console.error('[embedding-worker] tick failed:', err);
      // Leave the rows locked; next tick retries after the lock expiry.
    }
  }

  async function loop(): Promise<void> {
    while (!stopped) {
      const started = Date.now();
      await tick();
      const elapsed = Date.now() - started;
      const wait = Math.max(0, TICK_MS - elapsed);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  pending = loop();

  return {
    async stop() {
      stopped = true;
      await pending;
    },
  };
}
