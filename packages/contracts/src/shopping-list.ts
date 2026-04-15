import * as v from 'valibot';
import { PriceMinorSchema, VendorIdSchema } from './common.js';

export const ShoppingStrategySchema = v.picklist([
  'cheapest-per-item',
  'single-store',
  'both',
] as const);
export type ShoppingStrategy = v.InferOutput<typeof ShoppingStrategySchema>;

export const ShoppingLineInputSchema = v.object({
  query: v.pipe(v.string(), v.minLength(1)),
  quantity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
export type ShoppingLineInput = v.InferOutput<typeof ShoppingLineInputSchema>;

export const BuildShoppingListBodySchema = v.object({
  items: v.pipe(v.array(ShoppingLineInputSchema), v.minLength(1)),
  strategy: ShoppingStrategySchema,
  vendor: v.optional(VendorIdSchema),
  venueSlugs: v.optional(v.array(v.string())),
  includeOffline: v.optional(v.boolean(), false),
});
export type BuildShoppingListBody = v.InferOutput<typeof BuildShoppingListBodySchema>;

export const ItemCandidateSchema = v.object({
  venueSlug: v.string(),
  venueName: v.string(),
  itemId: v.string(),
  itemName: v.string(),
  priceMinor: PriceMinorSchema,
  currency: v.string(),
  unitInfo: v.optional(v.string()),
  deliveryPriceInt: v.optional(PriceMinorSchema),
  online: v.boolean(),
});
export type ItemCandidate = v.InferOutput<typeof ItemCandidateSchema>;

export const ShoppingPlanLineSchema = v.object({
  query: v.string(),
  quantity: v.number(),
  chosen: v.optional(ItemCandidateSchema),
  lineTotalMinor: v.optional(PriceMinorSchema),
  unmet: v.optional(v.literal(true)),
  alternatives: v.optional(v.array(ItemCandidateSchema)),
});
export type ShoppingPlanLine = v.InferOutput<typeof ShoppingPlanLineSchema>;

export const CheapestPerItemPlanSchema = v.object({
  strategy: v.literal('cheapest-per-item'),
  lines: v.array(ShoppingPlanLineSchema),
  uniqueVenues: v.array(v.string()),
  itemsSubtotalMinor: PriceMinorSchema,
  deliverySubtotalMinor: PriceMinorSchema,
  grandTotalMinor: PriceMinorSchema,
  currency: v.string(),
  unmet: v.array(v.string()),
});
export type CheapestPerItemPlan = v.InferOutput<typeof CheapestPerItemPlanSchema>;

export const SingleStorePlanSchema = v.object({
  strategy: v.literal('single-store'),
  venueSlug: v.string(),
  venueName: v.string(),
  itemsSubtotalMinor: PriceMinorSchema,
  deliveryFeeMinor: PriceMinorSchema,
  grandTotalMinor: PriceMinorSchema,
  currency: v.string(),
  lines: v.array(ShoppingPlanLineSchema),
  unmet: v.array(v.string()),
});
export type SingleStorePlan = v.InferOutput<typeof SingleStorePlanSchema>;

export const BuildShoppingListResponseSchema = v.object({
  cheapestPerItem: v.optional(CheapestPerItemPlanSchema),
  singleStore: v.optional(SingleStorePlanSchema),
});
export type BuildShoppingListResponse = v.InferOutput<typeof BuildShoppingListResponseSchema>;
