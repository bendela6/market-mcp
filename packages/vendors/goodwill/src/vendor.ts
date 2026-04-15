import type { Vendor } from '@market/vendor-core';
import { NotImplementedError } from '@market/vendor-core';

const ID = 'goodwill' as const;

export function createGoodwillVendor(): Vendor {
  const nope = (method: string): never => {
    throw new NotImplementedError(ID, method);
  };
  return {
    id: ID,
    displayName: 'Goodwill',
    defaultCurrency: 'GEL',
    searchVenues: async () => nope('searchVenues'),
    discoverVenues: async () => nope('discoverVenues'),
    getVenueContent: async () => nope('getVenueContent'),
    getAssortmentIndex: async () => nope('getAssortmentIndex'),
    getCategoryItems: async () => nope('getCategoryItems'),
  };
}
