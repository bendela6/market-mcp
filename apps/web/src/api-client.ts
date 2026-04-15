import { ROUTES, type SearchItemsResponse } from '@market/contracts';
import { environment } from './environment.js';

const base = environment.VITE_API_URL.replace(/\/$/, '');

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  searchItems: (query: string, mode: 'keyword' | 'semantic' | 'hybrid' = 'hybrid') => {
    const q = new URLSearchParams({ q: query, mode });
    return get<SearchItemsResponse>(`${ROUTES.catalog.search}?${q.toString()}`);
  },
};
