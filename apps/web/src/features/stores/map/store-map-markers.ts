import { useEffect, useRef } from 'react';
import type mapboxgl from 'mapbox-gl';
import type { GeoJSONSource } from 'mapbox-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { StoreMapPoint } from '@market/contracts';

const SOURCE_ID = 'stores';
const CLUSTERS_LAYER = 'stores-clusters';
const CLUSTER_COUNT_LAYER = 'stores-cluster-count';
const POINT_LAYER = 'stores-points';

interface FeatureProps {
  id:     string;
  vendor: string;
  name:   string;
}

function pointsToGeoJSON(points: StoreMapPoint[]): FeatureCollection<Point, FeatureProps> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      id:   p.id,
      geometry: { type: 'Point', coordinates: [p.location.lon, p.location.lat] },
      properties: { id: p.id, vendor: p.vendor, name: p.name },
    })),
  };
}

interface Args {
  map:              mapboxgl.Map | null;
  points:           StoreMapPoint[];
  selectedId:       string | undefined;
  onSelect:         (id: string | undefined) => void;
  sidebarPaddingPx: number;
}

export function useStoreMapMarkers({ map, points, selectedId, onSelect, sidebarPaddingPx }: Args) {
  const layersInitialized = useRef(false);

  useEffect(() => {
    if (!map) return;

    const setup = () => {
      if (layersInitialized.current || map.getSource(SOURCE_ID)) return;

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      map.addLayer({
        id: CLUSTERS_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#94a3b8', 25,
            '#64748b', 100,
            '#334155',
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            16, 25,
            22, 100,
            28,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match', ['get', 'vendor'],
            'wolt',        '#00C2E8',
            'glovo',       '#FFC244',
            'bolt-food',   '#34D186',
            'europroduct', '#7C3AED',
            'goodwill',    '#F97316',
            /* default */  '#64748b',
          ],
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 9,
            6,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      map.on('click', CLUSTERS_LAYER, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.['cluster_id'] as number | undefined;
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        if (clusterId == null) return;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          const geom = feature.geometry as Point;
          map.easeTo({ center: geom.coordinates as [number, number], zoom });
        });
      });

      map.on('click', POINT_LAYER, (e) => {
        const id = e.features?.[0]?.properties?.['id'] as string | undefined;
        if (id) onSelect(id);
      });

      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [POINT_LAYER, CLUSTERS_LAYER],
        });
        if (hits.length === 0) onSelect(undefined);
      });

      for (const layer of [CLUSTERS_LAYER, POINT_LAYER]) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }

      layersInitialized.current = true;
    };

    if (map.isStyleLoaded()) setup();
    else map.once('load', setup);
  }, [map, onSelect]);

  useEffect(() => {
    if (!map) return;
    const apply = () => {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData(pointsToGeoJSON(points));
    };
    if (map.isStyleLoaded() && layersInitialized.current) apply();
    else map.once('idle', apply);
  }, [map, points]);

  const prevSelectedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      const prev = prevSelectedRef.current;
      if (prev) {
        map.setFeatureState({ source: SOURCE_ID, id: prev }, { selected: false });
      }
      if (selectedId) {
        map.setFeatureState({ source: SOURCE_ID, id: selectedId }, { selected: true });
        const point = points.find((p) => p.id === selectedId);
        if (point) {
          map.easeTo({
            center: [point.location.lon, point.location.lat],
            zoom: Math.max(map.getZoom(), 13),
            padding: { left: sidebarPaddingPx, top: 0, right: 0, bottom: 0 },
          });
        }
      }
      prevSelectedRef.current = selectedId;
    };
    if (map.isStyleLoaded() && layersInitialized.current) apply();
    else map.once('idle', apply);
  }, [map, selectedId, points, sidebarPaddingPx]);
}
