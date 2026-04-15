import type { Vendor } from '@market/vendor-core';
import { createWoltClient } from './client.js';
import { WOLT_DEFAULTS, type WoltConfig } from './config.js';

export interface CreateWoltVendorOptions {
  config?: Partial<WoltConfig>;
}

export function createWoltVendor(options: CreateWoltVendorOptions = {}): Vendor {
  const config: WoltConfig = { ...WOLT_DEFAULTS, ...options.config };
  const client = createWoltClient(config);
  return {
    id: 'wolt',
    displayName: 'Wolt',
    defaultCurrency: 'GEL',
    searchVenues: ({ query, lat, lon }) => client.searchVenues(query, lat, lon),
    discoverVenues: ({ lat, lon }) => client.discoverVenues(lat, lon),
    searchItems: ({ query, lat, lon }) => client.searchItems(query, lat, lon),
    getVenueContent: (slug) => client.getVenueContent(slug),
    getAssortmentIndex: (slug) => client.getAssortmentIndex(slug),
    getCategoryItems: (venueSlug, categorySlug) => client.getCategoryItems(venueSlug, categorySlug),
  };
}
