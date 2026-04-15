import * as v from 'valibot';
import { PriceMinorSchema, VendorIdSchema } from './common.js';

export const SearchModeSchema = v.picklist(['keyword', 'semantic', 'hybrid'] as const);
export type SearchMode = v.InferOutput<typeof SearchModeSchema>;

export const SearchItemsQuerySchema = v.object({
  q: v.pipe(v.string(), v.minLength(1)),
  vendor: v.optional(VendorIdSchema),
  mode: v.optional(SearchModeSchema, 'hybrid'),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)), 50),
});
export type SearchItemsQuery = v.InferOutput<typeof SearchItemsQuerySchema>;

export const ItemResultSchema = v.object({
  id: v.string(),
  vendor: VendorIdSchema,
  venueSlug: v.string(),
  venueName: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  priceMinor: PriceMinorSchema,
  currency: v.string(),
  gtin: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  score: v.optional(v.number()),
});
export type ItemResult = v.InferOutput<typeof ItemResultSchema>;

export const SearchItemsResponseSchema = v.object({
  items: v.array(ItemResultSchema),
  mode: SearchModeSchema,
});
export type SearchItemsResponse = v.InferOutput<typeof SearchItemsResponseSchema>;

export const CatalogStatsResponseSchema = v.object({
  venues: v.number(),
  categories: v.number(),
  items: v.number(),
  itemsWithEmbedding: v.number(),
  venuesWithAssortment: v.number(),
});
export type CatalogStatsResponse = v.InferOutput<typeof CatalogStatsResponseSchema>;
