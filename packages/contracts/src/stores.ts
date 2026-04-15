import * as v from 'valibot';
import {
  CoordinatesSchema,
  PriceMinorSchema,
  ProductLineSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  SortItemSchema,
  envelope,
} from './common.js';

export const StoreSchema = v.object({
  id:               v.string(),
  slug:             v.string(),
  vendor:           VendorIdSchema,
  vendorSlug:       v.string(),
  name:             v.string(),
  shortDescription: v.optional(v.string()),
  address:          v.optional(v.string()),
  currency:         v.optional(v.string()),
  location:         v.optional(CoordinatesSchema),
  productLine:      v.optional(ProductLineSchema),
  online:           v.optional(v.boolean()),
  deliveryPriceInt: v.optional(PriceMinorSchema),
  deliveryPriceText: v.optional(v.string()),
  iconUrl:          v.optional(v.string()),
});

export const StoreSortFields = ['name', 'vendor', 'productLine', 'lastSeenAt'] as const;

export const StoreQueryBodySchema = v.object({
  ...PaginationBaseSchema.entries,
  sort:        v.optional(v.array(SortItemSchema(StoreSortFields))),
  vendor:      v.optional(VendorIdSchema),
  productLine: v.optional(ProductLineSchema),
  online:      v.optional(v.boolean()),
});

export const StoreQueryResponseSchema = envelope(StoreSchema);

export const GetStoreResponseSchema = v.object({
  store:   StoreSchema,
  content: v.optional(v.unknown()),
});

export const RefreshAssortmentResponseSchema = v.object({
  slug:       v.string(),
  categories: v.number(),
  items:      v.number(),
  errors:     v.number(),
});

export type Store = v.InferOutput<typeof StoreSchema>;
export type StoreQueryBody = v.InferOutput<typeof StoreQueryBodySchema>;
export type StoreQueryResponse = v.InferOutput<typeof StoreQueryResponseSchema>;
export type GetStoreResponse = v.InferOutput<typeof GetStoreResponseSchema>;
export type RefreshAssortmentResponse = v.InferOutput<typeof RefreshAssortmentResponseSchema>;
