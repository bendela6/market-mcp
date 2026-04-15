import type {
  AssortmentIndex,
  CategoryPage,
  DiscoverVenuesInput,
  SearchItemHit,
  SearchItemsInput,
  SearchVenuesInput,
  Venue,
  VenueContent,
  VendorId,
} from './types.js';

export interface Vendor {
  readonly id: VendorId;
  readonly displayName: string;
  readonly defaultCurrency: string;

  searchVenues(input: SearchVenuesInput): Promise<Venue[]>;
  discoverVenues(input: DiscoverVenuesInput): Promise<Venue[]>;
  /**
   * Vendor-wide product search. Optional — not every vendor exposes one.
   * Callers should feature-check before invoking.
   */
  searchItems?(input: SearchItemsInput): Promise<SearchItemHit[]>;
  getVenueContent(slug: string): Promise<VenueContent>;
  getAssortmentIndex(slug: string): Promise<AssortmentIndex>;
  getCategoryItems(venueSlug: string, categorySlug: string): Promise<CategoryPage>;
}
