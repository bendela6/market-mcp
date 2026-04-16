import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import {
  items,
  plans,
  planLines,
  stores,
  type PlanLineRow,
  type PlanRow,
} from '../db/schema.js';
import type {
  AddPlanLineBody,
  CreatePlanBody,
  Plan,
  PlanDetail,
  PlanLine,
  PlanQueryBody,
  UpdatePlanBody,
  UpdatePlanLineBody,
  ComputePlanResponse,
  ItemCandidate,
  CheapestPerItemPlan,
  SingleStorePlan,
} from '@market/contracts';
import type { CatalogService, HybridItemHit } from './catalog.js';
import type { Embedder } from '../embeddings/index.js';
import { buildOrderBy } from '../lib/query-builder.js';
import { slugify } from '@market/vendor-core';
import { randomBytes } from 'node:crypto';

export class NotFoundError extends Error { constructor() { super('not found'); } }
export class ValidationError extends Error { constructor(msg: string) { super(msg); } }

export interface PlansService {
  query(userId: string, body: PlanQueryBody): Promise<{ data: Plan[]; total: number }>;
  create(userId: string, body: CreatePlanBody): Promise<Plan>;
  getDetail(userId: string, id: string): Promise<PlanDetail>;
  update(userId: string, id: string, body: UpdatePlanBody): Promise<Plan>;
  remove(userId: string, id: string): Promise<void>;
  addLine(userId: string, id: string, body: AddPlanLineBody): Promise<PlanLine>;
  updateLine(userId: string, id: string, lineId: string, body: UpdatePlanLineBody): Promise<PlanLine>;
  removeLine(userId: string, id: string, lineId: string): Promise<void>;
  compute(userId: string, id: string): Promise<ComputePlanResponse>;
}

function looksLikeBarcode(s: string): boolean {
  return /^\d{8,14}$/.test(s.trim());
}

function hitToCandidate(h: HybridItemHit): ItemCandidate {
  return {
    venueSlug: h.storeSlug,
    venueName: h.storeName,
    itemId: h.id,
    itemName: h.name,
    priceMinor: h.priceMinor,
    currency: h.currency,
    deliveryPriceInt: h.deliveryPriceInt ?? undefined,
    online: h.available,
  };
}

async function rowToPlan(db: DbClient, r: PlanRow): Promise<Plan> {
  const [countRow] = await db.select({ n: count() }).from(planLines).where(eq(planLines.planId, r.id));
  const n = countRow?.n ?? 0;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type,
    strategy: r.strategy,
    vendor: r.vendor ?? undefined,
    storeIds: r.storeIds ?? undefined,
    includeOffline: r.includeOffline,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    lineCount: Number(n),
  };
}

async function lineRowToDto(db: DbClient, r: PlanLineRow): Promise<PlanLine> {
  if (r.kind === 'query') {
    return { id: r.id, kind: 'query', position: r.position, quantity: r.quantity, query: r.query! };
  }
  const itemRow = r.itemId
    ? await db.query.items.findFirst({ where: eq(items.id, r.itemId) })
    : undefined;
  return {
    id: r.id,
    kind: 'item',
    position: r.position,
    quantity: r.quantity,
    itemId: r.itemId!,
    itemSlug: itemRow?.slug ?? '',
    itemName: itemRow?.name ?? '(deleted)',
  };
}

async function generateUniqueSlug(db: DbClient, name: string): Promise<string> {
  const base = slugify(name) || 'plan';
  const existing = await db.query.plans.findFirst({ where: eq(plans.slug, base) });
  if (!existing) return base;
  for (let i = 0; i < 3; i++) {
    const suffix = randomBytes(3).toString('hex');
    const cand = `${base}-${suffix}`;
    const hit = await db.query.plans.findFirst({ where: eq(plans.slug, cand) });
    if (!hit) return cand;
  }
  throw new Error('could not generate unique plan slug');
}

