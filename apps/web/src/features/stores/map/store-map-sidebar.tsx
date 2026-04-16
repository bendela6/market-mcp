import type { StoreMapPoint } from '@market/contracts';
import { Skeleton } from '@market/ui';
import { StoreFilters, type StoreFiltersValue } from '../store-filters.js';
import { StoreMapRow } from './store-map-row.js';

interface Props {
  filters:    StoreFiltersValue;
  onFilters:  (next: StoreFiltersValue) => void;
  points:     StoreMapPoint[] | undefined;
  totalAll:   number | undefined;
  isLoading:  boolean;
  error:      unknown;
  selectedId: string | undefined;
  onSelect:   (id: string) => void;
}

export function StoreMapSidebar(props: Props) {
  const { filters, onFilters, points, totalAll, isLoading, error, selectedId, onSelect } = props;

  return (
    <aside className="flex h-full w-full flex-col border-r bg-background">
      <div className="border-b p-3">
        <StoreFilters value={filters} onChange={onFilters} />
      </div>

      <div className="border-b px-3 py-2 text-xs text-muted-foreground">
        {isLoading && !points
          ? 'Loading…'
          : `${points?.length ?? 0} ${(points?.length ?? 0) === 1 ? 'store' : 'stores'}`}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="p-3 text-sm text-destructive">{String(error)}</p>
        ) : null}
        {isLoading && !points && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {points && points.length === 0 && !isLoading && (
          <p className="p-3 text-sm text-muted-foreground">No stores match these filters.</p>
        )}
        {points && points.length > 0 && (
          <ul className="space-y-1 p-2">
            {points.map((p) => (
              <StoreMapRow
                key={p.id}
                point={p}
                selected={selectedId === p.id}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>

      {points && totalAll != null && totalAll > points.length && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing {points.length} of {totalAll} stores with a known location.
        </div>
      )}
    </aside>
  );
}
