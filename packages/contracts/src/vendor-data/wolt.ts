export interface WoltImage {
  url?: string;
  blurhash?: string;
}

export interface WoltBadge {
  icon?: string;
  text?: string;
  variant?: string;
}

export interface WoltPromotion extends WoltBadge {
  campaign_id?: string;
  is_offer_stackable?: boolean;
}

export interface WoltRating {
  score?: number;
  rating?: number;
  volume?: number;
}

export interface WoltEstimateBox {
  title?: string;
  subtitle?: string;
  template?: string;
}

export interface WoltPreviewItem {
  id?: string;
  name?: string;
  image?: WoltImage;
  price?: number;
  currency?: string;
}

export interface WoltUnitPrice {
  price?: number;
  unit?: string;
}

export interface WoltProductImage {
  url?: string;
  blurhash?: string;
}

export interface WoltProductTag {
  id?: string;
  label?: string;
  color?: string;
  decoration?: string;
  style?: {
    text_color?: string;
    background_color?: string;
  };
}

export interface WoltProductRestriction {
  type?: string;
  age_limit?: number;
}

/**
 * Full Wolt assortment-item payload. Mirrors what the consumer-assortment API
 * returns for a category's `items[]`. All fields optional — the schema is
 * undocumented and varies by product line (restaurant vs grocery).
 */
export interface WoltProductData {
  id?: string;
  name?: string;
  description?: string;
  price?: number;
  original_price?: number | null;
  currency?: string;

  unit_price?: WoltUnitPrice;
  unit_info?: string;

  barcode_gtin?: string | null;
  images?: WoltProductImage[];

  category_id?: string;
  tags?: WoltProductTag[];

  /** Present when the item is unavailable — contains reason text. */
  disabled_info?: unknown;

  restrictions?: WoltProductRestriction[];
  vat_percentage?: number;

  /** Catch-all for other fields (dietary tags, allergens, availability, etc.). */
  [key: string]: unknown;
}

export interface WoltShortDescriptionV2 {
  text?: string;
}

/**
 * Full Wolt venue payload as returned by the discover-restaurants endpoint.
 * Mirrors `raw_content` for Wolt-vendored stores. All fields are optional —
 * Wolt's schema is undocumented and shape varies per venue / over time.
 */
export interface WoltVenueData {
  id?: string;
  slug?: string;
  name?: string;
  short_description?: string;
  short_description_v2?: WoltShortDescriptionV2;
  address?: string;
  city?: string;
  country?: string;
  currency?: string;
  location?: [number, number];
  product_line?: string;
  franchise?: string;
  tags?: string[];
  categories?: string[];

  icon?: WoltImage | string;
  brand_image?: WoltImage | string;
  delivery_icon?: string;

  rating?: WoltRating;
  price_range?: number;

  online?: boolean;
  delivers?: boolean;
  delivery_within_time_range?: boolean;

  delivery_price?: string;
  delivery_price_int?: number;
  delivery_price_highlight?: boolean;
  delivery_highlight?: boolean;

  estimate?: number;
  estimate_range?: string;
  estimate_box?: WoltEstimateBox;

  badges?: unknown[];
  badges_v2?: WoltBadge[];
  promotions?: WoltPromotion[];
  promotions_for_telemetry?: unknown;

  show_wolt_plus?: boolean;
  show_zero_markup?: boolean;
  show_best_of_wolt?: boolean;

  venue_preview_items?: WoltPreviewItem[];
}
