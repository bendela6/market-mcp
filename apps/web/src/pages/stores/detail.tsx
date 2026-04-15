import { useParams } from '@tanstack/react-router';
import { Skeleton, toast } from '@market/ui';
import { useStore } from '../../hooks/use-store.js';
import { useRefreshStoreAssortment } from '../../hooks/use-store-mutations.js';
import { StoreDetail } from '../../features/stores/store-detail.js';

export function StoreDetailPage() {
  const { idOrSlug } = useParams({ from: '/stores/$idOrSlug' });
  const { data, isLoading, error } = useStore(idOrSlug);
  const refresh = useRefreshStoreAssortment(idOrSlug);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="aspect-square w-32 flex-shrink-0 sm:w-40" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-9 w-40 flex-shrink-0" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error) return <p className="text-destructive">{String(error)}</p>;
  if (!data) return <p>Not found.</p>;

  const onRefresh = () => {
    refresh.mutate(undefined, {
      onSuccess: (r) => {
        toast.success(
          `Scraped ${r.categories} categories, ${r.items} items${
            r.errors ? `, ${r.errors} errors` : ''
          }`,
        );
      },
      onError: (err) => {
        toast.error(String(err));
      },
    });
  };

  return (
    <StoreDetail store={data.store} onRefresh={onRefresh} refreshing={refresh.isPending} />
  );
}
