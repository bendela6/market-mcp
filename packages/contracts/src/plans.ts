import * as v from 'valibot';
import {
  PriceMinorSchema,
  VendorIdSchema,
  PaginationBaseSchema,
  ShortIdSchema,
  SortItemSchema,
  envelope,
} from './common.js';

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

export const ShoppingPlanLineSchema = v.object({
  query: v.string(),
  quantity: v.number(),
  chosen: v.optional(ItemCandidateSchema),
  lineTotalMinor: v.optional(PriceMinorSchema),
  unmet: v.optional(v.literal(true)),
  alternatives: v.optional(v.array(ItemCandidateSchema)),
});

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

export const PlanTypeSchema     = v.picklist(['mixed', 'item-based', 'query-based'] as const);
export const PlanStrategySchema = v.picklist(['cheapest-per-item', 'single-store', 'both'] as const);
export const PlanLineKindSchema = v.picklist(['query', 'item'] as const);

export const PlanLineSchema = v.variant('kind', [
  v.object({
    id:       v.string(),
    kind:     v.literal('query'),
    position: v.number(),
    quantity: v.number(),
    query:    v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({
    id:       v.string(),
    kind:     v.literal('item'),
    position: v.number(),
    quantity: v.number(),
    itemId:   v.string(),
    itemSlug: v.string(),
    itemName: v.string(),
  }),
]);

export const PlanSchema = v.object({
  id:             v.string(),
  slug:           v.string(),
  name:           v.string(),
  type:           PlanTypeSchema,
  strategy:       PlanStrategySchema,
  vendor:         v.optional(VendorIdSchema),
  storeIds:       v.optional(v.array(ShortIdSchema)),
  includeOffline: v.boolean(),
  createdAt:      v.string(),
  updatedAt:      v.string(),
  lineCount:      v.number(),
});

export const PlanDetailSchema = v.object({
  plan:  PlanSchema,
  lines: v.array(PlanLineSchema),
});

export const PlanSortFields = ['name', 'createdAt', 'updatedAt'] as const;

export const PlanQueryBodySchema = v.object({
  ...PaginationBaseSchema.entries,
  sort: v.optional(v.array(SortItemSchema(PlanSortFields))),
  type: v.optional(PlanTypeSchema),
});
export const PlanQueryResponseSchema = envelope(PlanSchema);

export const CreatePlanBodySchema = v.object({
  name:           v.pipe(v.string(), v.minLength(1)),
  type:           PlanTypeSchema,
  strategy:       PlanStrategySchema,
  vendor:         v.optional(VendorIdSchema),
  storeIds:       v.optional(v.array(ShortIdSchema)),
  includeOffline: v.optional(v.boolean(), false),
});

export const UpdatePlanBodySchema = v.partial(v.object({
  name:           v.pipe(v.string(), v.minLength(1)),
  strategy:       PlanStrategySchema,
  vendor:         v.optional(VendorIdSchema),
  storeIds:       v.optional(v.array(ShortIdSchema)),
  includeOffline: v.boolean(),
}));

export const AddPlanLineBodySchema = v.variant('kind', [
  v.object({
    kind:     v.literal('query'),
    query:    v.pipe(v.string(), v.minLength(1)),
    quantity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
  v.object({
    kind:     v.literal('item'),
    itemId:   ShortIdSchema,
    quantity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
]);

export const UpdatePlanLineBodySchema = v.partial(v.object({
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
  query:    v.pipe(v.string(), v.minLength(1)),
}));

export const ComputePlanResponseSchema = v.object({
  cheapestPerItem: v.optional(CheapestPerItemPlanSchema),
  singleStore:     v.optional(SingleStorePlanSchema),
});

export type PlanType = v.InferOutput<typeof PlanTypeSchema>;
export type PlanStrategy = v.InferOutput<typeof PlanStrategySchema>;
export type PlanLineKind = v.InferOutput<typeof PlanLineKindSchema>;
export type PlanLine = v.InferOutput<typeof PlanLineSchema>;
export type Plan = v.InferOutput<typeof PlanSchema>;
export type PlanDetail = v.InferOutput<typeof PlanDetailSchema>;
export type PlanQueryBody = v.InferOutput<typeof PlanQueryBodySchema>;
export type PlanQueryResponse = v.InferOutput<typeof PlanQueryResponseSchema>;
export type CreatePlanBody = v.InferOutput<typeof CreatePlanBodySchema>;
export type UpdatePlanBody = v.InferOutput<typeof UpdatePlanBodySchema>;
export type AddPlanLineBody = v.InferOutput<typeof AddPlanLineBodySchema>;
export type UpdatePlanLineBody = v.InferOutput<typeof UpdatePlanLineBodySchema>;
export type ComputePlanResponse = v.InferOutput<typeof ComputePlanResponseSchema>;
export type ItemCandidate = v.InferOutput<typeof ItemCandidateSchema>;
export type ShoppingPlanLine = v.InferOutput<typeof ShoppingPlanLineSchema>;
export type CheapestPerItemPlan = v.InferOutput<typeof CheapestPerItemPlanSchema>;
export type SingleStorePlan = v.InferOutput<typeof SingleStorePlanSchema>;
