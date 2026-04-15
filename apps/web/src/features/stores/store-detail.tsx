import type { Store, WoltVenueData } from '@market/contracts';
import { DefaultStoreDetail, WoltStoreDetail } from './wolt-store-detail.js';

interface Props {
  store: Store;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function StoreDetail({ store, onRefresh, refreshing }: Props) {
  switch (store.vendor) {
    case 'wolt':
      return (
        <WoltStoreDetail
          store={store}
          data={(store.vendorData ?? {}) as WoltVenueData}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      );
    default:
      return (
        <DefaultStoreDetail store={store} onRefresh={onRefresh} refreshing={refreshing} />
      );
  }
}
