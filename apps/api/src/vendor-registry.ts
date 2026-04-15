import { createRegistry, type VendorRegistry, type Vendor, type VendorId } from '@market/vendor-core';
import { createWoltVendor } from '@market/vendor-wolt';
import { createGlovoVendor } from '@market/vendor-glovo';
import { createBoltFoodVendor } from '@market/vendor-bolt-food';
import { createEuroproductVendor } from '@market/vendor-europroduct';
import { createGoodwillVendor } from '@market/vendor-goodwill';
import { environment } from './environment.js';

function factoryFor(id: VendorId): Vendor {
  switch (id) {
    case 'wolt':
      return createWoltVendor({
        config: { defaultLat: environment.WOLT_LAT, defaultLon: environment.WOLT_LON },
      });
    case 'glovo':
      return createGlovoVendor();
    case 'bolt-food':
      return createBoltFoodVendor();
    case 'europroduct':
      return createEuroproductVendor();
    case 'goodwill':
      return createGoodwillVendor();
  }
}

let cached: VendorRegistry | null = null;

export function getVendorRegistry(): VendorRegistry {
  if (cached) return cached;
  const enabled = environment.ENABLED_VENDORS as VendorId[];
  cached = createRegistry(enabled.map(factoryFor));
  return cached;
}
