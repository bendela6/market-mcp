import type { Item, WoltProductData } from '@market/contracts';
import { DefaultProductDetail, WoltProductDetail } from './wolt-product-detail.js';

export function ProductDetail({ item }: { item: Item }) {
  switch (item.vendor) {
    case 'wolt':
      return (
        <WoltProductDetail item={item} data={(item.vendorData ?? {}) as WoltProductData} />
      );
    default:
      return <DefaultProductDetail item={item} />;
  }
}
