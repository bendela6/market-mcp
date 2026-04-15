import * as v from 'valibot';
import { parseEnv } from '@market/env';

const Schema = v.object({
  NODE_ENV: v.picklist(['development', 'production', 'test'] as const),
  API_URL: v.pipe(v.string(), v.url()),
  API_TOKEN: v.pipe(v.string(), v.minLength(8)),
  MCP_HTTP: v.optional(v.picklist(['0', '1'] as const), '0'),
  MCP_PORT: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), '8787'),
  MCP_TLS_CERT: v.optional(v.string()),
  MCP_TLS_KEY: v.optional(v.string()),
});

export type Environment = v.InferOutput<typeof Schema>;

export const environment = parseEnv({
  schema: Schema,
  source: process.env,
  label: '@market/mcp',
  onError: (message) => {
    console.error(message);
    process.exit(1);
  },
});
