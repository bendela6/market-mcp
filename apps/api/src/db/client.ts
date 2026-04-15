import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { environment } from '../environment.js';
import * as schema from './schema.js';

const { Pool } = pg;

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let pool: pg.Pool | null = null;
let db: DbClient | null = null;

export function getDb(): DbClient {
  if (db) return db;
  pool = new Pool({
    connectionString: environment.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  db = drizzle(pool, { schema });
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
