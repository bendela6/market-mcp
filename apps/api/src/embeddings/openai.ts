import { request } from 'undici';
import type { Embedder } from './embedder.js';

export interface OpenAIOptions {
  apiKey: string;
  model?: string;
}

export function createOpenAIEmbedder(options: OpenAIOptions): Embedder {
  const model = options.model ?? 'text-embedding-3-small';
  return {
    id: `openai-${model}-1024`,
    dimensions: 1024,
    maxBatch: 2048,
    async embed(texts) {
      if (texts.length === 0) return [];
      const { statusCode, body } = await request('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: texts, model, dimensions: 1024 }),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      const raw = await body.text();
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`OpenAI embeddings ${statusCode}: ${raw.slice(0, 300)}`);
      }
      const parsed = JSON.parse(raw) as { data: Array<{ embedding: number[] }> };
      return parsed.data.map((d) => d.embedding);
    },
  };
}
