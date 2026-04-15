import { request } from 'undici';
import type { Embedder } from './embedder.js';

export interface OllamaOptions {
  baseUrl: string;
  model?: string;
}

export function createOllamaEmbedder(options: OllamaOptions): Embedder {
  const model = options.model ?? 'bge-m3';
  return {
    id: `ollama-${model}`,
    dimensions: 1024,
    maxBatch: 32,
    async embed(texts) {
      const out: number[][] = [];
      for (const text of texts) {
        const { statusCode, body } = await request(`${options.baseUrl.replace(/\/$/, '')}/api/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, prompt: text }),
          bodyTimeout: 60_000,
          headersTimeout: 60_000,
        });
        const raw = await body.text();
        if (statusCode < 200 || statusCode >= 300) {
          throw new Error(`Ollama embeddings ${statusCode}: ${raw.slice(0, 300)}`);
        }
        const parsed = JSON.parse(raw) as { embedding: number[] };
        if (parsed.embedding.length !== 1024) {
          throw new Error(
            `Ollama model ${model} returned ${parsed.embedding.length} dims; expected 1024. Use a compatible model (e.g. bge-m3).`,
          );
        }
        out.push(parsed.embedding);
      }
      return out;
    },
  };
}
