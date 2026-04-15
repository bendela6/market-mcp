import { request } from 'undici';
import type {
  AssortmentCategory,
  AssortmentIndex,
  CategoryPage,
  Product,
  Venue,
  VenueContent,
} from '@market/vendor-core';
import type { WoltConfig } from './config.js';

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
  const loc = (v as { location?: { coordinates?: number[] } }).location?.coordinates;
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
    productLine: get('product_line') as Venue['productLine'],
    iconUrl: typeof icon === 'object' ? icon?.url : (icon as string | undefined),
    brandImageUrl: typeof brand === 'object' ? brand?.url : (brand as string | undefined),
    raw: v,
  };
}

function extractVenuesFromPages(data: unknown): Venue[] {
  const out: Venue[] = [];
  const seen = new Set<string>();
  const sections = (data as { sections?: unknown[] })?.sections ?? [];
  for (const sec of sections) {
    const items = (sec as { items?: unknown[] })?.items ?? [];
    for (const it of items) {
      const v = (it as { venue?: Record<string, unknown> }).venue;
      if (!v) continue;
      const n = normalizeVenue(v);
      if (n && !seen.has(n.slug)) {
        seen.add(n.slug);
        out.push(n);
      }
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
  searchVenues(q: string, lat?: number, lon?: number): Promise<Venue[]>;
  getVenueContent(slug: string): Promise<VenueContent>;
  getAssortmentIndex(slug: string): Promise<AssortmentIndex>;
  getCategoryItems(venueSlug: string, categorySlug: string, currency?: string): Promise<CategoryPage>;
}

export function createWoltClient(config: WoltConfig): WoltClient {
  return {
    async discoverVenues(lat = config.defaultLat, lon = config.defaultLon) {
      const url = `${config.restaurantApi}/v1/pages/restaurants?lat=${lat}&lon=${lon}`;
      return extractVenuesFromPages(await getJson(url, config));
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
}
