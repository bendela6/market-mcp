import * as v from 'valibot';

const VendorId = v.picklist(['wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill'] as const);
const ProductLine = v.picklist(['restaurant', 'store', 'grocery', 'pharmacy', 'other'] as const);

const base = {
  skip: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 50),
  q: v.optional(v.string()),
  sort: v.optional(v.string()),
};

export const storeListSearchSchema = (input: unknown) => v.parse(
  v.object({ ...base, vendor: v.optional(VendorId), productLine: v.optional(ProductLine), online: v.optional(v.boolean()) }),
  input ?? {},
);

export const itemListSearchSchema = (input: unknown) => v.parse(
  v.object({
    ...base,
    mode: v.optional(v.picklist(['keyword', 'semantic', 'hybrid'] as const)),
    vendor: v.optional(VendorId),
    storeIdOrSlug: v.optional(v.string()),
    minPriceMinor: v.optional(v.number()),
    maxPriceMinor: v.optional(v.number()),
    available: v.optional(v.boolean()),
  }),
  input ?? {},
);

export const planListSearchSchema = (input: unknown) => v.parse(
  v.object({ ...base, type: v.optional(v.picklist(['mixed', 'item-based', 'query-based'] as const)) }),
  input ?? {},
);

export type StoreListSearch = ReturnType<typeof storeListSearchSchema>;
export type ItemListSearch = ReturnType<typeof itemListSearchSchema>;
export type PlanListSearch = ReturnType<typeof planListSearchSchema>;

export function parseSort(s: string | undefined): { field: string; direction: 'asc' | 'desc' }[] | undefined {
  if (!s) return undefined;
  return s.split(',').map((part) => {
    const [field, dir] = part.split(':');
    return { field: field ?? 'name', direction: (dir === 'desc' ? 'desc' : 'asc') as const };
  });
}
