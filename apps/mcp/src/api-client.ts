import { request } from 'undici';
import { environment } from './environment.js';

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

async function parse<T>(statusCode: number, buf: string, label: string): Promise<T> {
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`${label} → ${statusCode}: ${buf.slice(0, 300)}`);
  }
  return JSON.parse(buf) as T;
}

export function createApiClient(): ApiClient {
  const base = environment.API_URL.replace(/\/$/, '');
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: `Bearer ${environment.API_TOKEN}`,
  };
  return {
    async get<T>(path: string): Promise<T> {
      const { statusCode, body } = await request(`${base}${path}`, {
        method: 'GET',
        headers,
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      return parse<T>(statusCode, await body.text(), `GET ${path}`);
    },
    async post<T>(path: string, body: unknown): Promise<T> {
      const { statusCode, body: resBody } = await request(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      return parse<T>(statusCode, await resBody.text(), `POST ${path}`);
    },
  };
}
