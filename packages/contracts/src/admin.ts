import * as v from 'valibot';
import { VendorIdSchema } from './common.js';

export const CrawlBodySchema = v.object({
  vendor: v.optional(VendorIdSchema),
  venueSlugs: v.optional(v.array(v.string())),
  venuesOnly: v.optional(v.boolean(), false),
});
export type CrawlBody = v.InferOutput<typeof CrawlBodySchema>;

export const CrawlResponseSchema = v.object({
  vendor: v.optional(VendorIdSchema),
  venues: v.number(),
  items: v.number(),
  errors: v.number(),
});
export type CrawlResponse = v.InferOutput<typeof CrawlResponseSchema>;
