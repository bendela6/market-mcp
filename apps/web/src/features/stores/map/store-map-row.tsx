import { useEffect, useRef } from 'react';
import type { StoreMapPoint } from '@market/contracts';
import { Badge, cn } from '@market/ui';

interface Props {
  point:    StoreMapPoint;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function StoreMapRow({ point, selected, onSelect }: Props) {
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selected]);

  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={() => onSelect(point.id)}
        className={cn(
          'flex w-full flex-col items-start gap-0.5 rounded-md border-l-2 px-3 py-2 text-left text-sm',
          'transition-colors hover:bg-muted/60',
          selected
            ? 'border-primary bg-muted'
            : 'border-transparent',
        )}
        aria-current={selected || undefined}
      >
        <span className="font-medium">{point.name}</span>
        <span className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px]">{point.vendor}</Badge>
          {point.productLine && (
            <Badge variant="outline" className="text-[10px]">{point.productLine}</Badge>
          )}
          {point.online === false && (
            <Badge variant="destructive" className="text-[10px]">offline</Badge>
          )}
        </span>
      </button>
    </li>
  );
}
