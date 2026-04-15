export interface Embedder {
  readonly id: string;
  readonly dimensions: number;
  readonly maxBatch: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_DIMENSIONS = 1024;
