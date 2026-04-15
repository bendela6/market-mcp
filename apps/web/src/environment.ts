import * as v from 'valibot';
import { parseEnv } from '@market/env';

const Schema = v.object({
  VITE_API_URL: v.pipe(v.string(), v.url()),
  VITE_APP_NAME: v.optional(v.string(), 'Market'),
});

export type Environment = v.InferOutput<typeof Schema>;

export const environment = parseEnv({
  schema: Schema,
  source: import.meta.env,
  label: '@market/web',
});
