import type { Store, WoltVenueData } from '@market/contracts';
import { WoltStoreCard, WoltStoreCardFallback } from './wolt-store-card.js';

export function StoreCard({ store }: { store: Store }) {
  switch (store.vendor) {
    case 'wolt':
      return (
        <WoltStoreCard store={store} data={(store.vendorData ?? {}) as WoltVenueData} />
      );
    default:
      return <WoltStoreCardFallback store={store} />;
  }
}
