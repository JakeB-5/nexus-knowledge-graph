/**
 * Keyword extraction using RAKE (Rapid Automatic Keyword Extraction)
 * and TextRank algorithms.
 */

import { Tokenizer, segmentSentences, tokenizeWords, ENGLISH_STOP_WORDS } from "./tokenizer.js";
import type { Keyword } from "./types.js";

export interface KeywordExtractorOptions {
  /** Maximum number of keywords to return */
  maxKeywords?: number;
  /** Minimum term frequency to consider a candidate */
  minFrequency?: number;
  /** Maximum words in a candidate phrase */
  maxPhraseLength?: number;
  /** Minimum words in a candidate phrase */
  minPhraseLength?: number;
  /** Additional stop words to suppress */
  extraStopWords?: Set<string>;
}

// ---------------------------------------------------------------------------
// RAKE – Rapid Automatic Keyword Extraction
// ---------------------------------------------------------------------------

export class RakeExtractor {
  private readonly stopWords: Set<string>;
  private readonly maxKeywords: number;
  private readonly maxPhraseLength: number;
  private readonly minPhraseLength: number;
  private readonly minFrequency: number;

  constructor(options: KeywordExtractorOptions = {}) {
    this.maxKeywords = options.maxKeywords ?? 20;
    this.maxPhraseLength = options.maxPhraseLength ?? 4;
    this.minPhraseLength = options.minPhraseLength ?? 1;
    this.minFrequency = options.minFrequency ?? 1;
    this.stopWords = new Set([
      ...ENGLISH_STOP_WORDS,
      ...(options.extraStopWords ?? []),
    ]);
  }

