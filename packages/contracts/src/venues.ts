import * as v from 'valibot';
import { CoordinatesSchema, PriceMinorSchema, ProductLineSchema, VendorIdSchema } from './common.js';

export const VenueSchema = v.object({
  vendor: VendorIdSchema,
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  shortDescription: v.optional(v.string()),
  address: v.optional(v.string()),
  currency: v.optional(v.string()),
  location: v.optional(CoordinatesSchema),
  productLine: v.optional(ProductLineSchema),
  online: v.optional(v.boolean()),
  deliveryPriceInt: v.optional(PriceMinorSchema),
  deliveryPriceText: v.optional(v.string()),
  iconUrl: v.optional(v.string()),
});
export type Venue = v.InferOutput<typeof VenueSchema>;

export const ListVenuesQuerySchema = v.object({
  q: v.optional(v.string()),
  vendor: v.optional(VendorIdSchema),
  productLine: v.optional(ProductLineSchema),
  online: v.optional(v.boolean()),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2000)), 200),
});
export type ListVenuesQuery = v.InferOutput<typeof ListVenuesQuerySchema>;

export const ListVenuesResponseSchema = v.object({
  venues: v.array(VenueSchema),
});
export type ListVenuesResponse = v.InferOutput<typeof ListVenuesResponseSchema>;

export const GetVenueParamsSchema = v.object({
  vendor: VendorIdSchema,
  slug: v.string(),
});
export type GetVenueParams = v.InferOutput<typeof GetVenueParamsSchema>;

export const GetVenueResponseSchema = v.object({
  venue: VenueSchema,
  content: v.optional(v.unknown()),
});
export type GetVenueResponse = v.InferOutput<typeof GetVenueResponseSchema>;

export const RefreshAssortmentParamsSchema = GetVenueParamsSchema;
export const RefreshAssortmentResponseSchema = v.object({
  slug: v.string(),
  categories: v.number(),
  items: v.number(),
  errors: v.number(),
});
export type RefreshAssortmentResponse = v.InferOutput<typeof RefreshAssortmentResponseSchema>;
