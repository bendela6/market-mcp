export type {
  WoltVenueData,
  WoltImage,
  WoltBadge,
  WoltPromotion,
  WoltRating,
  WoltEstimateBox,
  WoltPreviewItem,
  WoltProductData,
  WoltProductImage,
  WoltProductTag,
  WoltProductRestriction,
  WoltUnitPrice,
} from './wolt.js';

import type { WoltVenueData } from './wolt.js';

/**
 * Typed view over `Store.vendorData`, discriminated by `Store.vendor`.
 * Other vendors fall through to `unknown` until their shapes are described.
 */
export type VendorData =
  | { vendor: 'wolt'; data: WoltVenueData }
  | { vendor: 'glovo' | 'bolt-food' | 'europroduct' | 'goodwill'; data: unknown };
