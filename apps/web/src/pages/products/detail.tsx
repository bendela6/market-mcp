import { useParams } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@market/ui';
import { useItem } from '../../hooks/use-item.js';

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function ProductDetailPage() {
  const { idOrSlug } = useParams({ from: '/products/$idOrSlug' });
  const { data, isLoading, error } = useItem(idOrSlug);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-destructive">{String(error)}</p>;
  if (!data) return <p>Not found.</p>;

  const it = data.item;
  return (
    <Card>
      <CardHeader><CardTitle>{it.name}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{it.storeName} · {it.vendor}</span>
          <span className="font-semibold">{formatMinor(it.priceMinor, it.currency)}</span>
        </div>
        {it.description && <p className="text-muted-foreground">{it.description}</p>}
      </CardContent>
    </Card>
  );
}
