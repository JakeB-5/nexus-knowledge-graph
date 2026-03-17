/**
 * TF-IDF (Term Frequency – Inverse Document Frequency) implementation.
 * Supports add/remove documents, vector computation, similarity, and
 * top keyword extraction with IDF caching.
 */

import { Tokenizer } from "./tokenizer.js";
import type { Keyword } from "./types.js";

export interface TFIDFDocument {
  id: string;
  text: string;
  /** Normalised token frequencies within this document */
  termFrequencies: Map<string, number>;
}

export class TFIDF {
  private readonly tokenizer: Tokenizer;

  /** Map from document id → document record */
  private readonly documents = new Map<string, TFIDFDocument>();

  /** Map from term → number of documents containing it */
  private readonly documentFrequency = new Map<string, number>();

  /** Cached IDF values – invalidated on add/remove */
  private idfCache = new Map<string, number>();
  private idfDirty = true;

  constructor(tokenizer?: Tokenizer) {
    this.tokenizer = tokenizer ?? new Tokenizer();
  }

  // ---------------------------------------------------------------------------
  // Document management
  // ---------------------------------------------------------------------------

  addDocument(id: string, text: string): void {
    if (this.documents.has(id)) {
      this.removeDocument(id);
    }

    const tokens = this.tokenizer.tokenize(text).normalizedTokens;
    const termFrequencies = this.computeTermFrequencies(tokens);

    this.documents.set(id, { id, text, termFrequencies });

    // Update document frequencies
    for (const term of termFrequencies.keys()) {
      this.documentFrequency.set(
        term,
        (this.documentFrequency.get(term) ?? 0) + 1,
      );
    }

    this.idfDirty = true;
  }

  removeDocument(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;

    for (const term of doc.termFrequencies.keys()) {
      const df = (this.documentFrequency.get(term) ?? 1) - 1;
      if (df <= 0) {
        this.documentFrequency.delete(term);
      } else {
        this.documentFrequency.set(term, df);
      }
    }

    this.documents.delete(id);
    this.idfDirty = true;
    return true;
  }

  /** Add multiple documents at once (batch). */
  addDocuments(entries: Array<{ id: string; text: string }>): void {
    for (const { id, text } of entries) {
      this.addDocument(id, text);
    }
  }

  get documentCount(): number {
    return this.documents.size;
  }

  // ---------------------------------------------------------------------------
  // Core computations
  // ---------------------------------------------------------------------------

  private computeTermFrequencies(tokens: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    // Normalise to relative frequencies
    const total = tokens.length || 1;
    for (const [term, count] of counts) {
      counts.set(term, count / total);
    }
    return counts;
  }

  /**
   * Compute IDF for a term using the smoothed formula:
   *   IDF(t) = ln((N + 1) / (df(t) + 1)) + 1
   */
  idf(term: string): number {
    this.ensureIdfCache();
    return this.idfCache.get(term) ?? Math.log((this.documents.size + 1) / 1) + 1;
  }

  private ensureIdfCache(): void {
    if (!this.idfDirty) return;
    this.idfCache = new Map();
    const N = this.documents.size;
    for (const [term, df] of this.documentFrequency) {
      this.idfCache.set(term, Math.log((N + 1) / (df + 1)) + 1);
    }
    this.idfDirty = false;
  }

  /**
   * Return the TF-IDF score of a term in a given document.
   */
  tfidf(term: string, docId: string): number {
    const doc = this.documents.get(docId);
    if (!doc) return 0;
    const tf = doc.termFrequencies.get(term) ?? 0;
    return tf * this.idf(term);
  }

  /**
   * Build the full TF-IDF vector for a document (only non-zero entries).
   */
  vector(docId: string): Map<string, number> {
    const doc = this.documents.get(docId);
    if (!doc) return new Map();
    const vec = new Map<string, number>();
    for (const term of doc.termFrequencies.keys()) {
      vec.set(term, this.tfidf(term, docId));
    }
    return vec;
  }

  /**
   * Compute the TF-IDF vector for an arbitrary query text (not in corpus).
   */
  vectorForText(text: string): Map<string, number> {
    const tokens = this.tokenizer.tokenize(text).normalizedTokens;
    const tf = this.computeTermFrequencies(tokens);
    const vec = new Map<string, number>();
    for (const [term, tfVal] of tf) {
      vec.set(term, tfVal * this.idf(term));
    }
    return vec;
  }

  // ---------------------------------------------------------------------------
  // Similarity
  // ---------------------------------------------------------------------------

  /** Cosine similarity between two TF-IDF vectors. */
  static cosineSimilarity(
    a: Map<string, number>,
    b: Map<string, number>,
  ): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const [term, valA] of a) {
      dot += valA * (b.get(term) ?? 0);
      normA += valA * valA;
    }
    for (const valB of b.values()) {
      normB += valB * valB;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /** Cosine similarity between two documents by id. */
  similarity(docIdA: string, docIdB: string): number {
    return TFIDF.cosineSimilarity(this.vector(docIdA), this.vector(docIdB));
  }

  /** Similarity between a document and arbitrary query text. */
  querySimlarity(docId: string, queryText: string): number {
    return TFIDF.cosineSimilarity(
      this.vector(docId),
      this.vectorForText(queryText),
    );
  }

  // ---------------------------------------------------------------------------
  // Keyword extraction
  // ---------------------------------------------------------------------------

  /**
   * Return the top-N keywords for a document ranked by TF-IDF score.
   */
  topKeywords(docId: string, topN = 10): Keyword[] {
    const vec = this.vector(docId);
    return Array.from(vec.entries())
      .map(([word, score]) => ({ word, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  /**
   * Batch: compute top keywords for every document in the corpus.
   */
  topKeywordsAll(topN = 10): Map<string, Keyword[]> {
    const result = new Map<string, Keyword[]>();
    for (const id of this.documents.keys()) {
      result.set(id, this.topKeywords(id, topN));
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Batch pairwise similarity matrix
  // ---------------------------------------------------------------------------

  /**
   * Compute an N×N similarity matrix for all documents.
   * Returns a Map from docId → Map<docId, similarity>.
   */
  pairwiseSimilarityMatrix(): Map<string, Map<string, number>> {
    const ids = Array.from(this.documents.keys());
    const vectors = ids.map((id) => ({ id, vec: this.vector(id) }));
    const matrix = new Map<string, Map<string, number>>();

    for (let i = 0; i < vectors.length; i++) {
      const row = new Map<string, number>();
      const a = vectors[i]!;
      for (let j = 0; j < vectors.length; j++) {
        const b = vectors[j]!;
        const sim =
          i === j ? 1.0 : TFIDF.cosineSimilarity(a.vec, b.vec);
        row.set(b.id, sim);
      }
      matrix.set(a.id, row);
    }

    return matrix;
  }

  // ---------------------------------------------------------------------------
  // Introspection
  // ---------------------------------------------------------------------------

  getDocument(id: string): TFIDFDocument | undefined {
    return this.documents.get(id);
  }

  allDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  /** Number of unique terms across the corpus. */
  get vocabularySize(): number {
    return this.documentFrequency.size;
  }
}
