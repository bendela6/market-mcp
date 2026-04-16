import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { Store, WoltVenueData, WoltImage } from '@market/contracts';
import { WEB_PATHS } from '@market/contracts';
import { Badge, Card } from '@market/ui';

function imageUrl(img: WoltImage | string | undefined): string | undefined {
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

interface PlaceholderProps {
  name: string;
  className?: string;
}

function StorePlaceholder({ name, className }: PlaceholderProps) {
  return (
    <div
      className={
        'flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/20 text-muted-foreground ' +
        (className ?? '')
      }
      aria-label={`${name} placeholder`}
    >
      <span className="text-2xl font-semibold">{initials(name) || '?'}</span>
    </div>
  );
}

interface HeroProps {
  src: string | undefined;
  alt: string;
}

function HeroImage({ src, alt }: HeroProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <StorePlaceholder name={alt} />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
    />
  );
}

interface ThumbProps {
  src: string;
  alt?: string;
}

function PreviewThumb({ src, alt }: ThumbProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="h-10 w-10 flex-shrink-0 rounded bg-muted" />;
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 flex-shrink-0 rounded object-cover"
    />
  );
}

function formatGel(minor: number | undefined): string | undefined {
  if (minor == null) return undefined;
  return `${(minor / 100).toFixed(2)} ₾`;
}

interface Props {
  store: Store;
  data: WoltVenueData;
}

export function WoltStoreCard({ store, data }: Props) {
  const hero = imageUrl(data.brand_image) ?? imageUrl(data.icon);
  const shortDesc = data.short_description ?? data.short_description_v2?.text;
  const ratingScore = data.rating?.score;
  const ratingVolume = data.rating?.volume;
  const eta = data.estimate_box?.title ?? data.estimate_range;
  const etaUnit = data.estimate_box?.subtitle ?? 'min';
  const dollarSigns = data.price_range ? '$'.repeat(data.price_range) : undefined;
  const deliveryPrice =
    data.delivery_price_int === 0
      ? 'Free delivery'
      : data.delivery_price ?? formatGel(data.delivery_price_int);
  const previews = data.venue_preview_items ?? [];
  const badges = data.badges_v2 ?? [];
  const promos = data.promotions ?? [];

  return (
    <Link
      to={WEB_PATHS.storeDetail}
      params={{ id: store.id }}
      className="group block overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <HeroImage src={hero} alt={store.name} />
        {!store.online && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm font-medium">
            offline
          </div>
        )}
        {badges.length > 0 && (
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {badges.slice(0, 2).map((b, i) => (
              <Badge key={`${b.text ?? ''}-${i}`} variant="secondary" className="shadow">
                {b.text}
              </Badge>
            ))}
          </div>
        )}
        {data.show_best_of_wolt && (
          <Badge className="absolute right-2 top-2 shadow">Best of Wolt</Badge>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-semibold">{store.name}</h3>
          {ratingScore != null && (
            <div className="shrink-0 text-xs font-medium">
              ★ {ratingScore.toFixed(1)}
              {ratingVolume != null && (
                <span className="ml-0.5 text-muted-foreground">({ratingVolume})</span>
              )}
            </div>
          )}
        </div>
        {shortDesc && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{shortDesc}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {eta && (
            <span>
              {eta} {etaUnit}
            </span>
          )}
          {deliveryPrice && <span>· {deliveryPrice}</span>}
          {dollarSigns && <span>· {dollarSigns}</span>}
          {data.show_wolt_plus && <span>· Wolt+</span>}
        </div>
        {(data.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set(data.tags!))
              .slice(0, 3)
              .map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
          </div>
        )}
        {promos.length > 0 && (
          <div className="truncate text-xs text-primary">
            {promos.map((p) => p.text).filter(Boolean).join(' · ')}
          </div>
        )}
        {previews.length > 0 && (
          <div className="flex gap-1 overflow-hidden">
            {previews.slice(0, 4).map((p, i) => {
              const url = imageUrl(p.image);
              if (!url) return null;
              return <PreviewThumb key={p.id ?? i} src={url} alt={p.name} />;
            })}
          </div>
        )}
      </div>
    </Link>
  );
}

export function WoltStoreCardFallback({ store }: { store: Store }) {
  return (
    <Card className="p-3">
      <div className="font-semibold">{store.name}</div>
      <div className="text-xs text-muted-foreground">
        {store.vendor} · {store.productLine ?? '—'} · {store.online ? 'online' : 'offline'}
      </div>
    </Card>
  );
}
