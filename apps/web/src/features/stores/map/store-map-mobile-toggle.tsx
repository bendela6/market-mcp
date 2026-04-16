import { useEffect, useState } from 'react';
import { cn } from '@market/ui';
import { StoreFilters, type StoreFiltersValue } from '../store-filters.js';

interface Props {
  view:      'map' | 'list';
  onView:    (view: 'map' | 'list') => void;
  filters:   StoreFiltersValue;
  onFilters: (next: StoreFiltersValue) => void;
}

export function StoreMapMobileToggle({ view, onView, filters, onFilters }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (view === 'list') setSheetOpen(false);
  }, [view]);

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b bg-background p-2 lg:hidden">
        <div role="tablist" className="inline-flex rounded-md border bg-muted p-0.5">
          {(['map', 'list'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => onView(v)}
              className={cn(
                'rounded px-3 py-1 text-sm capitalize',
                view === v ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {view === 'map' && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="rounded-md border bg-background px-3 py-1 text-sm"
          >
            Filters
          </button>
        )}
      </div>

      {sheetOpen && view === 'map' && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSheetOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-xl bg-background p-4 shadow-2xl lg:hidden">
            <div className="mx-auto mb-3 h-1 w-10 rounded bg-muted" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="text-sm font-medium text-primary"
              >
                Done
              </button>
            </div>
            <StoreFilters value={filters} onChange={onFilters} />
          </div>
        </>
      )}
    </>
  );
}