export function createPlansService(
  db: DbClient,
  catalog: CatalogService,
  embedder: Embedder,
): PlansService {
  return {
    async query(userId, body) {
      const conds = [eq(plans.userId, userId)];
      if (body.q) conds.push(ilike(plans.name, `%${body.q}%`));
      if (body.type) conds.push(eq(plans.type, body.type));
      const where = and(...conds);

      const order = buildOrderBy(body.sort, {
        name: plans.name,
        createdAt: plans.createdAt,
        updatedAt: plans.updatedAt,
      }, desc(plans.createdAt));

      const rows = await db.select().from(plans)
        .where(where)
        .orderBy(...order)
        .limit(body.take ?? 50)
        .offset(body.skip ?? 0);

      const [totalRow] = await db.select({ n: count() }).from(plans).where(where);
      const data = await Promise.all(rows.map((r) => rowToPlan(db, r)));
      return { data, total: Number(totalRow?.n ?? 0) };
    },

    async create(userId, body) {
      const slug = await generateUniqueSlug(db, body.name);
      const [row] = await db.insert(plans).values({
        userId,
        slug,
        name: body.name,
        type: body.type,
        strategy: body.strategy,
        vendor: body.vendor ?? null,
        storeIds: body.storeIds ?? null,
        includeOffline: body.includeOffline ?? false,
      }).returning();
      return rowToPlan(db, row!);
    },

    async getDetail(userId, id) {
      const plan = await db.query.plans.findFirst({
        where: and(eq(plans.id, id), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();
      const rows = await db.query.planLines.findMany({
        where: eq(planLines.planId, plan.id),
        orderBy: (t, { asc }) => [asc(t.position)],
      });
      const lines = await Promise.all(rows.map((r) => lineRowToDto(db, r)));
      return { plan: await rowToPlan(db, plan), lines };
    },

    async update(userId, id, body) {
      const existing = await db.query.plans.findFirst({
        where: and(eq(plans.id, id), eq(plans.userId, userId)),
      });
      if (!existing) throw new NotFoundError();
      const [row] = await db.update(plans)
        .set({
          ...(body.name != null && { name: body.name }),
          ...(body.strategy != null && { strategy: body.strategy }),
          ...(body.vendor !== undefined && { vendor: body.vendor ?? null }),
          ...(body.storeIds !== undefined && { storeIds: body.storeIds ?? null }),
          ...(body.includeOffline != null && { includeOffline: body.includeOffline }),
          updatedAt: new Date(),
        })
        .where(eq(plans.id, existing.id))
        .returning();
      return rowToPlan(db, row!);
    },

    async remove(userId, id) {
      const existing = await db.query.plans.findFirst({
        where: and(eq(plans.id, id), eq(plans.userId, userId)),
      });
      if (!existing) throw new NotFoundError();
      await db.delete(plans).where(eq(plans.id, existing.id));
    },

    async addLine(userId, id, body) {
      const plan = await db.query.plans.findFirst({
        where: and(eq(plans.id, id), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();

      if (plan.type === 'query-based' && body.kind !== 'query') {
        throw new ValidationError('plan only accepts query lines');
      }
      if (plan.type === 'item-based' && body.kind !== 'item') {
        throw new ValidationError('plan only accepts item lines');
      }

      const [posRow] = await db
        .select({ maxPos: sql<number>`coalesce(max(${planLines.position}), -1)` })
        .from(planLines)
        .where(eq(planLines.planId, plan.id));
      const position = Number(posRow?.maxPos ?? -1) + 1;

      let insert: Record<string, unknown>;
      if (body.kind === 'query') {
        insert = {
          planId: plan.id,
          position,
          kind: 'query',
          quantity: body.quantity ?? 1,
          query: body.query,
          itemId: null,
        };
      } else {
        const itemRow = await db.query.items.findFirst({ where: eq(items.id, body.itemId) });
        if (!itemRow) throw new ValidationError('item not found');
        insert = {
          planId: plan.id,
          position,
          kind: 'item',
          quantity: body.quantity ?? 1,
          query: null,
          itemId: itemRow.id,
        };
      }

      const [row] = await db.insert(planLines).values(insert as never).returning();
      await db.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, plan.id));
      return lineRowToDto(db, row!);
    },

    async updateLine(userId, id, lineId, body) {
      const plan = await db.query.plans.findFirst({
        where: and(eq(plans.id, id), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();
      const line = await db.query.planLines.findFirst({
        where: and(eq(planLines.id, lineId), eq(planLines.planId, plan.id)),
      });
      if (!line) throw new NotFoundError();

      if (body.query != null && line.kind !== 'query') {
        throw new ValidationError('cannot set query on an item line');
      }

      const [row] = await db.update(planLines)
        .set({
          ...(body.quantity != null && { quantity: body.quantity }),
          ...(body.query != null && { query: body.query }),
        })
        .where(eq(planLines.id, lineId))
        .returning();
      await db.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, plan.id));
      return lineRowToDto(db, row!);
    },

    async removeLine(userId, id, lineId) {
      const plan = await db.query.plans.findFirst({
        where: and(eq(plans.id, id), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();
      await db.delete(planLines).where(
        and(eq(planLines.id, lineId), eq(planLines.planId, plan.id)),
      );
      await db.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, plan.id));
    },

    async compute(userId, id) {
      const plan = await db.query.plans.findFirst({
        where: and(eq(plans.id, id), eq(plans.userId, userId)),
      });
      if (!plan) throw new NotFoundError();
      const lineRows = await db.query.planLines.findMany({
        where: eq(planLines.planId, plan.id),
        orderBy: (t, { asc }) => [asc(t.position)],
      });

      const storeFilter = plan.storeIds ? new Set(plan.storeIds) : null;
      const includeOffline = plan.includeOffline;

      const resolved = await Promise.all(lineRows.map(async (line) => {
        const quantity = Math.max(1, Math.floor(line.quantity));

        if (line.kind === 'item') {
          const row = await db
            .select({
              id: items.id,
              slug: items.slug,
              vendor: items.vendor,
              name: items.name,
              priceMinor: items.priceMinor,
              currency: items.currency,
              available: items.available,
              storeId: stores.id,
              storeSlug: stores.slug,
              storeName: stores.name,
            })
            .from(items)
            .innerJoin(stores, eq(stores.id, items.storeId))
            .where(eq(items.id, line.itemId!))
            .limit(1);
          const r = row[0];
          const label = `item:${line.itemId}`;
          if (!r) return { query: label, quantity, candidates: [] as ItemCandidate[] };
          if (storeFilter && !storeFilter.has(r.storeId)) return { query: label, quantity, candidates: [] };
          if (!includeOffline && !r.available) return { query: label, quantity, candidates: [] };
          const candidate: ItemCandidate = {
            venueSlug: r.storeSlug,
            venueName: r.storeName,
            itemId: r.id,
            itemName: r.name,
            priceMinor: r.priceMinor,
            currency: r.currency,
            online: r.available,
          };
          return { query: label, quantity, candidates: [candidate] };
        }

        const q = (line.query ?? '').trim();
        let hits: HybridItemHit[] = [];
        if (looksLikeBarcode(q)) {
          hits = await catalog.searchItemsByBarcodeForPlan(q);
        } else {
          hits = await catalog.searchItemsForPlan(q, embedder, 200);
        }
        const byStore = new Map<string, HybridItemHit>();
        for (const h of hits) {
          if (storeFilter && !storeFilter.has(h.storeId)) continue;
          if (!includeOffline && !h.available) continue;
          const existing = byStore.get(h.storeId);
          if (!existing || h.priceMinor < existing.priceMinor) byStore.set(h.storeId, h);
        }
        return {
          query: q,
          quantity,
          candidates: [...byStore.values()]
            .map(hitToCandidate)
            .sort((a, b) => a.priceMinor - b.priceMinor),
        };
      }));

      const response: ComputePlanResponse = {};
      if (plan.strategy === 'cheapest-per-item' || plan.strategy === 'both') {
        response.cheapestPerItem = optimizeCheapest(resolved);
      }
      if (plan.strategy === 'single-store' || plan.strategy === 'both') {
        response.singleStore = optimizeSingleStore(resolved);
      }
      return response;
    },
  };
}

interface ResolvedLine {
  query: string;
  quantity: number;
  candidates: ItemCandidate[];
}

function optimizeCheapest(resolved: ResolvedLine[]): CheapestPerItemPlan {
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
}

function optimizeSingleStore(resolved: ResolvedLine[]): SingleStorePlan {
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
}
