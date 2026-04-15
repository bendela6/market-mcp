import type { Embedder } from '../embeddings/index.js';
import type { CatalogService, HybridItemHit } from './catalog.js';

export type Strategy = 'cheapest-per-item' | 'single-store';

export interface ShoppingRequest {
  items: Array<{ query: string; quantity?: number }>;
  venueSlugs?: string[];
  includeOffline?: boolean;
}

export interface ItemCandidate {
  venueSlug: string;
  venueName: string;
  itemId: string;
  itemName: string;
  priceMinor: number;
  currency: string;
  unitInfo?: string;
  deliveryPriceInt?: number;
  online: boolean;
}

export interface CheapestPerItemPlan {
  strategy: 'cheapest-per-item';
  lines: Array<{
    query: string;
    quantity: number;
    chosen?: ItemCandidate;
    lineTotalMinor?: number;
    unmet?: true;
    alternatives: ItemCandidate[];
  }>;
  uniqueVenues: string[];
  itemsSubtotalMinor: number;
  deliverySubtotalMinor: number;
  grandTotalMinor: number;
  currency: string;
  unmet: string[];
}

export interface SingleStorePlan {
  strategy: 'single-store';
  venueSlug: string;
  venueName: string;
  itemsSubtotalMinor: number;
  deliveryFeeMinor: number;
  grandTotalMinor: number;
  currency: string;
  lines: Array<{
    query: string;
    quantity: number;
    chosen?: ItemCandidate;
    lineTotalMinor?: number;
    unmet?: true;
  }>;
  unmet: string[];
}

export interface ResolvedLine {
  query: string;
  quantity: number;
  candidates: ItemCandidate[];
}

export interface ShoppingListService {
  optimizeCheapestPerItem(req: ShoppingRequest): Promise<CheapestPerItemPlan>;
  optimizeSingleStore(req: ShoppingRequest): Promise<SingleStorePlan>;
}

function looksLikeBarcode(s: string): boolean {
  return /^\d{8,14}$/.test(s.trim());
}

function hitToCandidate(h: HybridItemHit): ItemCandidate {
  return {
    venueSlug: h.venueSlug,
    venueName: h.venueName,
    itemId: h.id,
    itemName: h.name,
    priceMinor: h.priceMinor,
    currency: h.currency,
    deliveryPriceInt: h.deliveryPriceInt ?? undefined,
    online: h.online,
  };
}

