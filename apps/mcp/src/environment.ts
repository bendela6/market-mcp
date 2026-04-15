import * as v from 'valibot';

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

function parseEnv(): Environment {
  // eslint-disable-next-line no-restricted-properties, no-restricted-syntax
  const result = v.safeParse(Schema, process.env);
  if (result.success) return Object.freeze(result.output);
  const issues = result.issues
    .map((i) => {
      const path = (i.path ?? []).map((p) => (p as { key?: string }).key ?? '').join('.');
      return `  - ${path || '(root)'}: ${i.message}`;
    })
    .join('\n');
  console.error(`[@market/mcp] invalid environment:\n${issues}`);
  process.exit(1);
}

export const environment = parseEnv();
