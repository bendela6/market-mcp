import { useParams } from '@tanstack/react-router';
import { Skeleton } from '@market/ui';
import { useItem } from '../../hooks/use-item.js';
import { ProductDetail } from '../../features/products/product-detail.js';

export function ProductDetailPage() {
  const { id } = useParams({ from: '/products/$id' });
  const { data, isLoading, error } = useItem(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="mx-auto aspect-video w-full max-w-[910px]" />
        <div className="mx-auto w-full max-w-[910px] space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }
  if (error) return <p className="text-destructive">{String(error)}</p>;
  if (!data) return <p>Not found.</p>;

  return <ProductDetail item={data.item} />;
}
