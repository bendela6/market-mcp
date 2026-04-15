import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@market/ui';
import { useItemsQuery } from '../../hooks/use-items-query.js';
import { parseSort } from '../../search-schemas.js';
import { PaginationControls } from '../../features/listing/pagination-controls.js';

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function ProductsListPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/products' });
  const [q, setQ] = useState(search.q ?? '');

  const { data, isLoading, error } = useItemsQuery({
    skip: search.skip,
    take: search.take,
    q: search.q,
    mode: search.mode,
    sort: parseSort(search.sort),
    vendor: search.vendor,
    storeIdOrSlug: search.storeIdOrSlug,
    minPriceMinor: search.minPriceMinor,
    maxPriceMinor: search.maxPriceMinor,
    available: search.available,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Products</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void nav({ to: '/products', search: (s) => ({ ...s, skip: 0, q: q.trim() || undefined }) });
        }}
      >
        <Input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}
      {error && <p className="text-destructive">{String(error)}</p>}
      {data && (
        <>
          <div className="grid gap-3">
            {data.data.length === 0 && <p className="text-muted-foreground">No results.</p>}
            {data.data.map((it) => (
              <Card key={it.id}>
                <CardHeader><CardTitle>
                  <a className="hover:underline" href={`/products/${it.slug}`}>{it.name}</a>
                </CardTitle></CardHeader>
                <CardContent className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{it.storeName} · {it.vendor}</span>
                  <span className="font-semibold">{formatMinor(it.priceMinor, it.currency)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationControls
            skip={data.meta.skip}
            take={data.meta.take}
            total={data.meta.total}
            onChange={(n) => void nav({ to: '/products', search: (s) => ({ ...s, ...n }) })}
          />
        </>
      )}
    </div>
  );
}
