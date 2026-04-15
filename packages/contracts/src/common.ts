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
