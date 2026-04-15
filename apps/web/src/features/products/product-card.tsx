import type { Item, WoltProductData } from '@market/contracts';
import { DefaultProductCard, WoltProductCard } from './wolt-product-card.js';

export function ProductCard({ item }: { item: Item }) {
  switch (item.vendor) {
    case 'wolt':
      return (
        <WoltProductCard item={item} data={(item.vendorData ?? {}) as WoltProductData} />
      );
    default:
      return <DefaultProductCard item={item} />;
  }
}
