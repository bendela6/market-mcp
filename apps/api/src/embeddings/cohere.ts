import { request } from 'undici';
import type { Embedder } from './embedder.js';

export interface CohereOptions {
  apiKey: string;
  model?: string;
}

export function createCohereEmbedder(options: CohereOptions): Embedder {
  const model = options.model ?? 'embed-multilingual-v3.0';
  return {
    id: `cohere-${model}`,
    dimensions: 1024,
    maxBatch: 96,
    async embed(texts) {
      if (texts.length === 0) return [];
      const { statusCode, body } = await request('https://api.cohere.com/v1/embed', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ texts, model, input_type: 'search_document' }),
        bodyTimeout: 60_000,
        headersTimeout: 60_000,
      });
      const raw = await body.text();
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`Cohere embeddings ${statusCode}: ${raw.slice(0, 300)}`);
      }
      const parsed = JSON.parse(raw) as { embeddings: number[][] };
      return parsed.embeddings;
    },
  };
}
