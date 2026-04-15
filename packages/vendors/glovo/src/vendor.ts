import type { Vendor } from '@market/vendor-core';
import { NotImplementedError } from '@market/vendor-core';

const ID = 'glovo' as const;

export function createGlovoVendor(): Vendor {
  const nope = (method: string): never => {
    throw new NotImplementedError(ID, method);
  };
  return {
    id: ID,
    displayName: 'Glovo',
    defaultCurrency: 'GEL',
    searchVenues: async () => nope('searchVenues'),
    discoverVenues: async () => nope('discoverVenues'),
    getVenueContent: async () => nope('getVenueContent'),
    getAssortmentIndex: async () => nope('getAssortmentIndex'),
    getCategoryItems: async () => nope('getCategoryItems'),
  };
}
