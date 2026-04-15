import { useState } from 'react';
import type { Store, WoltImage, WoltVenueData } from '@market/contracts';
import { Badge, Button } from '@market/ui';

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

function formatGel(minor: number | undefined): string | undefined {
  if (minor == null) return undefined;
  return `${(minor / 100).toFixed(2)} ₾`;
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
      className="h-full w-full object-cover"
    />
  );
}

interface Props {
  store: Store;
  data: WoltVenueData;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function WoltStoreDetail({ store, data, onRefresh, refreshing }: Props) {
  const hero = imageUrl(data.brand_image) ?? imageUrl(data.icon) ?? undefined;
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
  const tags = Array.from(new Set(data.tags ?? []));
  const badges = data.badges_v2 ?? [];
  const promos = data.promotions ?? [];
  const previews = data.venue_preview_items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="relative aspect-square w-32 flex-shrink-0 overflow-hidden rounded-lg border bg-muted sm:w-40">
          <DetailImage src={hero} name={store.name} />
          {!store.online && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs font-medium">
              offline
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold leading-tight">{store.name}</h1>
            {shortDesc && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{shortDesc}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {ratingScore != null && (
              <span className="font-medium">
                ★ {ratingScore.toFixed(1)}
                {ratingVolume != null && (
                  <span className="ml-1 text-muted-foreground">({ratingVolume})</span>
                )}
              </span>
            )}
            {eta && (
              <span>
                {eta} {etaUnit}
              </span>
            )}
            {deliveryPrice && <span>{deliveryPrice}</span>}
            {dollarSigns && <span>{dollarSigns}</span>}
            {data.show_best_of_wolt && <Badge>Best of Wolt</Badge>}
            {data.show_wolt_plus && <Badge variant="outline">Wolt+</Badge>}
            {data.show_zero_markup && <Badge variant="outline">No markup</Badge>}
          </div>

          {(badges.length > 0 || tags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {badges.slice(0, 3).map((b, i) => (
                <Badge key={`b-${b.text ?? ''}-${i}`} variant="secondary">
                  {b.text}
                </Badge>
              ))}
              {tags.slice(0, 6).map((t) => (
                <Badge key={`t-${t}`} variant="outline" className="text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {onRefresh && (
          <Button size="sm" onClick={onRefresh} disabled={refreshing} className="flex-shrink-0">
            {refreshing ? 'Refreshing…' : 'Refresh assortment'}
          </Button>
        )}
      </header>

      <div className="space-y-4">
        {promos.length > 0 && (
          <div className="rounded-lg border bg-card p-3">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Promotions
            </h2>
            <ul className="space-y-0.5 text-sm">
              {promos.map((p, i) => (
                <li key={p.campaign_id ?? `${p.text ?? ''}-${i}`}>
                  {p.text}
                  {p.is_offer_stackable && (
                    <span className="ml-2 text-xs text-muted-foreground">(stackable)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Vendor</dt>
          <dd>{store.vendor}</dd>
          {store.address && (
            <>
              <dt className="text-muted-foreground">Address</dt>
              <dd>{store.address}</dd>
            </>
          )}
          {data.franchise && (
            <>
              <dt className="text-muted-foreground">Franchise</dt>
              <dd>{data.franchise}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Status</dt>
          <dd>{store.online ? 'Online' : 'Offline'}</dd>
          <dt className="text-muted-foreground">Slug</dt>
          <dd className="font-mono text-xs">{store.slug}</dd>
        </dl>

        {previews.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Popular items
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {previews.slice(0, 6).map((p, i) => {
                const url = imageUrl(p.image);
                return (
                  <div
                    key={p.id ?? i}
                    className="overflow-hidden rounded border bg-card text-sm"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={p.name}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="aspect-square w-full bg-muted" />
                    )}
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs font-medium">{p.name}</p>
                      {p.price != null && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatGel(p.price)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DefaultStoreDetail({
  store,
  onRefresh,
  refreshing,
}: {
  store: Store;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-2xl font-bold">{store.name}</h1>
        {onRefresh && (
          <Button size="sm" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh assortment'}
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Vendor</dt>
        <dd>{store.vendor}</dd>
        {store.address && (
          <>
            <dt className="text-muted-foreground">Address</dt>
            <dd>{store.address}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Status</dt>
        <dd>{store.online ? 'Online' : 'Offline'}</dd>
      </dl>
    </div>
  );
}
