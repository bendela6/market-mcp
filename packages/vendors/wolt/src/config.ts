export interface WoltConfig {
  restaurantApi: string;
  consumerApi: string;
  userAgent: string;
  language: string;
  defaultLat: number;
  defaultLon: number;
  /** Min delay between successive Wolt discovery calls when walking categories. */
  discoverThrottleMs: number;
}

export const WOLT_DEFAULTS: Readonly<WoltConfig> = Object.freeze({
  restaurantApi: 'https://restaurant-api.wolt.com',
  consumerApi: 'https://consumer-api.wolt.com',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  language: 'en',
  defaultLat: 41.7151,
  defaultLon: 44.8271,
  discoverThrottleMs: 400,
});

/**
 * Wolt's web UI splits venues into root categories. `/v1/pages/restaurants` only
 * returns restaurant-product_line venues; everything else (Wolt Markets, SPAR,
 * Carrefour, pharmacies, etc.) lives behind `POST /v1/pages/category/{slug}`.
 */
export const WOLT_STORE_CATEGORIES: readonly string[] = Object.freeze([
  'groceries',
  'alcohol',
  'health-and-wellbeing',
  'beauty-and-care',
  'pet-supply',
  'electronics',
  'toys-kids-and-baby',
  'home-and-diy',
  'flowers',
  'hobbies-and-leisure',
  'apparel',
  'x-rated',
  'services',
]);
