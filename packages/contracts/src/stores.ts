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
  vendorData:       v.optional(v.unknown()),
});

export const StoreSortFields = [
  'name',
  'vendor',
  'productLine',
  'lastSeenAt',
  'distance',
  'ratingScore',
  'popularity',
  'priceRange',
  'eta',
] as const;

export const StoreQueryBodySchema = v.object({
  ...PaginationBaseSchema.entries,
  sort:        v.optional(v.array(SortItemSchema(StoreSortFields))),
  vendor:      v.optional(VendorIdSchema),
  productLine: v.optional(ProductLineSchema),
  online:      v.optional(v.boolean()),
  /** Reference point for `distance` sort. Falls back to server env default. */
  lat:         v.optional(v.number()),
  lon:         v.optional(v.number()),
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

// ---------- Map endpoint ----------

export const StoreMapPointSchema = v.object({
  id:          v.string(),
  slug:        v.string(),
  name:        v.string(),
  vendor:      VendorIdSchema,
  vendorSlug:  v.string(),
  productLine: v.optional(ProductLineSchema),
  online:      v.optional(v.boolean()),
  location:    CoordinatesSchema,
});

export const StoreMapQueryBodySchema = v.object({
  q:           v.optional(v.string()),
  vendor:      v.optional(VendorIdSchema),
  productLine: v.optional(ProductLineSchema),
  online:      v.optional(v.boolean()),
  /** Optional viewport filter: [west, south, east, north] in degrees. */
  bbox:        v.optional(v.tuple([v.number(), v.number(), v.number(), v.number()])),
  /** Hard safety cap. Default 5000, max 10000. */
  limit:       v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000))),
});

export const StoreMapQueryResponseSchema = v.object({
  data: v.array(StoreMapPointSchema),
  meta: v.object({
    total:                      v.number(),
    truncated:                  v.boolean(),
    totalWithoutLocationFilter: v.number(),
  }),
});

export type StoreMapPoint         = v.InferOutput<typeof StoreMapPointSchema>;
export type StoreMapQueryBody     = v.InferOutput<typeof StoreMapQueryBodySchema>;
export type StoreMapQueryResponse = v.InferOutput<typeof StoreMapQueryResponseSchema>;
