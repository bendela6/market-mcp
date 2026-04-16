import * as v from 'valibot';

const VendorId = v.picklist(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill'] as const);
const ProductLine = v.picklist(['restaurant', 'store', 'grocery', 'pharmacy', 'other'] as const);
const SearchMode = v.picklist(['keyword', 'semantic', 'hybrid'] as const);
const PlanType = v.picklist(['mixed', 'item-based', 'query-based'] as const);

const StoreListSchema = v.object({
  skip: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 50),
  q: v.optional(v.string()),
  sort: v.optional(v.string()),
  vendor: v.optional(VendorId),
  productLine: v.optional(ProductLine),
  online: v.optional(v.boolean()),
});

const ItemListSchema = v.object({
  skip: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 50),
  q: v.optional(v.string()),
  sort: v.optional(v.string()),
  mode: v.optional(SearchMode),
  vendor: v.optional(VendorId),
  storeId: v.optional(v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{12}$/))),
  minPriceMinor: v.optional(v.number()),
  maxPriceMinor: v.optional(v.number()),
  available: v.optional(v.boolean()),
});

const PlanListSchema = v.object({
  skip: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 50),
  q: v.optional(v.string()),
  sort: v.optional(v.string()),
  type: v.optional(PlanType),
});

const StoreMapSchema = v.object({
  q:           v.optional(v.string()),
  vendor:      v.optional(VendorId),
  productLine: v.optional(ProductLine),
  online:      v.optional(v.boolean()),
  selected:    v.optional(v.string()),
  view:        v.optional(v.picklist(['map', 'list'] as const)),
});

export type StoreListSearch = v.InferOutput<typeof StoreListSchema>;
export type ItemListSearch = v.InferOutput<typeof ItemListSchema>;
export type PlanListSearch = v.InferOutput<typeof PlanListSchema>;
export type StoreMapSearch = v.InferOutput<typeof StoreMapSchema>;

export const storeListSearchSchema = (input: Record<string, unknown>): StoreListSearch =>
  v.parse(StoreListSchema, input);

export const itemListSearchSchema = (input: Record<string, unknown>): ItemListSearch =>
  v.parse(ItemListSchema, input);

export const planListSearchSchema = (input: Record<string, unknown>): PlanListSearch =>
  v.parse(PlanListSchema, input);

export const storeMapSearchSchema = (input: Record<string, unknown>): StoreMapSearch =>
  v.parse(StoreMapSchema, input);

export function parseSort<F extends string = string>(
  s: string | undefined,
): { field: F; direction: 'asc' | 'desc' }[] | undefined {
  if (!s) return undefined;
  return s.split(',').map((part) => {
    const [field, dir] = part.split(':');
    const direction: 'asc' | 'desc' = dir === 'desc' ? 'desc' : 'asc';
    return { field: (field ?? 'name') as F, direction };
  });
}
