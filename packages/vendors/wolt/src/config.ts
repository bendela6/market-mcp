export interface WoltConfig {
  restaurantApi: string;
  consumerApi: string;
  userAgent: string;
  language: string;
  defaultLat: number;
  defaultLon: number;
}

export const WOLT_DEFAULTS: Readonly<WoltConfig> = Object.freeze({
  restaurantApi: 'https://restaurant-api.wolt.com',
  consumerApi: 'https://consumer-api.wolt.com',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  language: 'en',
  defaultLat: 41.7151,
  defaultLon: 44.8271,
});
