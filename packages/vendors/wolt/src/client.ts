import { request } from 'undici';
import type {
  AssortmentCategory,
  AssortmentIndex,
  CategoryPage,
  Product,
  ProductLine,
  Venue,
  VenueContent,
} from '@market/vendor-core';
import { WOLT_STORE_CATEGORIES, type WoltConfig } from './config.js';

function headers(config: WoltConfig): Record<string, string> {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': config.userAgent,
    platform: 'Web',
    'app-language': config.language,
    'client-version': '1.16.93',
    clientversionnumber: '1.16.93',
    // base64 of "¤1,234.56" — Wolt's generic currency format hint
    'app-currency-format': 'wqQxLDIzNC41Ng==',
  };
}

/**
 * Wolt returns ~10 raw product_line strings (alcohol, electronics, florist, …).
 * The core ProductLine enum only has 5 buckets, so collapse anything that
 * isn't a direct match into 'store' (or 'other' for genuinely unknown values).
 * The original raw value is preserved on `Venue.raw` for downstream consumers.
 */
function normalizeProductLine(raw: unknown): ProductLine | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  switch (raw) {
    case 'restaurant':
      return 'restaurant';
    case 'grocery':
      return 'grocery';
    case 'pharmacy':
      return 'pharmacy';
    case 'store':
    case 'alcohol':
    case 'florist':
    case 'electronics':
    case 'home_and_diy':
    case 'toys_games_and_kids':
    case 'pet_supply':
    case 'general_merchandise':
    case 'health_and_beauty':
      return 'store';
    default:
      return 'other';
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson(url: string, config: WoltConfig): Promise<unknown> {
  const { statusCode, body } = await request(url, {
    method: 'GET',
    headers: headers(config),
    bodyTimeout: 30_000,
    headersTimeout: 30_000,
  });
  const text = await body.text();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Wolt GET ${url} → ${statusCode}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function postJson(url: string, payload: unknown, config: WoltConfig): Promise<unknown> {
  const { statusCode, body } = await request(url, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(payload),
    bodyTimeout: 30_000,
    headersTimeout: 30_000,
  });
  const text = await body.text();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Wolt POST ${url} → ${statusCode}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

function normalizeVenue(v: Record<string, unknown> | null): Venue | null {
  if (!v || typeof v !== 'object' || !('slug' in v)) return null;
  const rawLoc = (v as { location?: unknown }).location;
  // Wolt returns `location` as either a `[lon, lat]` tuple (discover/search
  // pages) or `{coordinates: [lon, lat]}` (legacy). Handle both.
  const loc: number[] | undefined = Array.isArray(rawLoc)
    ? (rawLoc as number[])
    : (rawLoc as { coordinates?: number[] } | undefined)?.coordinates;
  const get = <K extends string>(key: K): unknown => (v as Record<string, unknown>)[key];
  const rating = get('rating') as { score?: number; volume?: number } | undefined;
  const estimateRange = get('estimate_range') as { min: number; max: number } | undefined;
  const icon = get('icon') as { url?: string } | string | undefined;
  const brand = get('brand_image') as { url?: string } | string | undefined;
  return {
    vendor: 'wolt',
    id: String(get('id') ?? get('slug')),
    slug: String(get('slug')),
    name: (get('name') as string) ?? String(get('slug')),
    shortDescription:
      (get('short_description') as string | undefined) ??
      ((get('short_description_v2') as { text?: string } | undefined)?.text),
    address: get('address') as string | undefined,
    city: get('city') as string | undefined,
    country: get('country') as string | undefined,
    currency: get('currency') as string | undefined,
    location:
      Array.isArray(loc) && loc.length >= 2 ? { lon: loc[0] as number, lat: loc[1] as number } : undefined,
    rating: rating ? { score: rating.score, volume: rating.volume } : undefined,
    priceRange: get('price_range') as number | undefined,
    deliveryPriceInt: get('delivery_price_int') as number | undefined,
    deliveryPriceText: get('delivery_price') as string | undefined,
    estimateMinutes: get('estimate') as number | undefined,
    estimateRange: estimateRange ? { min: estimateRange.min, max: estimateRange.max } : undefined,
    online: get('online') as boolean | undefined,
    tags: get('tags') as string[] | undefined,
    categories: get('categories') as string[] | undefined,
    productLine: normalizeProductLine(get('product_line')),
    iconUrl: typeof icon === 'object' ? icon?.url : (icon as string | undefined),
    brandImageUrl: typeof brand === 'object' ? brand?.url : (brand as string | undefined),
    raw: v,
  };
}

function collectVenueObjects(data: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const sections = (data as { sections?: unknown[] })?.sections ?? [];
  for (const sec of sections) {
    const s = sec as Record<string, unknown>;
    // /v1/pages/restaurants and /v1/pages/front: items[].venue
    const items = (s.items as unknown[]) ?? [];
    for (const it of items) {
      const v = (it as { venue?: Record<string, unknown> }).venue;
      if (v) out.push(v);
    }
    // /v1/pages/category/{slug}: each `venue-menu-item-list` section carries
    // a single venue at section.venue.venue (the outer `venue` is a wrapper
    // with template:'venue' and the actual record nested inside).
    const wrapper = s.venue as { venue?: Record<string, unknown> } | undefined;
    if (wrapper?.venue) out.push(wrapper.venue);
  }
  return out;
}

function extractVenuesFromPages(data: unknown): Venue[] {
  const out: Venue[] = [];
  const seen = new Set<string>();
  for (const v of collectVenueObjects(data)) {
    const n = normalizeVenue(v);
    if (n && !seen.has(n.slug)) {
      seen.add(n.slug);
      out.push(n);
    }
  }
  return out;
}

function normalizeCategory(c: Record<string, unknown>): AssortmentCategory {
  const subs = (c.subcategories ?? []) as Record<string, unknown>[];
  const images = c.images as Array<{ url?: string }> | undefined;
  return {
    id: String(c.id),
    name: (c.name as string) ?? String(c.slug),
    slug: String(c.slug ?? c.id),
    description: (c.description as string) || undefined,
    parentId: c.parent_id ? String(c.parent_id) : undefined,
    imageUrl: images?.[0]?.url,
    itemIds: ((c.item_ids as unknown[]) ?? []).map((x) => String(x)),
    subcategories: subs.map(normalizeCategory),
  };
}

function normalizeItem(
  raw: Record<string, unknown>,
  currency: string,
  categorySlug: string | undefined,
): Product {
  const unitPrice = raw.unit_price as { price: number; unit: string } | undefined;
  const images = (raw.images ?? []) as Array<{ url?: string }>;
  return {
    vendor: 'wolt',
    id: String(raw.id),
    name: (raw.name as string) ?? '',
    description: (raw.description as string) || undefined,
    price: Number(raw.price ?? 0),
    originalPrice: raw.original_price != null ? Number(raw.original_price) : undefined,
    currency,
    unitPrice: unitPrice ? { price: Number(unitPrice.price), unit: String(unitPrice.unit) } : undefined,
    unitInfo: (raw.unit_info as string) ?? undefined,
    gtin: (raw.barcode_gtin as string | null | undefined) ?? null,
    images: images.map((i) => i.url).filter((u): u is string => !!u),
    categoryId: raw.category_id ? String(raw.category_id) : undefined,
    categorySlug,
    tags: raw.tags as string[] | undefined,
    disabled: !!raw.disabled_info,
    raw,
  };
}

export interface WoltClient {
  discoverVenues(lat?: number, lon?: number): Promise<Venue[]>;
  discoverCategoryVenues(categorySlug: string, lat?: number, lon?: number): Promise<Venue[]>;
  searchVenues(q: string, lat?: number, lon?: number): Promise<Venue[]>;
  getVenueContent(slug: string): Promise<VenueContent>;
  getAssortmentIndex(slug: string): Promise<AssortmentIndex>;
  getCategoryItems(venueSlug: string, categorySlug: string, currency?: string): Promise<CategoryPage>;
}

export function createWoltClient(config: WoltConfig): WoltClient {
  const client: WoltClient = {
    async discoverVenues(lat = config.defaultLat, lon = config.defaultLon) {
      const seen = new Set<string>();
      const merged: Venue[] = [];

      const pushAll = (vs: Venue[]) => {
        for (const v of vs) {
          if (seen.has(v.slug)) continue;
          seen.add(v.slug);
          merged.push(v);
        }
      };

      // Restaurants live on a dedicated GET endpoint that returns the full
      // restaurant universe in one shot.
      const restaurantsUrl = `${config.restaurantApi}/v1/pages/restaurants?lat=${lat}&lon=${lon}`;
      pushAll(extractVenuesFromPages(await getJson(restaurantsUrl, config)));

      // Stores (groceries, alcohol, pharmacy, electronics, ...) each live on
      // their own POST page. Walk them sequentially with a small throttle.
      for (const slug of WOLT_STORE_CATEGORIES) {
        await sleep(config.discoverThrottleMs);
        try {
          pushAll(await client.discoverCategoryVenues(slug, lat, lon));
        } catch (err) {
          // One bad category shouldn't kill the whole discovery pass.
          console.error(`[wolt] discoverCategoryVenues(${slug}) failed: ${String(err).slice(0, 200)}`);
        }
      }

      return merged;
    },
    async discoverCategoryVenues(categorySlug, lat = config.defaultLat, lon = config.defaultLon) {
      const url = `${config.restaurantApi}/v1/pages/category/${encodeURIComponent(categorySlug)}`;
      return extractVenuesFromPages(await postJson(url, { lat, lon }, config));
    },
    async searchVenues(q, lat = config.defaultLat, lon = config.defaultLon) {
      const url = `${config.restaurantApi}/v1/pages/search`;
      return extractVenuesFromPages(await postJson(url, { q, target: null, lat, lon }, config));
    },
    async getVenueContent(slug) {
      const url = `${config.consumerApi}/consumer-api/venue-content-api/v3/web/venue-content/slug/${encodeURIComponent(slug)}`;
      const raw = await getJson(url, config);
      return { vendor: 'wolt', slug, raw };
    },
    async getAssortmentIndex(slug) {
      const url = `${config.consumerApi}/consumer-api/consumer-assortment/v1/venues/slug/${encodeURIComponent(slug)}/assortment`;
      const data = (await getJson(url, config)) as {
        assortment_id?: string;
        loading_strategy?: string;
        primary_language?: string;
        currency?: string;
        categories?: Record<string, unknown>[];
      };
      return {
        venueSlug: slug,
        assortmentId: data.assortment_id,
        loadingStrategy: data.loading_strategy,
        primaryLanguage: data.primary_language,
        currency: data.currency,
        categories: (data.categories ?? []).map(normalizeCategory),
      };
    },
    async getCategoryItems(venueSlug, categorySlug, currency = 'GEL') {
      const url = `${config.consumerApi}/consumer-api/consumer-assortment/v1/venues/slug/${encodeURIComponent(venueSlug)}/assortment/categories/slug/${encodeURIComponent(categorySlug)}?language=${encodeURIComponent(config.language)}`;
      const data = (await getJson(url, config)) as {
        currency?: string;
        items?: Record<string, unknown>[];
      };
      const resolvedCurrency = data.currency ?? currency;
      const items = (data.items ?? []).map((raw) => normalizeItem(raw, resolvedCurrency, categorySlug));
      return { venueSlug, categorySlug, currency: resolvedCurrency, items };
    },
  };
  return client;
}
