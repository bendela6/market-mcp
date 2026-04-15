import * as v from 'valibot';

const NumberFromString = v.pipe(
  v.string(),
  v.transform((s) => Number(s)),
  v.number(),
  v.integer(),
);

const CsvList = v.pipe(
  v.string(),
  v.transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  ),
  v.array(v.string()),
);

const VendorId = v.picklist(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill'] as const);

const Schema = v.pipe(
  v.object({
    NODE_ENV: v.picklist(['development', 'production', 'test'] as const),
    API_PORT: v.pipe(NumberFromString, v.minValue(1), v.maxValue(65535)),
    API_TOKEN: v.pipe(v.string(), v.minLength(8)),
    DATABASE_URL: v.pipe(v.string(), v.url()),
    EMBEDDING_WORKER: v.picklist(['on', 'off'] as const),
    ENABLED_VENDORS: v.pipe(CsvList, v.array(VendorId)),
    EMBEDDER: v.picklist(['voyage', 'openai', 'ollama', 'cohere'] as const),
    VOYAGE_API_KEY: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    OLLAMA_BASE_URL: v.optional(v.pipe(v.string(), v.url())),
    COHERE_API_KEY: v.optional(v.string()),
    WOLT_LAT: NumberFromString,
    WOLT_LON: NumberFromString,
  }),
  v.forward(
    v.partialCheck(
      [
        ['EMBEDDER'],
        ['VOYAGE_API_KEY'],
        ['OPENAI_API_KEY'],
        ['OLLAMA_BASE_URL'],
        ['COHERE_API_KEY'],
      ],
      (input) => {
        switch (input.EMBEDDER) {
          case 'voyage':
            return !!input.VOYAGE_API_KEY;
          case 'openai':
            return !!input.OPENAI_API_KEY;
          case 'cohere':
            return !!input.COHERE_API_KEY;
          case 'ollama':
            return !!input.OLLAMA_BASE_URL;
        }
      },
      'Selected EMBEDDER requires its corresponding API key / base URL',
    ),
    ['EMBEDDER'],
  ),
);

export type Environment = v.InferOutput<typeof Schema>;

function parseEnv(): Environment {
  // This is the one file allowed to read process.env directly.
  // eslint-disable-next-line no-restricted-properties, no-restricted-syntax
  const result = v.safeParse(Schema, process.env);
  if (result.success) return Object.freeze(result.output);
  const issues = result.issues
    .map((i) => {
      const path = (i.path ?? []).map((p) => (p as { key?: string }).key ?? '').join('.');
      return `  - ${path || '(root)'}: ${i.message}`;
    })
    .join('\n');
  console.error(`[@market/api] invalid environment:\n${issues}`);
  process.exit(1);
}

export const environment = parseEnv();
