import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@market/ui';
import { useStoresQuery } from '../../hooks/use-stores-query.js';
import { parseSort, type StoreListSearch } from '../../search-schemas.js';
import { PaginationControls } from '../../features/listing/pagination-controls.js';
import { StoreCard } from '../../features/stores/store-card.js';

type StoreSortField =
  | 'name'
  | 'vendor'
  | 'productLine'
  | 'lastSeenAt'
  | 'distance'
  | 'ratingScore'
  | 'popularity'
  | 'priceRange'
  | 'eta';

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'name:asc',         label: 'Name (A–Z)' },
  { value: 'popularity:desc',  label: 'Most popular' },
  { value: 'ratingScore:desc', label: 'Highest rated' },
  { value: 'distance:asc',     label: 'Nearest' },
  { value: 'eta:asc',          label: 'Fastest ETA' },
  { value: 'priceRange:asc',   label: 'Price: low to high' },
  { value: 'priceRange:desc',  label: 'Price: high to low' },
  { value: 'lastSeenAt:desc',  label: 'Recently seen' },
];

export function StoresListPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/stores' }) as StoreListSearch;
  const [q, setQ] = useState(search.q ?? '');
  const currentSort = search.sort ?? 'popularity:desc';

  const { data, isLoading, error } = useStoresQuery({
    skip: search.skip,
    take: search.take,
    q: search.q,
    sort: parseSort<StoreSortField>(currentSort),
    vendor: search.vendor,
    productLine: search.productLine,
    online: search.online,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Stores</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            void nav({ to: '/stores', search: { ...search, skip: 0, q: q.trim() || undefined } });
          }}
        >
          <Input placeholder="Search stores…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <Select
          value={currentSort}
          onValueChange={(value) =>
            void nav({ to: '/stores', search: { ...search, skip: 0, sort: value } })
          }
        >
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Sort by…" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      )}
      {error && <p className="text-destructive">{String(error)}</p>}
      {data && (
        <>
          {data.data.length === 0 ? (
            <p className="text-muted-foreground">No stores.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.data.map((s) => (
                <StoreCard key={s.id} store={s} />
              ))}
            </div>
          )}
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
