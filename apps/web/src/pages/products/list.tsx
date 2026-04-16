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
import { useItemsQuery } from '../../hooks/use-items-query.js';
import { parseSort, type ItemListSearch } from '../../search-schemas.js';
import { PaginationControls } from '../../features/listing/pagination-controls.js';
import { ProductCard } from '../../features/products/product-card.js';

type ItemSortField = 'name' | 'priceMinor' | 'relevance';

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'relevance:desc', label: 'Relevance' },
  { value: 'name:asc',       label: 'Name (A–Z)' },
  { value: 'priceMinor:asc', label: 'Price: low to high' },
  { value: 'priceMinor:desc',label: 'Price: high to low' },
];

export function ProductsListPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/products' }) as ItemListSearch;
  const [q, setQ] = useState(search.q ?? '');
  const currentSort = search.sort ?? (search.q ? 'relevance:desc' : 'name:asc');

  const { data, isLoading, error } = useItemsQuery({
    skip: search.skip,
    take: search.take,
    q: search.q,
    mode: search.mode,
    sort: parseSort<ItemSortField>(currentSort),
    vendor: search.vendor,
    storeId: search.storeId,
    minPriceMinor: search.minPriceMinor,
    maxPriceMinor: search.maxPriceMinor,
    available: search.available,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Products</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            void nav({ to: '/products', search: { ...search, skip: 0, q: q.trim() || undefined } });
          }}
        >
          <Input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <Select
          value={currentSort}
          onValueChange={(value) =>
            void nav({ to: '/products', search: { ...search, skip: 0, sort: value } })
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-full" />
          ))}
        </div>
      )}
      {error && <p className="text-destructive">{String(error)}</p>}
      {data && (
        <>
          {data.data.length === 0 ? (
            <p className="text-muted-foreground">No results.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data.data.map((it) => (
                <ProductCard key={it.id} item={it} />
              ))}
            </div>
          )}
          <PaginationControls
            skip={data.meta.skip}
            take={data.meta.take}
            total={data.meta.total}
            onChange={(n) => void nav({ to: '/products', search: { ...search, ...n } })}
          />
        </>
      )}
    </div>
  );
}
