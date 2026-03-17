import type { IndexedDocument, SearchHit, SearchIndex, SearchOptions } from "./types.js";

/**
 * In-memory vector search engine using cosine similarity.
 */
export class VectorSearchEngine implements SearchIndex {
  private documents = new Map<string, IndexedDocument>();
  private embeddings = new Map<string, number[]>();

  get size(): number {
    return this.documents.size;
  }

  add(doc: IndexedDocument): void {
    this.documents.set(doc.id, doc);
    if (doc.embedding) {
      this.embeddings.set(doc.id, doc.embedding);
    }
  }

  remove(id: string): void {
    this.documents.delete(id);
    this.embeddings.delete(id);
  }

  search(_query: string, options?: SearchOptions, queryEmbedding?: number[]): SearchHit[] {
    const { limit = 20, offset = 0, types, minScore = 0 } = options ?? {};

    if (!queryEmbedding) return [];

    const results: SearchHit[] = [];

    for (const [id, embedding] of this.embeddings) {
      const doc = this.documents.get(id);
      if (!doc) continue;

      if (types && types.length > 0 && !types.includes(doc.type)) continue;

      const score = cosineSimilarity(queryEmbedding, embedding);
      if (score >= minScore) {
        results.push({ id, score, highlights: [] });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(offset, offset + limit);
  }

  searchByVector(queryEmbedding: number[], options?: SearchOptions): SearchHit[] {
    return this.search("", options, queryEmbedding);
  }

  clear(): void {
    this.documents.clear();
    this.embeddings.clear();
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}
