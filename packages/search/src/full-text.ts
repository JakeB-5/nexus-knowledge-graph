import type { IndexedDocument, SearchHit, SearchIndex, SearchOptions } from "./types.js";
import { tokenize } from "./tokenizer.js";

interface InvertedIndexEntry {
  docId: string;
  field: "title" | "content";
  tf: number; // term frequency
}

/**
 * In-memory BM25-based full-text search engine.
 */
export class FullTextSearchEngine implements SearchIndex {
  private documents = new Map<string, IndexedDocument>();
  private invertedIndex = new Map<string, InvertedIndexEntry[]>();
  private docLengths = new Map<string, number>();
  private avgDocLength = 0;

  // BM25 parameters
  private k1 = 1.2;
  private b = 0.75;

  get size(): number {
    return this.documents.size;
  }

  add(doc: IndexedDocument): void {
    // Remove existing if updating
    if (this.documents.has(doc.id)) {
      this.remove(doc.id);
    }

    this.documents.set(doc.id, doc);

    const titleTokens = tokenize(doc.title);
    const contentTokens = tokenize(doc.content);
    const totalLength = titleTokens.length + contentTokens.length;
    this.docLengths.set(doc.id, totalLength);

    // Update avg doc length
    this.recalculateAvgLength();

    // Index title tokens (boosted)
    this.indexTokens(doc.id, "title", titleTokens);

    // Index content tokens
    this.indexTokens(doc.id, "content", contentTokens);
  }

  remove(id: string): void {
    if (!this.documents.has(id)) return;

    this.documents.delete(id);
    this.docLengths.delete(id);

    // Remove from inverted index
    for (const [term, entries] of this.invertedIndex) {
      const filtered = entries.filter((e) => e.docId !== id);
      if (filtered.length === 0) {
        this.invertedIndex.delete(term);
      } else {
        this.invertedIndex.set(term, filtered);
      }
    }

    this.recalculateAvgLength();
  }

  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const { limit = 20, offset = 0, types, minScore = 0 } = options;
    const queryTokens = tokenize(query);

    if (queryTokens.length === 0) return [];

    const scores = new Map<string, number>();

    for (const token of queryTokens) {
      const entries = this.invertedIndex.get(token);
      if (!entries) continue;

      const df = entries.length;
      const idf = Math.log(1 + (this.documents.size - df + 0.5) / (df + 0.5));

      for (const entry of entries) {
        const docLength = this.docLengths.get(entry.docId) ?? 0;
        const tfNorm =
          (entry.tf * (this.k1 + 1)) /
          (entry.tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)));

        // Boost title matches
        const boost = entry.field === "title" ? 2.0 : 1.0;
        const score = idf * tfNorm * boost;

        scores.set(entry.docId, (scores.get(entry.docId) ?? 0) + score);
      }
    }

    let results: SearchHit[] = Array.from(scores.entries())
      .filter(([, score]) => score >= minScore)
      .map(([id, score]) => ({
        id,
        score,
        highlights: this.getHighlights(id, queryTokens),
      }));

    // Filter by type
    if (types && types.length > 0) {
      const typeSet = new Set(types);
      results = results.filter((r) => {
        const doc = this.documents.get(r.id);
        return doc && typeSet.has(doc.type);
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(offset, offset + limit);
  }

  clear(): void {
    this.documents.clear();
    this.invertedIndex.clear();
    this.docLengths.clear();
    this.avgDocLength = 0;
  }

  private indexTokens(docId: string, field: "title" | "content", tokens: string[]): void {
    const termFreqs = new Map<string, number>();
    for (const token of tokens) {
      termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
    }

    for (const [term, tf] of termFreqs) {
      const entries = this.invertedIndex.get(term) ?? [];
      entries.push({ docId, field, tf });
      this.invertedIndex.set(term, entries);
    }
  }

  private recalculateAvgLength(): void {
    if (this.docLengths.size === 0) {
      this.avgDocLength = 0;
      return;
    }
    let total = 0;
    for (const len of this.docLengths.values()) {
      total += len;
    }
    this.avgDocLength = total / this.docLengths.size;
  }

  private getHighlights(docId: string, queryTokens: string[]): string[] {
    const doc = this.documents.get(docId);
    if (!doc) return [];

    const highlights: string[] = [];
    const querySet = new Set(queryTokens);
    const sentences = doc.content.split(/[.!?\n]+/).filter((s) => s.trim().length > 0);

    for (const sentence of sentences) {
      const tokens = tokenize(sentence, false);
      if (tokens.some((t) => querySet.has(t.toLowerCase()))) {
        highlights.push(sentence.trim());
        if (highlights.length >= 3) break;
      }
    }

    return highlights;
  }
}
