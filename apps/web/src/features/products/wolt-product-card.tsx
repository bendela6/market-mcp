import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { Item, WoltProductData, WoltProductImage, WoltProductTag } from '@market/contracts';
import { WEB_PATHS } from '@market/contracts';
import { Badge, Card } from '@market/ui';

function imageUrl(img: WoltProductImage | string | undefined): string | undefined {
  if (!img) return undefined;
  if (typeof img === 'string') return img;
  return img.url;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function formatMinor(minor: number, currency: string): string {
  const sym = currency === 'GEL' ? '₾' : currency;
  return `${(minor / 100).toFixed(2)} ${sym}`;
}

function ProductImage({ src, name }: { src: string | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/20 text-muted-foreground">
        <span className="text-2xl font-semibold">{initials(name) || '?'}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
    />
  );
}

interface Props {
  item: Item;
  data: WoltProductData;
}

export function WoltProductCard({ item, data }: Props) {
  const hero = imageUrl(data.images?.[0]) ?? item.imageUrl;
  const description = data.description ?? item.description;
  const hasDiscount =
    data.original_price != null && data.original_price > 0 && data.original_price > item.priceMinor;
  const unitPrice = data.unit_price
    ? `${formatMinor(data.unit_price.price ?? 0, item.currency)} / ${data.unit_price.unit ?? 'unit'}`
    : undefined;
  const tags: WoltProductTag[] = data.tags ?? [];

  return (
    <Link
      to={WEB_PATHS.productDetail}
      params={{ id: item.id }}
      className="group block overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        <ProductImage src={hero} name={item.name} />
        {!item.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm font-medium">
            unavailable
          </div>
        )}
        {hasDiscount && (
          <Badge className="absolute left-2 top-2 shadow">
            {formatMinor(data.original_price! - item.priceMinor, item.currency)} off
          </Badge>
        )}
      </div>

      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{item.name}</h3>
        {description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
        )}
        <div className="flex items-baseline gap-2 pt-1">
          <span className="text-sm font-semibold">
            {formatMinor(item.priceMinor, item.currency)}
          </span>
          {hasDiscount && (
            <span className="text-xs text-muted-foreground line-through">
              {formatMinor(data.original_price!, item.currency)}
            </span>
          )}
        </div>
        {(unitPrice || data.unit_info) && (
          <p className="text-[11px] text-muted-foreground">{unitPrice ?? data.unit_info}</p>
        )}
        <p className="line-clamp-1 text-[11px] text-muted-foreground">
          {item.storeName}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.slice(0, 3).map((t, i) => {
              const label = t.label;
              if (!label) return null;
              const bg = t.style?.background_color;
              const fg = t.style?.text_color;
              return (
                <Badge
                  key={t.id ?? `${label}-${i}`}
                  variant="outline"
                  className="text-[10px]"
                  style={bg || fg ? { backgroundColor: bg, color: fg, borderColor: bg } : undefined}
                >
                  {label}
                </Badge>
              );
            })}
          </div>
        )}
      </div>
    </Link>
  );
}

export function DefaultProductCard({ item }: { item: Item }) {
  return (
    <Card className="p-3">
      <div className="font-semibold">{item.name}</div>
      <div className="text-xs text-muted-foreground">
        {item.storeName} · {item.vendor}
      </div>
      <div className="mt-1 text-sm font-semibold">
        {formatMinor(item.priceMinor, item.currency)}
      </div>
    </Card>
  );
}
