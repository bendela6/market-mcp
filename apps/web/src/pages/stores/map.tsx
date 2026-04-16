import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { StoreMapPoint } from '@market/contracts';
import { useStoresMapQuery } from '../../hooks/use-stores-map-query.js';
import type { StoreMapSearch } from '../../search-schemas.js';
import { StoreMap } from '../../features/stores/map/store-map.js';
import { StoreMapPopup } from '../../features/stores/map/store-map-popup.js';
import { StoreMapSidebar } from '../../features/stores/map/store-map-sidebar.js';
import { StoreMapMobileToggle } from '../../features/stores/map/store-map-mobile-toggle.js';
import type { StoreFiltersValue } from '../../features/stores/store-filters.js';

const SIDEBAR_PX = 384;

export default function StoresMapPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/stores/map' }) as StoreMapSearch;

  const filters = useMemo<StoreFiltersValue>(
    () => ({
      q:           search.q,
      vendor:      search.vendor,
      productLine: search.productLine,
      online:      search.online,
    }),
    [search.q, search.vendor, search.productLine, search.online],
  );

  const view: 'map' | 'list' = search.view ?? 'map';

  const { data, isLoading, error } = useStoresMapQuery(filters);

  const points: StoreMapPoint[] | undefined = data?.data;
  const totalAll = data?.meta.totalWithoutLocationFilter;

  const updateSearch = useCallback(
    (patch: Partial<StoreMapSearch>) => {
      void nav({ to: '/stores/map', search: { ...search, ...patch } });
    },
    [nav, search],
  );

  const onFilters = useCallback(
    (next: StoreFiltersValue) => {
      updateSearch({ ...next, selected: undefined });
    },
    [updateSearch],
  );

  const onSelect = useCallback(
    (id: string | undefined) => updateSearch({ selected: id }),
    [updateSearch],
  );

  useEffect(() => {
    if (!points || !search.selected) return;
    if (!points.some((p) => p.id === search.selected)) {
      updateSearch({ selected: undefined });
    }
  }, [points, search.selected, updateSearch]);

  const onView = useCallback(
    (next: 'map' | 'list') => updateSearch({ view: next }),
    [updateSearch],
  );

  const [mapRef, setMapRef] = useState<import('mapbox-gl').Map | null>(null); // eslint-disable-line @typescript-eslint/consistent-type-imports
  const selectedPoint = points?.find((p) => p.id === search.selected);

  return (
    <div className="-mx-6 -my-8 flex h-[calc(100vh-4rem)] flex-col">
      <StoreMapMobileToggle view={view} onView={onView} filters={filters} onFilters={onFilters} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={view === 'map' ? 'hidden h-full w-full lg:flex lg:w-96' : 'flex h-full w-full lg:flex lg:w-96'}>
          <StoreMapSidebar
            filters={filters}
            onFilters={onFilters}
            points={points}
            totalAll={totalAll}
            isLoading={isLoading}
            error={error}
            selectedId={search.selected}
            onSelect={onSelect}
          />
        </div>

        <div className={view === 'list' ? 'relative hidden flex-1 lg:block' : 'relative block flex-1'}>
          <StoreMap
            points={points ?? []}
            selectedId={search.selected}
            onSelect={onSelect}
            sidebarPaddingPx={SIDEBAR_PX}
            onMapReady={setMapRef}
          />
          {selectedPoint && (
            <StoreMapPopup map={mapRef} point={selectedPoint} onClose={() => onSelect(undefined)} />
          )}
        </div>
      </div>
    </div>
  );
}
