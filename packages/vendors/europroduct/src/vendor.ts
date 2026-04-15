import type { Vendor } from '@market/vendor-core';
import { NotImplementedError } from '@market/vendor-core';

const ID = 'europroduct' as const;

export function createEuroproductVendor(): Vendor {
  const nope = (method: string): never => {
    throw new NotImplementedError(ID, method);
  };
  return {
    id: ID,
    displayName: 'Europroduct',
    defaultCurrency: 'GEL',
    searchVenues: async () => nope('searchVenues'),
    discoverVenues: async () => nope('discoverVenues'),
    getVenueContent: async () => nope('getVenueContent'),
    getAssortmentIndex: async () => nope('getAssortmentIndex'),
    getCategoryItems: async () => nope('getCategoryItems'),
  };
}
