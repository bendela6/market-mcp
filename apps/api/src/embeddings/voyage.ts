import { request } from 'undici';
import type { Embedder } from './embedder.js';

export interface VoyageOptions {
  apiKey: string;
  model?: string;
}

export function createVoyageEmbedder(options: VoyageOptions): Embedder {
  const model = options.model ?? 'voyage-3';
  return {
    id: `voyage-${model}`,
    dimensions: 1024,
    maxBatch: 128,
    async embed(texts) {
      if (texts.length === 0) return [];
      const { statusCode, body } = await request('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ input: texts, model, input_type: 'document' }),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      const raw = await body.text();
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`Voyage embeddings ${statusCode}: ${raw.slice(0, 300)}`);
      }
      const parsed = JSON.parse(raw) as { data: Array<{ embedding: number[] }> };
      return parsed.data.map((d) => d.embedding);
    },
  };
}
