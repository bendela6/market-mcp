import type {
  AddPlanLineBody, CatalogStatsResponse, ComputePlanResponse, CreatePlanBody,
  CreateUserBody, GetItemResponse, GetStoreResponse, ItemQueryBody, ItemQueryResponse,
  Plan, PlanDetail, PlanQueryBody, PlanQueryResponse, RefreshAssortmentResponse,
  StoreMapQueryBody, StoreMapQueryResponse,
  StoreQueryBody, StoreQueryResponse, UpdatePlanBody, UpdatePlanLineBody, User,
} from '@market/contracts';
import { API_PATHS, buildPath } from '@market/contracts';
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
  const user = await raw<User>(API_PATHS.users.create, { method: 'POST', body: JSON.stringify(body) });
  localStorage.setItem(USER_KEY, user.id);
  return user.id;
}

export const api = {
  // stores
  queryStores: (body: StoreQueryBody) =>
    raw<StoreQueryResponse>(API_PATHS.stores.query, { method: 'POST', body: JSON.stringify(body) }),
  getStore: (id: string) =>
    raw<GetStoreResponse>(buildPath(API_PATHS.stores.get, { id }), { method: 'GET' }),
  refreshStoreAssortment: (id: string) =>
    raw<RefreshAssortmentResponse>(buildPath(API_PATHS.stores.refreshAssortment, { id }), {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  queryStoresMap: (body: StoreMapQueryBody) =>
    raw<StoreMapQueryResponse>(API_PATHS.stores.map, { method: 'POST', body: JSON.stringify(body) }),

  // catalog
  queryItems: (body: ItemQueryBody) =>
    raw<ItemQueryResponse>(API_PATHS.catalog.itemQuery, { method: 'POST', body: JSON.stringify(body) }),
  getItem: (id: string) =>
    raw<GetItemResponse>(buildPath(API_PATHS.catalog.itemGet, { id }), { method: 'GET' }),
  stats: () =>
    raw<CatalogStatsResponse>(API_PATHS.catalog.stats, { method: 'GET' }),

  // plans
  queryPlans: (body: PlanQueryBody) =>
    raw<PlanQueryResponse>(API_PATHS.plans.query, { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  createPlan: (body: CreatePlanBody) =>
    raw<Plan>(API_PATHS.plans.create, { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  getPlan: (id: string) =>
    raw<PlanDetail>(buildPath(API_PATHS.plans.get, { id }), { method: 'GET', headers: userHeaders() }),
  updatePlan: (id: string, body: UpdatePlanBody) =>
    raw<Plan>(buildPath(API_PATHS.plans.update, { id }), { method: 'PATCH', body: JSON.stringify(body), headers: userHeaders() }),
  deletePlan: (id: string) =>
    raw<void>(buildPath(API_PATHS.plans.delete, { id }), { method: 'DELETE', headers: userHeaders() }),
  addPlanLine: (id: string, body: AddPlanLineBody) =>
    raw(buildPath(API_PATHS.plans.addLine, { id }), { method: 'POST', body: JSON.stringify(body), headers: userHeaders() }),
  updatePlanLine: (id: string, lineId: string, body: UpdatePlanLineBody) =>
    raw(buildPath(API_PATHS.plans.updateLine, { id, lineId }), { method: 'PATCH', body: JSON.stringify(body), headers: userHeaders() }),
  removePlanLine: (id: string, lineId: string) =>
    raw<void>(buildPath(API_PATHS.plans.deleteLine, { id, lineId }), { method: 'DELETE', headers: userHeaders() }),
  computePlan: (id: string) =>
    raw<ComputePlanResponse>(buildPath(API_PATHS.plans.compute, { id }), { method: 'POST', body: JSON.stringify({}), headers: userHeaders() }),
};
