import { environment } from '../environment.js';
import type { Embedder } from './embedder.js';
import { createVoyageEmbedder } from './voyage.js';
import { createOpenAIEmbedder } from './openai.js';
import { createOllamaEmbedder } from './ollama.js';
import { createCohereEmbedder } from './cohere.js';

export type { Embedder } from './embedder.js';

let cached: Embedder | null = null;

export function getEmbedder(): Embedder {
  if (cached) return cached;
  switch (environment.EMBEDDER) {
    case 'voyage':
      cached = createVoyageEmbedder({ apiKey: environment.VOYAGE_API_KEY! });
      break;
    case 'openai':
      cached = createOpenAIEmbedder({ apiKey: environment.OPENAI_API_KEY! });
      break;
    case 'ollama':
      cached = createOllamaEmbedder({ baseUrl: environment.OLLAMA_BASE_URL! });
      break;
    case 'cohere':
      cached = createCohereEmbedder({ apiKey: environment.COHERE_API_KEY! });
      break;
  }
  return cached;
}
