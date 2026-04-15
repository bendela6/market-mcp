import { request } from 'undici';
import { environment } from '../environment.js';

export interface Embedder {
  readonly id: string;
  readonly dimensions: number;
  readonly maxBatch: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_DIMENSIONS = 1024;

interface ProviderSpec {
  id: string;
  model: string;
  url: string;
  maxBatch: number;
  headers: Record<string, string>;
  buildBody: (texts: string[]) => unknown;
  parseResponse: (raw: unknown) => number[][];
  perItem?: boolean;
}

function createEmbedder(spec: ProviderSpec): Embedder {
  const call = async (batch: string[]): Promise<number[][]> => {
    const res = await request(spec.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...spec.headers },
      body: JSON.stringify(spec.buildBody(batch)),
      bodyTimeout: 60_000,
      headersTimeout: 60_000,
    });
    const raw = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`${spec.id} embeddings ${res.statusCode}: ${raw.slice(0, 300)}`);
    }
    const vectors = spec.parseResponse(JSON.parse(raw));
    for (const v of vectors) {
      if (v.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `${spec.id}/${spec.model} returned ${v.length} dims; expected ${EMBEDDING_DIMENSIONS}`,
        );
      }
    }
    return vectors;
  };
  return {
    id: `${spec.id}-${spec.model}`,
    dimensions: EMBEDDING_DIMENSIONS,
    maxBatch: spec.maxBatch,
    async embed(texts) {
      if (texts.length === 0) return [];
      if (!spec.perItem) return call(texts);
      const out: number[][] = [];
      for (const t of texts) out.push(...(await call([t])));
      return out;
    },
  };
}

const openai = (apiKey: string, model = 'text-embedding-3-small'): ProviderSpec => ({
  id: 'openai',
  model,
  url: 'https://api.openai.com/v1/embeddings',
  maxBatch: 2048,
  headers: { authorization: `Bearer ${apiKey}` },
  buildBody: (input) => ({ input, model, dimensions: EMBEDDING_DIMENSIONS }),
  parseResponse: (raw) =>
    (raw as { data: Array<{ embedding: number[] }> }).data.map((d) => d.embedding),
});

const voyage = (apiKey: string, model = 'voyage-3'): ProviderSpec => ({
  id: 'voyage',
  model,
  url: 'https://api.voyageai.com/v1/embeddings',
  maxBatch: 128,
  headers: { authorization: `Bearer ${apiKey}` },
  buildBody: (input) => ({ input, model, input_type: 'document' }),
  parseResponse: (raw) =>
    (raw as { data: Array<{ embedding: number[] }> }).data.map((d) => d.embedding),
});

const cohere = (apiKey: string, model = 'embed-multilingual-v3.0'): ProviderSpec => ({
  id: 'cohere',
  model,
  url: 'https://api.cohere.com/v1/embed',
  maxBatch: 96,
  headers: { authorization: `Bearer ${apiKey}` },
  buildBody: (texts) => ({ texts, model, input_type: 'search_document' }),
  parseResponse: (raw) => (raw as { embeddings: number[][] }).embeddings,
});

const ollama = (baseUrl: string, model = 'bge-m3'): ProviderSpec => ({
  id: 'ollama',
  model,
  url: `${baseUrl.replace(/\/$/, '')}/api/embeddings`,
  maxBatch: 32,
  headers: {},
  buildBody: ([text]) => ({ model, prompt: text }),
  parseResponse: (raw) => [(raw as { embedding: number[] }).embedding],
  perItem: true,
});

const gemini = (apiKey: string, model = 'gemini-embedding-001'): ProviderSpec => ({
  id: 'gemini',
  model,
  url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
  maxBatch: 100,
  headers: { 'x-goog-api-key': apiKey },
  buildBody: (texts) => ({
    requests: texts.map((t) => ({
      model: `models/${model}`,
      content: { parts: [{ text: t }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })),
  }),
  parseResponse: (raw) =>
    (raw as { embeddings: Array<{ values: number[] }> }).embeddings.map((e) => e.values),
});

let cached: Embedder | null = null;

export function getEmbedder(): Embedder {
  if (cached) return cached;
  const spec: ProviderSpec = (() => {
    switch (environment.EMBEDDER) {
      case 'openai':
        return openai(environment.OPENAI_API_KEY!);
      case 'voyage':
        return voyage(environment.VOYAGE_API_KEY!);
      case 'cohere':
        return cohere(environment.COHERE_API_KEY!);
      case 'ollama':
        return ollama(environment.OLLAMA_BASE_URL!);
      case 'gemini':
        return gemini(environment.GEMINI_API_KEY!);
    }
  })();
  cached = createEmbedder(spec);
  return cached;
}