export function createShoppingListService(
  catalog: CatalogService,
  embedder: Embedder,
): ShoppingListService {
  async function resolve(req: ShoppingRequest): Promise<ResolvedLine[]> {
    const venueFilter = req.venueSlugs ? new Set(req.venueSlugs) : null;
    const includeOffline = !!req.includeOffline;

    return Promise.all(
      req.items.map(async ({ query, quantity }) => {
        const q = query.trim();
        let hits: HybridItemHit[] = [];
        if (looksLikeBarcode(q)) {
          hits = await catalog.searchItemsByBarcode(q);
        } else {
          hits = await catalog.searchItemsHybrid(q, embedder, 200);
          if (hits.length === 0) hits = await catalog.searchItemsKeyword(q, 200);
        }

        const byVenue = new Map<string, HybridItemHit>();
        for (const h of hits) {
          if (venueFilter && !venueFilter.has(h.venueSlug)) continue;
          if (!includeOffline && !h.online) continue;
          const existing = byVenue.get(h.venueSlug);
          if (!existing || h.priceMinor < existing.priceMinor) byVenue.set(h.venueSlug, h);
        }

        return {
          query: q,
          quantity: Math.max(1, Math.floor(quantity ?? 1)),
          candidates: [...byVenue.values()]
            .map(hitToCandidate)
            .sort((a, b) => a.priceMinor - b.priceMinor),
        };
      }),
    );
  }

  return {
    async optimizeCheapestPerItem(req) {
      const resolved = await resolve(req);
      const lines = resolved.map((line) => {
        const chosen = line.candidates[0];
        if (!chosen) {
          return {
            query: line.query,
            quantity: line.quantity,
            unmet: true as const,
            alternatives: [] as ItemCandidate[],
          };
        }
        return {
          query: line.query,
          quantity: line.quantity,
          chosen,
          lineTotalMinor: chosen.priceMinor * line.quantity,
          alternatives: line.candidates.slice(1, 4),
        };
      });

      const currency = lines.find((l) => l.chosen)?.chosen?.currency ?? 'GEL';
      const itemsSubtotalMinor = lines.reduce((s, l) => s + (l.lineTotalMinor ?? 0), 0);

      const venueFees = new Map<string, number>();
      for (const l of lines) {
        if (!l.chosen) continue;
        if (!venueFees.has(l.chosen.venueSlug)) {
          venueFees.set(l.chosen.venueSlug, l.chosen.deliveryPriceInt ?? 0);
        }
      }
      const deliverySubtotalMinor = [...venueFees.values()].reduce((s, f) => s + f, 0);

      return {
        strategy: 'cheapest-per-item',
        lines,
        uniqueVenues: [...venueFees.keys()],
        itemsSubtotalMinor,
        deliverySubtotalMinor,
        grandTotalMinor: itemsSubtotalMinor + deliverySubtotalMinor,
        currency,
        unmet: lines.filter((l) => l.unmet).map((l) => l.query),
      };
    },

    async optimizeSingleStore(req) {
      const resolved = await resolve(req);

      type Bucket = {
        venueName: string;
        currency: string;
        deliveryFee: number;
        lineCandidates: Map<number, ItemCandidate>;
      };
      const perVenue = new Map<string, Bucket>();

      resolved.forEach((line, idx) => {
        for (const c of line.candidates) {
          let bucket = perVenue.get(c.venueSlug);
          if (!bucket) {
            bucket = {
              venueName: c.venueName,
              currency: c.currency,
              deliveryFee: c.deliveryPriceInt ?? 0,
              lineCandidates: new Map(),
            };
            perVenue.set(c.venueSlug, bucket);
          }
          const existing = bucket.lineCandidates.get(idx);
          if (!existing || c.priceMinor < existing.priceMinor) {
            bucket.lineCandidates.set(idx, c);
          }
        }
      });

      let best: { slug: string; plan: SingleStorePlan; coverage: number } | null = null;

      for (const [slug, v] of perVenue.entries()) {
        const lines = resolved.map((line, idx) => {
          const c = v.lineCandidates.get(idx);
          if (!c) {
            return { query: line.query, quantity: line.quantity, unmet: true as const };
          }
          return {
            query: line.query,
            quantity: line.quantity,
            chosen: c,
            lineTotalMinor: c.priceMinor * line.quantity,
          };
        });
        const coverage = lines.filter((l) => l.chosen).length;
        const itemsSubtotalMinor = lines.reduce((s, l) => s + (l.lineTotalMinor ?? 0), 0);
        const plan: SingleStorePlan = {
          strategy: 'single-store',
          venueSlug: slug,
          venueName: v.venueName,
          itemsSubtotalMinor,
          deliveryFeeMinor: v.deliveryFee,
          grandTotalMinor: itemsSubtotalMinor + v.deliveryFee,
          currency: v.currency,
          lines,
          unmet: lines.filter((l) => l.unmet).map((l) => l.query),
        };
        if (
          !best ||
          coverage > best.coverage ||
          (coverage === best.coverage && plan.grandTotalMinor < best.plan.grandTotalMinor)
        ) {
          best = { slug, plan, coverage };
        }
      }

      if (!best) {
        return {
          strategy: 'single-store',
          venueSlug: '',
          venueName: '(no venue can fulfil any item)',
          itemsSubtotalMinor: 0,
          deliveryFeeMinor: 0,
          grandTotalMinor: 0,
          currency: 'GEL',
          lines: resolved.map((l) => ({ query: l.query, quantity: l.quantity, unmet: true as const })),
          unmet: resolved.map((l) => l.query),
        };
      }
      return best.plan;
    },
  };
}
