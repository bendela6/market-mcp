import type {
  AssortmentIndex,
  CategoryPage,
  DiscoverVenuesInput,
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
  getVenueContent(slug: string): Promise<VenueContent>;
  getAssortmentIndex(slug: string): Promise<AssortmentIndex>;
  getCategoryItems(venueSlug: string, categorySlug: string): Promise<CategoryPage>;
}
