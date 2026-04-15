import { request } from 'undici';
import { environment } from './environment.js';

export interface ApiClient {
  get<T>(path: string, extra?: Record<string, string>): Promise<T>;
  post<T>(path: string, body: unknown, extra?: Record<string, string>): Promise<T>;
  patch<T>(path: string, body: unknown, extra?: Record<string, string>): Promise<T>;
  del(path: string, extra?: Record<string, string>): Promise<void>;
}

async function parse<T>(statusCode: number, buf: string, label: string): Promise<T> {
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`${label} → ${statusCode}: ${buf.slice(0, 300)}`);
  }
  return JSON.parse(buf) as T;
}

export function createApiClient(): ApiClient {
  const base = environment.API_URL.replace(/\/$/, '');
  const baseHeaders = {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: `Bearer ${environment.API_TOKEN}`,
  };
  const withExtra = (extra?: Record<string, string>) =>
    extra ? { ...baseHeaders, ...extra } : baseHeaders;

  return {
    async get<T>(path: string, extra?: Record<string, string>): Promise<T> {
      const { statusCode, body } = await request(`${base}${path}`, {
        method: 'GET',
        headers: withExtra(extra),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      return parse<T>(statusCode, await body.text(), `GET ${path}`);
    },
    async post<T>(path: string, body: unknown, extra?: Record<string, string>): Promise<T> {
      const { statusCode, body: resBody } = await request(`${base}${path}`, {
        method: 'POST',
        headers: withExtra(extra),
        body: JSON.stringify(body ?? {}),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      return parse<T>(statusCode, await resBody.text(), `POST ${path}`);
    },
    async patch<T>(path: string, body: unknown, extra?: Record<string, string>): Promise<T> {
      const { statusCode, body: resBody } = await request(`${base}${path}`, {
        method: 'PATCH',
        headers: withExtra(extra),
        body: JSON.stringify(body ?? {}),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      return parse<T>(statusCode, await resBody.text(), `PATCH ${path}`);
    },
    async del(path: string, extra?: Record<string, string>): Promise<void> {
      const { statusCode, body } = await request(`${base}${path}`, {
        method: 'DELETE',
        headers: withExtra(extra),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      if (statusCode !== 204 && (statusCode < 200 || statusCode >= 300)) {
        throw new Error(`DELETE ${path} → ${statusCode}: ${(await body.text()).slice(0, 300)}`);
      }
    },
  };
}

export function userHeaders(userId?: string): Record<string, string> | undefined {
  return userId ? { 'x-user-id': userId } : undefined;
}