  extract(text: string): Keyword[] {
    const sentences = segmentSentences(text);
    const candidates = this.extractCandidates(sentences);
    const scores = this.scorePhrasesRAKE(candidates);

    return Array.from(scores.entries())
      .map(([word, score]) => ({ word, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxKeywords);
  }

  private extractCandidates(sentences: string[]): string[][] {
    const candidates: string[][] = [];

    for (const sentence of sentences) {
      const words = tokenizeWords(sentence)
        .map((w) => w.toLowerCase())
        .filter((w) => /^[a-z]/.test(w));

      let current: string[] = [];
      for (const word of words) {
        if (this.stopWords.has(word) || /^\W+$/.test(word)) {
          if (
            current.length >= this.minPhraseLength &&
            current.length <= this.maxPhraseLength
          ) {
            candidates.push([...current]);
          }
          current = [];
        } else {
          current.push(word);
          if (current.length === this.maxPhraseLength) {
            candidates.push([...current]);
            current = [];
          }
        }
      }
      if (
        current.length >= this.minPhraseLength &&
        current.length <= this.maxPhraseLength
      ) {
        candidates.push([...current]);
      }
    }

    return candidates;
  }

  private scorePhrasesRAKE(candidates: string[][]): Map<string, number> {
    // Word frequency and degree maps
    const freq = new Map<string, number>();
    const degree = new Map<string, number>();

    for (const phrase of candidates) {
      const len = phrase.length;
      for (const word of phrase) {
        freq.set(word, (freq.get(word) ?? 0) + 1);
        degree.set(word, (degree.get(word) ?? 0) + len - 1);
      }
    }

    // Word score = degree / frequency
    const wordScore = new Map<string, number>();
    for (const word of freq.keys()) {
      const f = freq.get(word)!;
      if (f < this.minFrequency) continue;
      wordScore.set(word, ((degree.get(word) ?? 0) + f) / f);
    }

    // Phrase score = sum of word scores
    const phraseScores = new Map<string, number>();
    for (const phrase of candidates) {
      const key = phrase.join(" ");
      if (phraseScores.has(key)) continue;
      let score = 0;
      for (const word of phrase) {
        score += wordScore.get(word) ?? 0;
      }
      phraseScores.set(key, score);
    }

    return phraseScores;
  }
}

// ---------------------------------------------------------------------------
// Co-occurrence matrix (used by TextRank)
// ---------------------------------------------------------------------------

class CoOccurrenceMatrix {
  private readonly matrix = new Map<string, Map<string, number>>();

  add(termA: string, termB: string, weight = 1): void {
    if (termA === termB) return;
    this.set(termA, termB, (this.get(termA, termB) ?? 0) + weight);
    this.set(termB, termA, (this.get(termB, termA) ?? 0) + weight);
  }

  get(a: string, b: string): number {
    return this.matrix.get(a)?.get(b) ?? 0;
  }

  private set(a: string, b: string, v: number): void {
    if (!this.matrix.has(a)) this.matrix.set(a, new Map());
    this.matrix.get(a)!.set(b, v);
  }

  neighbours(term: string): Map<string, number> {
    return this.matrix.get(term) ?? new Map();
  }

  allTerms(): string[] {
    return Array.from(this.matrix.keys());
  }
}

// ---------------------------------------------------------------------------
// TextRank keyword extraction
// ---------------------------------------------------------------------------

export class TextRankKeywordExtractor {
  private readonly tokenizer: Tokenizer;
  private readonly maxKeywords: number;
  private readonly windowSize: number;
  private readonly iterations: number;
  private readonly dampingFactor: number;
  private readonly minFrequency: number;

  constructor(options: KeywordExtractorOptions & {
    windowSize?: number;
    iterations?: number;
    dampingFactor?: number;
  } = {}) {
    this.tokenizer = new Tokenizer({
      stem: false,
      removeStopWords: true,
      extraStopWords: options.extraStopWords,
    });
    this.maxKeywords = options.maxKeywords ?? 20;
    this.windowSize = options.windowSize ?? 4;
    this.iterations = options.iterations ?? 30;
    this.dampingFactor = options.dampingFactor ?? 0.85;
    this.minFrequency = options.minFrequency ?? 1;
  }

  extract(text: string): Keyword[] {
    const result = this.tokenizer.tokenize(text);
    const tokens = result.normalizedTokens;

    if (tokens.length === 0) return [];

    // Count frequencies
    const freq = new Map<string, number>();
    for (const t of tokens) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }

    // Filter by minimum frequency
    const vocab = Array.from(freq.entries())
      .filter(([, f]) => f >= this.minFrequency)
      .map(([t]) => t);

    const vocabSet = new Set(vocab);

    // Build co-occurrence matrix using sliding window
    const coMatrix = new CoOccurrenceMatrix();
    for (let i = 0; i < tokens.length; i++) {
      const a = tokens[i]!;
      if (!vocabSet.has(a)) continue;
      for (let j = i + 1; j < Math.min(i + this.windowSize, tokens.length); j++) {
        const b = tokens[j]!;
        if (vocabSet.has(b)) {
          coMatrix.add(a, b);
        }
      }
    }

    // Initialize scores
    const scores = new Map<string, number>();
    for (const term of vocab) {
      scores.set(term, 1.0);
    }

    // TextRank iterations
    for (let iter = 0; iter < this.iterations; iter++) {
      const newScores = new Map<string, number>();
      for (const term of vocab) {
        const neighbours = coMatrix.neighbours(term);
        let sum = 0;
        for (const [neighbour, weight] of neighbours) {
          const neighbourNeighbours = coMatrix.neighbours(neighbour);
          const totalWeight = Array.from(neighbourNeighbours.values()).reduce(
            (acc, w) => acc + w,
            0,
          );
          if (totalWeight > 0) {
            sum += (weight / totalWeight) * (scores.get(neighbour) ?? 1.0);
          }
        }
        newScores.set(
          term,
          (1 - this.dampingFactor) + this.dampingFactor * sum,
        );
      }
      for (const [term, score] of newScores) {
        scores.set(term, score);
      }
    }

    return Array.from(scores.entries())
      .map(([word, score]) => ({ word, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxKeywords);
  }
}

// ---------------------------------------------------------------------------
// Combined KeywordExtractor (facade)
// ---------------------------------------------------------------------------

export type KeywordAlgorithm = "rake" | "textrank";

export class KeywordExtractor {
  private readonly rake: RakeExtractor;
  private readonly textrank: TextRankKeywordExtractor;
  private readonly defaultAlgorithm: KeywordAlgorithm;

  constructor(
    options: KeywordExtractorOptions & {
      algorithm?: KeywordAlgorithm;
    } = {},
  ) {
    this.rake = new RakeExtractor(options);
    this.textrank = new TextRankKeywordExtractor(options);
    this.defaultAlgorithm = options.algorithm ?? "rake";
  }

  extract(
    text: string,
    algorithm: KeywordAlgorithm = this.defaultAlgorithm,
  ): Keyword[] {
    if (algorithm === "rake") {
      return this.rake.extract(text);
    }
    return this.textrank.extract(text);
  }

  /**
   * Merge results from both algorithms with averaged scores.
   */
  extractCombined(text: string): Keyword[] {
    const rakeResults = this.rake.extract(text);
    const textrankResults = this.textrank.extract(text);

    const combined = new Map<string, number>();

    const normalize = (results: Keyword[]): void => {
      const max = results[0]?.score ?? 1;
      for (const kw of results) {
        const norm = max > 0 ? kw.score / max : 0;
        combined.set(kw.word, (combined.get(kw.word) ?? 0) + norm * 0.5);
      }
    };

    normalize(rakeResults);
    normalize(textrankResults);

    return Array.from(combined.entries())
      .map(([word, score]) => ({ word, score }))
      .sort((a, b) => b.score - a.score);
  }
}
