import { useState } from 'react';
import type { Item, WoltProductData, WoltProductImage, WoltProductTag } from '@market/contracts';
import { Badge } from '@market/ui';

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

function DetailImage({ src, name }: { src: string | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/20 text-muted-foreground">
        <span className="text-5xl font-semibold">{initials(name) || '?'}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      className="h-full w-full object-contain"
    />
  );
}

function Thumb({
  src,
  alt,
  active,
  onClick,
}: {
  src: string;
  alt: string;
  active: boolean;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'h-16 w-16 flex-shrink-0 overflow-hidden rounded border transition ' +
        (active ? 'border-primary ring-2 ring-primary/30' : 'border-muted hover:border-foreground/30')
      }
    >
      {failed ? (
        <div className="h-full w-full bg-muted" />
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </button>
  );
}

function TagBadge({ tag, index }: { tag: WoltProductTag; index: number }) {
  if (!tag.label) return null;
  const bg = tag.style?.background_color;
  const fg = tag.style?.text_color;
  return (
    <Badge
      key={tag.id ?? `${tag.label}-${index}`}
      variant="outline"
      className="text-xs"
      style={bg || fg ? { backgroundColor: bg, color: fg, borderColor: bg } : undefined}
    >
      {tag.label}
    </Badge>
  );
}

interface Props {
  item: Item;
  data: WoltProductData;
}

export function WoltProductDetail({ item, data }: Props) {
  const images = (data.images ?? []).map(imageUrl).filter((u): u is string => !!u);
  const fallbackImage = item.imageUrl ? [item.imageUrl] : [];
  const gallery = images.length > 0 ? images : fallbackImage;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = gallery[selectedIdx];

  const description = data.description ?? item.description;
  const hasDiscount =
    data.original_price != null && data.original_price > 0 && data.original_price > item.priceMinor;
  const savings = hasDiscount ? data.original_price! - item.priceMinor : 0;
  const unitPriceValue = data.unit_price?.price;
  const unitPriceText =
    unitPriceValue != null
      ? `${formatMinor(unitPriceValue, item.currency)} / ${data.unit_price?.unit ?? 'unit'}`
      : undefined;
  const tags: WoltProductTag[] = data.tags ?? [];
  const restrictions = data.restrictions ?? [];
  const gtin = data.barcode_gtin ?? item.gtin;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="relative mx-auto aspect-video w-full max-w-[910px] overflow-hidden rounded-lg border bg-muted">
          <DetailImage src={selected} name={item.name} />
          {!item.available && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-medium">
              unavailable
            </div>
          )}
        </div>
        {gallery.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {gallery.map((url, i) => (
              <Thumb
                key={url}
                src={url}
                alt={`${item.name} ${i + 1}`}
                active={i === selectedIdx}
                onClick={() => setSelectedIdx(i)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-[910px] space-y-4">
        <div className="space-y-1">
          <a
            href={`/stores/${item.storeSlug}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            {item.storeName}
          </a>
          <h1 className="text-2xl font-bold leading-tight">{item.name}</h1>
          {data.unit_info && (
            <p className="text-sm text-muted-foreground">{data.unit_info}</p>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <TagBadge key={t.id ?? `${t.label}-${i}`} tag={t} index={i} />
            ))}
          </div>
        )}

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">
              {formatMinor(item.priceMinor, item.currency)}
            </span>
            {hasDiscount && (
              <span className="text-lg text-muted-foreground line-through">
                {formatMinor(data.original_price!, item.currency)}
              </span>
            )}
            {hasDiscount && (
              <Badge>
                save {formatMinor(savings, item.currency)}
              </Badge>
            )}
          </div>
          {unitPriceText && (
            <p className="mt-1 text-sm text-muted-foreground">{unitPriceText}</p>
          )}
        </div>

        {description && (
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{description}</p>
          </div>
        )}

        {restrictions.length > 0 && (
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Restrictions
            </h2>
            <ul className="text-sm">
              {restrictions.map((r, i) => (
                <li key={`${r.type ?? 'r'}-${i}`}>
                  {r.type}
                  {r.age_limit != null && ` (${r.age_limit}+ only)`}
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Vendor</dt>
          <dd>{item.vendor}</dd>
          {gtin && (
            <>
              <dt className="text-muted-foreground">GTIN</dt>
              <dd className="font-mono">{gtin}</dd>
            </>
          )}
          {data.vat_percentage != null && (
            <>
              <dt className="text-muted-foreground">VAT</dt>
              <dd>{data.vat_percentage}%</dd>
            </>
          )}
          <dt className="text-muted-foreground">Availability</dt>
          <dd>{item.available ? 'Available' : 'Unavailable'}</dd>
        </dl>
      </div>
    </div>
  );
}

export function DefaultProductDetail({ item }: { item: Item }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h1 className="text-2xl font-bold">{item.name}</h1>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          {item.storeName} · {item.vendor}
        </span>
        <span className="font-semibold">{formatMinor(item.priceMinor, item.currency)}</span>
      </div>
      {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
    </div>
  );
}
