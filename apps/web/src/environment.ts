import * as v from 'valibot';
import { parseEnv } from '@market/env';

const Schema = v.object({
  VITE_API_URL:       v.pipe(v.string(), v.url()),
  VITE_APP_NAME:      v.optional(v.string(), 'Market'),
  VITE_MAPBOX_TOKEN:  v.optional(v.string(), ''),
  VITE_DEFAULT_LAT:   v.optional(v.pipe(v.string(), v.transform((s) => Number(s)), v.number()), '41.7151'),
  VITE_DEFAULT_LON:   v.optional(v.pipe(v.string(), v.transform((s) => Number(s)), v.number()), '44.8271'),
});

export type Environment = v.InferOutput<typeof Schema>;

export const environment = parseEnv({
  schema: Schema,
  source: import.meta.env,
  label: '@market/web',
});
