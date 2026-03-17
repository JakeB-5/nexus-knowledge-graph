import { FullTextSearchEngine } from "./full-text.js";
import { VectorSearchEngine } from "./vector.js";
import type { IndexedDocument, SearchHit, SearchIndex, SearchOptions } from "./types.js";

export interface HybridSearchOptions extends SearchOptions {
  textWeight?: number;
  vectorWeight?: number;
}

/**
 * Hybrid search engine combining BM25 full-text and vector cosine similarity.
 * Uses Reciprocal Rank Fusion (RRF) for score combination.
 */
export class HybridSearchEngine implements SearchIndex {
  private textEngine = new FullTextSearchEngine();
  private vectorEngine = new VectorSearchEngine();

  get size(): number {
    return this.textEngine.size;
  }

  add(doc: IndexedDocument): void {
    this.textEngine.add(doc);
    this.vectorEngine.add(doc);
  }

  remove(id: string): void {
    this.textEngine.remove(id);
    this.vectorEngine.remove(id);
  }

  search(query: string, options?: SearchOptions): SearchHit[] {
    // Without a query embedding, fall back to text-only
    return this.textEngine.search(query, options);
  }

  hybridSearch(
    query: string,
    queryEmbedding: number[],
    options: HybridSearchOptions = {},
  ): SearchHit[] {
    const {
      limit = 20,
      offset = 0,
      textWeight = 0.5,
      vectorWeight = 0.5,
      ...baseOptions
    } = options;

    // Get larger sets for fusion
    const expandedLimit = Math.max(limit * 3, 100);
    const textHits = this.textEngine.search(query, { ...baseOptions, limit: expandedLimit });
    const vectorHits = this.vectorEngine.searchByVector(queryEmbedding, {
      ...baseOptions,
      limit: expandedLimit,
    });

    // Reciprocal Rank Fusion
    const k = 60; // RRF constant
    const fusedScores = new Map<string, number>();
    const hitMap = new Map<string, SearchHit>();

    textHits.forEach((hit, rank) => {
      const rrfScore = textWeight / (k + rank + 1);
      fusedScores.set(hit.id, (fusedScores.get(hit.id) ?? 0) + rrfScore);
      hitMap.set(hit.id, hit);
    });

    vectorHits.forEach((hit, rank) => {
      const rrfScore = vectorWeight / (k + rank + 1);
      fusedScores.set(hit.id, (fusedScores.get(hit.id) ?? 0) + rrfScore);
      if (!hitMap.has(hit.id)) {
        hitMap.set(hit.id, hit);
      }
    });

    const results: SearchHit[] = Array.from(fusedScores.entries())
      .map(([id, score]) => ({
        ...hitMap.get(id)!,
        score,
      }))
      .sort((a, b) => b.score - a.score);

    return results.slice(offset, offset + limit);
  }

  clear(): void {
    this.textEngine.clear();
    this.vectorEngine.clear();
  }
}
