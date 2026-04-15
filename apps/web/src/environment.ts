import * as v from 'valibot';

const Schema = v.object({
  VITE_API_URL: v.pipe(v.string(), v.url()),
  VITE_APP_NAME: v.optional(v.string(), 'Market'),
});

export type Environment = v.InferOutput<typeof Schema>;

function parseEnv(): Environment {
  const result = v.safeParse(Schema, import.meta.env);
  if (result.success) return Object.freeze(result.output);
  const issues = result.issues
    .map((i) => {
      const path = (i.path ?? []).map((p) => (p as { key?: string }).key ?? '').join('.');
      return `  - ${path || '(root)'}: ${i.message}`;
    })
    .join('\n');
  console.error(`[@market/web] invalid environment:\n${issues}`);
  throw new Error('invalid environment');
}

export const environment = parseEnv();
