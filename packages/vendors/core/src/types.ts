export type VendorId = 'wolt' | 'glovo' | 'bolt-food' | 'europroduct' | 'goodwill';

export type ProductLine = 'restaurant' | 'store' | 'grocery' | 'pharmacy' | 'other';

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface Venue {
  vendor: VendorId;
  id: string;
  slug: string;
  name: string;
  shortDescription?: string;
  address?: string;
  city?: string;
  country?: string;
  currency?: string;
  location?: Coordinates;
  rating?: { score?: number; volume?: number };
  priceRange?: number;
  deliveryPriceInt?: number;
  deliveryPriceText?: string;
  estimateMinutes?: number;
  estimateRange?: { min: number; max: number };
  online?: boolean;
  tags?: string[];
  categories?: string[];
  productLine?: ProductLine;
  iconUrl?: string;
  brandImageUrl?: string;
  raw?: unknown;
}

export interface AssortmentCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  imageUrl?: string;
  itemIds: string[];
  subcategories: AssortmentCategory[];
}

export interface Product {
  vendor: VendorId;
  id: string;
  name: string;
  description?: string;
  /** Integer minor units in the venue's currency (e.g. tetri for GEL). */
  price: number;
  originalPrice?: number;
  currency: string;
  unitPrice?: { price: number; unit: string };
  unitInfo?: string;
  gtin?: string | null;
  images: string[];
  categoryId?: string;
  categorySlug?: string;
  tags?: string[];
  disabled?: boolean;
  raw?: unknown;
}

export interface AssortmentIndex {
  venueSlug: string;
  assortmentId?: string;
  loadingStrategy?: string;
  primaryLanguage?: string;
  currency?: string;
  categories: AssortmentCategory[];
}

export interface CategoryPage {
  venueSlug: string;
  categorySlug: string;
  currency: string;
  items: Product[];
}

export interface VenueContent {
  vendor: VendorId;
  slug: string;
  raw: unknown;
}

export interface SearchVenuesInput {
  query: string;
  lat: number;
  lon: number;
}

export interface DiscoverVenuesInput {
  lat: number;
  lon: number;
}
