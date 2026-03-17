/**
 * Abstract base class and interface for embedding providers.
 */

import type { EmbeddingProvider } from "../types.js";

export type { EmbeddingProvider };

// ---------------------------------------------------------------------------
// Abstract base class
// ---------------------------------------------------------------------------

export abstract class BaseEmbeddingProvider implements EmbeddingProvider {
  abstract readonly name: string;
  abstract readonly dimensions: number;

  abstract embed(text: string): Promise<number[]>;

  /**
   * Default batch implementation: sequential calls to embed().
   * Subclasses should override this for true batch optimisation.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  /**
   * Compute cosine similarity between two embedding vectors.
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * L2-normalize a vector in place and return it.
   */
  static normalize(v: number[]): number[] {
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm);
    if (norm === 0) return v;
    for (let i = 0; i < v.length; i++) v[i]! /= norm;
    return v;
  }

  /**
   * Find the most similar embedding from a list.
   * Returns index and similarity score.
   */
  findMostSimilar(
    query: number[],
    candidates: number[][],
  ): { index: number; similarity: number } {
    let bestIdx = 0;
    let bestSim = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const sim = BaseEmbeddingProvider.cosineSimilarity(query, candidates[i]!);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    return { index: bestIdx, similarity: bestSim };
  }

  /**
   * Rank candidates by similarity to a query embedding.
   */
  rankBySimilarity(
    query: number[],
    candidates: number[][],
  ): Array<{ index: number; similarity: number }> {
    return candidates
      .map((candidate, index) => ({
        index,
        similarity: BaseEmbeddingProvider.cosineSimilarity(query, candidate),
      }))
      .sort((a, b) => b.similarity - a.similarity);
  }
}
