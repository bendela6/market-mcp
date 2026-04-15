// eslint-disable-next-line no-restricted-properties, no-restricted-syntax
const dbUrl = process.env.DATABASE_URL ?? 'postgres://market:market@localhost:5432/market';

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: dbUrl },
  strict: true,
  verbose: true,
} satisfies Config;
