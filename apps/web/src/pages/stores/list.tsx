import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@market/ui';
import { useStoresQuery } from '../../hooks/use-stores-query.js';
import { parseSort, type StoreListSearch } from '../../search-schemas.js';
import { PaginationControls } from '../../features/listing/pagination-controls.js';

export function StoresListPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/stores' }) as StoreListSearch;
  const [q, setQ] = useState(search.q ?? '');

  const { data, isLoading, error } = useStoresQuery({
    skip: search.skip,
    take: search.take,
    q: search.q,
    sort: parseSort<'name' | 'vendor' | 'productLine' | 'lastSeenAt'>(search.sort),
    vendor: search.vendor,
    productLine: search.productLine,
    online: search.online,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Stores</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void nav({ to: '/stores', search: { ...search, skip: 0, q: q.trim() || undefined } });
        }}
      >
        <Input placeholder="Search stores…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>}
      {error && <p className="text-destructive">{String(error)}</p>}
      {data && (
        <>
          <div className="grid gap-3">
            {data.data.length === 0 && <p className="text-muted-foreground">No stores.</p>}
            {data.data.map((s) => (
              <Card key={s.id}>
                <CardHeader><CardTitle>
                  <a className="hover:underline" href={`/stores/${s.slug}`}>{s.name}</a>
                </CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {s.vendor} · {s.productLine ?? '—'} · {s.online ? 'online' : 'offline'}
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationControls
            skip={data.meta.skip}
            take={data.meta.take}
            total={data.meta.total}
            onChange={(n) => void nav({ to: '/stores', search: { ...search, ...n } })}
          />
        </>
      )}
    </div>
  );
}
