import * as v from 'valibot';
import {
  PriceMinorSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  SortItemSchema,
  envelope,
} from './common.js';

export const SearchModeSchema = v.picklist(['keyword', 'semantic', 'hybrid'] as const);

export const ItemSchema = v.object({
  id:          v.string(),
  slug:        v.string(),
  vendor:      VendorIdSchema,
  storeId:     v.string(),
  storeSlug:   v.string(),
  storeName:   v.string(),
  name:        v.string(),
  description: v.optional(v.string()),
  priceMinor:  PriceMinorSchema,
  currency:    v.string(),
  gtin:        v.optional(v.string()),
  imageUrl:    v.optional(v.string()),
  available:   v.boolean(),
  score:       v.optional(v.number()),
});

export const ItemSortFields = ['name', 'priceMinor', 'relevance'] as const;

export const ItemQueryBodySchema = v.object({
  ...PaginationBaseSchema.entries,
  sort:             v.optional(v.array(SortItemSchema(ItemSortFields))),
  mode:             v.optional(SearchModeSchema),
  vendor:           v.optional(VendorIdSchema),
  storeIdOrSlug:    v.optional(v.string()),
  categoryIdOrSlug: v.optional(v.string()),
  minPriceMinor:    v.optional(PriceMinorSchema),
  maxPriceMinor:    v.optional(PriceMinorSchema),
  available:        v.optional(v.boolean()),
});

export const ItemQueryResponseSchema = envelope(ItemSchema);
export const GetItemResponseSchema   = v.object({ item: ItemSchema });

export const CatalogStatsResponseSchema = v.object({
  stores:               v.number(),
  categories:           v.number(),
  items:                v.number(),
  itemsWithEmbedding:   v.number(),
  storesWithAssortment: v.number(),
});

export type SearchMode = v.InferOutput<typeof SearchModeSchema>;
export type Item = v.InferOutput<typeof ItemSchema>;
export type ItemQueryBody = v.InferOutput<typeof ItemQueryBodySchema>;
export type ItemQueryResponse = v.InferOutput<typeof ItemQueryResponseSchema>;
export type GetItemResponse = v.InferOutput<typeof GetItemResponseSchema>;
export type CatalogStatsResponse = v.InferOutput<typeof CatalogStatsResponseSchema>;
