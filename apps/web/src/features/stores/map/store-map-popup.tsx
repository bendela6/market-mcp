import { useEffect, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import { Link } from '@tanstack/react-router';
import type { StoreMapPoint } from '@market/contracts';
import { Badge } from '@market/ui';

interface Props {
  map:    mapboxgl.Map | null;
  point:  StoreMapPoint;
  onClose: () => void;
}

export function StoreMapPopup({ map, point, onClose }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    const reposition = () => {
      const p = map.project([point.location.lon, point.location.lat]);
      setPos({ x: p.x, y: p.y });
    };
    reposition();
    map.on('move', reposition);
    map.on('zoom', reposition);
    return () => {
      map.off('move', reposition);
      map.off('zoom', reposition);
    };
  }, [map, point.location.lon, point.location.lat]);

  if (!pos) return null;

  return (
    <div
      className="pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-md border bg-background p-3 shadow-lg"
      style={{ left: pos.x, top: pos.y, width: 240 }}
      role="dialog"
      aria-label={`${point.name} details`}
    >
      <button
        type="button"
        className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
      <h3 className="pr-4 text-sm font-semibold">{point.name}</h3>
      <div className="mt-1 flex flex-wrap gap-1">
        <Badge variant="secondary">{point.vendor}</Badge>
        {point.productLine && <Badge variant="outline">{point.productLine}</Badge>}
      </div>
      <Link
        to="/stores/$id"
        params={{ id: point.id }}
        className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
      >
        View store →
      </Link>
    </div>
  );
}
