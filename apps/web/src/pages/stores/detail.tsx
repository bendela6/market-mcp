import { useParams } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@market/ui';
import { useStore } from '../../hooks/use-store.js';

export function StoreDetailPage() {
  const { idOrSlug } = useParams({ from: '/stores/$idOrSlug' });
  const { data, isLoading, error } = useStore(idOrSlug);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive">{String(error)}</p>;
  if (!data) return <p>Not found.</p>;

  const s = data.store;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{s.name}</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>Vendor: {s.vendor}</div>
          <div>Slug: {s.slug}</div>
          <div>Address: {s.address ?? '—'}</div>
          <div>Status: {s.online ? 'online' : 'offline'}</div>
        </CardContent>
      </Card>
    </div>
  );
}
