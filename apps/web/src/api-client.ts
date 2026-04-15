import type {
  AddPlanLineBody, CatalogStatsResponse, ComputePlanResponse, CreatePlanBody,
  CreateUserBody, GetItemResponse, GetStoreResponse, ItemQueryBody, ItemQueryResponse,
  Plan, PlanDetail, PlanQueryBody, PlanQueryResponse, StoreQueryBody,
  StoreQueryResponse, UpdatePlanBody, UpdatePlanLineBody, User,
} from '@market/contracts';
import { ROUTES } from '@market/contracts';
import { environment } from './environment.js';

const base = environment.VITE_API_URL.replace(/\/$/, '');
const USER_KEY = 'market.userId';

async function raw<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function userHeaders(): Record<string, string> {
  const id = localStorage.getItem(USER_KEY);
  return id ? { 'x-user-id': id } : {};
}

export async function ensureUser(): Promise<string> {
  const existing = localStorage.getItem(USER_KEY);
  if (existing) return existing;
  const body: CreateUserBody = {};
  const user = await raw<User>(ROUTES.users.create, { method: 'POST', body: JSON.stringify(body) });
  localStorage.setItem(USER_KEY, user.id);
  return user.id;
}

export const api = {
  // stores
  queryStores: (body: StoreQueryBody) =>
    raw<StoreQueryResponse>(ROUTES.stores.query, { method: 'POST', body: JSON.stringify(body) }),
  getStore: (idOrSlug: string) =>
    raw<GetStoreResponse>(ROUTES.stores.get(idOrSlug), { method: 'GET' }),

  // catalog
  queryItems: (body: ItemQueryBody) =>
    raw<ItemQueryResponse>(ROUTES.catalog.itemQuery, { method: 'POST', body: JSON.stringify(body) }),
  getItem: (idOrSlug: string) =>
    raw<GetItemResponse>(ROUTES.catalog.itemGet(idOrSlug), { method: 'GET' }),
  stats: () =>
    raw<CatalogStatsResponse>(ROUTES.catalog.stats, { method: 'GET' }),

  // plans
  queryPlans: (body: PlanQueryBody) =>
    raw<PlanQueryResponse>(ROUTES.plans.query, { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  createPlan: (body: CreatePlanBody) =>
    raw<Plan>(ROUTES.plans.create, { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  getPlan: (idOrSlug: string) =>
    raw<PlanDetail>(ROUTES.plans.get(idOrSlug), { method: 'GET', headers: userHeaders() }),
  updatePlan: (idOrSlug: string, body: UpdatePlanBody) =>
    raw<Plan>(ROUTES.plans.update(idOrSlug), { method: 'PATCH', body: JSON.stringify(body), headers: userHeaders() }),
  deletePlan: (idOrSlug: string) =>
    raw<void>(ROUTES.plans.delete(idOrSlug), { method: 'DELETE', headers: userHeaders() }),
  addPlanLine: (idOrSlug: string, body: AddPlanLineBody) =>
    raw(ROUTES.plans.lines.add(idOrSlug), { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  updatePlanLine: (idOrSlug: string, lineId: string, body: UpdatePlanLineBody) =>
    raw(ROUTES.plans.lines.update(idOrSlug, lineId), { method: 'PATCH', body: JSON.stringify(body), headers: userHeaders() }),
  removePlanLine: (idOrSlug: string, lineId: string) =>
    raw<void>(ROUTES.plans.lines.delete(idOrSlug, lineId), { method: 'DELETE', headers: userHeaders() }),
  computePlan: (idOrSlug: string) =>
    raw<ComputePlanResponse>(ROUTES.plans.compute(idOrSlug), { method: 'POST', body: JSON.stringify({}), headers: userHeaders() }),
};
