import { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { StoreMapPoint } from '@market/contracts';
import { environment } from '../../../environment.js';
import { useStoreMapMarkers } from './store-map-markers.js';

interface Props {
  points:        StoreMapPoint[];
  selectedId:    string | undefined;
  onSelect:      (id: string | undefined) => void;
  /** Approximate left padding (in px) when flying to a point so the popup isn't covered. */
  sidebarPaddingPx?: number;
  /** Called once the map instance is created, and again with null on unmount. */
  onMapReady?: (map: mapboxgl.Map | null) => void;
}

export function StoreMap({ points, selectedId, onSelect, sidebarPaddingPx = 0, onMapReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const initialCenter = useMemo<[number, number]>(
    () => [environment.VITE_DEFAULT_LON, environment.VITE_DEFAULT_LAT],
    [],
  );

  const hasToken = environment.VITE_MAPBOX_TOKEN.length > 0;

  useEffect(() => {
    if (!hasToken || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = environment.VITE_MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: initialCenter,
      zoom: 11,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    onMapReady?.(map);
    return () => {
      onMapReady?.(null);
      map.remove();
      mapRef.current = null;
    };
  }, [hasToken, initialCenter, onMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handle = () => map.resize();
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  useStoreMapMarkers({
    map: mapRef.current,
    points,
    selectedId,
    onSelect,
    sidebarPaddingPx,
  });

  if (!hasToken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-center text-sm text-muted-foreground">
        <div className="max-w-sm space-y-2 px-4">
          <p className="font-medium text-foreground">Map view requires a Mapbox token.</p>
          <p>
            Set <code className="rounded bg-background px-1">VITE_MAPBOX_TOKEN</code> in your env.
            See <code className="rounded bg-background px-1">.env.example</code> for details.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" aria-label="Map of stores" role="application" />;
}
