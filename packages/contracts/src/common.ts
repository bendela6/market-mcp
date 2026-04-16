import * as v from 'valibot';

export const VendorIdSchema = v.picklist([
  'wolt',
  'glovo',
  'bolt-food',
  'europroduct',
  'goodwill',
] as const);
export type VendorId = v.InferOutput<typeof VendorIdSchema>;

export const ProductLineSchema = v.picklist([
  'restaurant',
  'store',
  'grocery',
  'pharmacy',
  'other',
] as const);
export type ProductLine = v.InferOutput<typeof ProductLineSchema>;

export const PriceMinorSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

export const CoordinatesSchema = v.object({
  lat: v.number(),
  lon: v.number(),
});

export const SortDirectionSchema = v.picklist(['asc', 'desc'] as const);
export const SortItemSchema = <F extends readonly string[]>(fields: F) =>
  v.object({ field: v.picklist(fields), direction: SortDirectionSchema });

export const PaginationBaseSchema = v.object({
  skip: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)), 50),
  q:    v.optional(v.pipe(v.string(), v.minLength(1))),
});

export function envelope<T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(item: T) {
  return v.object({
    data: v.array(item),
    meta: v.object({
      total: v.pipe(v.number(), v.integer(), v.minValue(0)),
      skip:  v.pipe(v.number(), v.integer(), v.minValue(0)),
      take:  v.pipe(v.number(), v.integer(), v.minValue(1)),
      sort:  v.optional(v.array(v.object({
        field: v.string(),
        direction: SortDirectionSchema,
      }))),
    }),
  });
}

export const ShortIdSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9_-]{12}$/, 'must be a 12-char short id'),
);

export const IdParamsSchema = v.object({
  id: ShortIdSchema,
});

export const LineIdParamsSchema = v.object({
  id: ShortIdSchema,
  lineId: ShortIdSchema,
});
