/**
 * Extractive text summarization using TextRank-based sentence ranking
 * combined with position, TF-IDF, length, and keyword-presence scoring.
 */

import { segmentSentences, tokenizeWords, ENGLISH_STOP_WORDS } from "./tokenizer.js";
import { TFIDF } from "./tfidf.js";
import { cosineSimilarity } from "./similarity.js";
import type { SummarizationResult } from "./types.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SummarizerOptions {
  /** Fraction of sentences to include (0 < ratio ≤ 1). Used when sentenceCount is not set. */
  ratio?: number;
  /** Exact number of sentences in the summary (overrides ratio). */
  sentenceCount?: number;
  /** TextRank damping factor */
  dampingFactor?: number;
  /** TextRank iterations */
  iterations?: number;
  /** Weight for position score (0..1) */
  positionWeight?: number;
  /** Weight for TF-IDF score (0..1) */
  tfidfWeight?: number;
  /** Weight for TextRank score (0..1) */
  textrankWeight?: number;
  /** Weight for sentence length score (0..1) */
  lengthWeight?: number;
  /** Weight for title similarity score (0..1, requires title) */
  titleWeight?: number;
  /** Document title (optional, boosts sentences similar to title) */
  title?: string;
}

const DEFAULT_OPTIONS: Required<Omit<SummarizerOptions, "title">> = {
  ratio: 0.3,
  sentenceCount: 0,
  dampingFactor: 0.85,
  iterations: 30,
  positionWeight: 0.15,
  tfidfWeight: 0.35,
  textrankWeight: 0.35,
  lengthWeight: 0.10,
  titleWeight: 0.05,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function termFrequencyVector(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const total = tokens.length || 1;
  for (const [t, c] of freq) freq.set(t, c / total);
  return freq;
}

function sentenceTokens(sentence: string): string[] {
  return tokenizeWords(sentence)
    .map((w) => w.toLowerCase())
    .filter((w) => /^[a-z]/.test(w) && !ENGLISH_STOP_WORDS.has(w) && w.length > 2);
}

/** Ideal sentence length in words (for scoring purposes). */
const IDEAL_LENGTH = 20;

function lengthScore(sentence: string): number {
  const wordCount = sentence.split(/\s+/).length;
  if (wordCount === 0) return 0;
  const diff = Math.abs(wordCount - IDEAL_LENGTH);
  return Math.max(0, 1 - diff / IDEAL_LENGTH);
}

function positionScore(index: number, total: number): number {
  // Sentences at the beginning and end of a document tend to be more important.
  if (total <= 1) return 1;
  const norm = index / (total - 1); // 0..1
  // Favor first third and last fifth
  if (norm <= 0.33) return 1 - norm;
  if (norm >= 0.8) return norm;
  return 0.3;
}

// ---------------------------------------------------------------------------
// Sentence graph (for TextRank)
// ---------------------------------------------------------------------------

function buildSentenceGraph(
  sentenceVectors: Array<Map<string, number>>,
): number[][] {
  const n = sentenceVectors.length;
  const graph: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        graph[i]![j] = cosineSimilarity(sentenceVectors[i]!, sentenceVectors[j]!);
      }
    }
  }
  return graph;
}

function textRankScores(graph: number[][], opts: { dampingFactor: number; iterations: number }): number[] {
  const n = graph.length;
  if (n === 0) return [];

  let scores = new Array<number>(n).fill(1.0);

  for (let iter = 0; iter < opts.iterations; iter++) {
    const newScores = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        // Sum of outgoing weights from j
        const rowSum = graph[j]!.reduce((s, v) => s + v, 0);
        if (rowSum > 0) {
          newScores[i]! += (graph[j]![i]! / rowSum) * scores[j]!;
        }
      }
      newScores[i] = (1 - opts.dampingFactor) + opts.dampingFactor * newScores[i]!;
    }
    scores = newScores;
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Summarizer
// ---------------------------------------------------------------------------

export class Summarizer {
  private readonly opts: Required<Omit<SummarizerOptions, "title">> & { title: string | undefined };

  constructor(options: SummarizerOptions = {}) {
    this.opts = {
      ...DEFAULT_OPTIONS,
      ...options,
      title: options.title,
    };
  }

  summarize(text: string, overrideOptions: Partial<SummarizerOptions> = {}): SummarizationResult {
    const opts = { ...this.opts, ...overrideOptions };

    const sentences = segmentSentences(text).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) {
      return { summary: "", selectedSentenceIndices: [], sentenceScores: [] };
    }
    if (sentences.length === 1) {
      return {
        summary: sentences[0]!,
        selectedSentenceIndices: [0],
        sentenceScores: [1],
      };
    }

    // 1. Build TF-IDF corpus from sentences
    const tfidf = new TFIDF();
    sentences.forEach((s, i) => tfidf.addDocument(String(i), s));

    // 2. Per-sentence token vectors
    const tokenLists = sentences.map((s) => sentenceTokens(s));
    const tfVectors = tokenLists.map((toks) => termFrequencyVector(toks));

    // 3. TF-IDF scores (average TF-IDF of tokens in sentence)
    const tfidfScores = sentences.map((_, i) => {
      const vec = tfidf.vector(String(i));
      if (vec.size === 0) return 0;
      const sum = Array.from(vec.values()).reduce((a, b) => a + b, 0);
      return sum / vec.size;
    });

    // 4. Normalize tfidf scores to [0,1]
    const maxTfidf = Math.max(...tfidfScores, 1e-9);
    const normTfidf = tfidfScores.map((s) => s / maxTfidf);

    // 5. TextRank scores
    const graph = buildSentenceGraph(tfVectors);
    const trScores = textRankScores(graph, {
      dampingFactor: opts.dampingFactor,
      iterations: opts.iterations,
    });
    const maxTR = Math.max(...trScores, 1e-9);
    const normTR = trScores.map((s) => s / maxTR);

    // 6. Position scores
    const posScores = sentences.map((_, i) => positionScore(i, sentences.length));

    // 7. Length scores
    const lenScores = sentences.map((s) => lengthScore(s));

    // 8. Title similarity scores
    let titleScores = sentences.map(() => 0);
    if (opts.title) {
      const titleVec = termFrequencyVector(sentenceTokens(opts.title));
      titleScores = tfVectors.map((vec) => cosineSimilarity(vec, titleVec));
    }

    // 9. Combined scores
    const combinedScores = sentences.map((_, i) => {
      return (
        opts.positionWeight * posScores[i]! +
        opts.tfidfWeight * normTfidf[i]! +
        opts.textrankWeight * normTR[i]! +
        opts.lengthWeight * lenScores[i]! +
        opts.titleWeight * titleScores[i]!
      );
    });

    // 10. Determine how many sentences to include
    const targetCount =
      opts.sentenceCount > 0
        ? Math.min(opts.sentenceCount, sentences.length)
        : Math.max(1, Math.round(sentences.length * opts.ratio));

    // 11. Select top-scoring sentences (maintain original order)
    const ranked = combinedScores
      .map((score, i) => ({ score, i }))
      .sort((a, b) => b.score - a.score)
      .slice(0, targetCount)
      .map(({ i }) => i)
      .sort((a, b) => a - b);

    const summary = ranked.map((i) => sentences[i]).join(" ");

    return {
      summary,
      selectedSentenceIndices: ranked,
      sentenceScores: combinedScores,
    };
  }

  /**
   * Paragraph-aware summarization: summarize each paragraph separately,
   * then combine into a final summary.
   */
  summarizeParagraphs(
    text: string,
    paragraphRatio = 0.5,
  ): SummarizationResult {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    if (paragraphs.length <= 1) {
      return this.summarize(text);
    }

    const paragraphSummaries: string[] = [];
    const allIndices: number[] = [];
    const allScores: number[] = [];
    let sentenceOffset = 0;

    for (const para of paragraphs) {
      const result = this.summarize(para, { ratio: paragraphRatio });
      paragraphSummaries.push(result.summary);
      allIndices.push(...result.selectedSentenceIndices.map((i) => i + sentenceOffset));
      allScores.push(...result.sentenceScores);
      sentenceOffset += segmentSentences(para).length;
    }

    return {
      summary: paragraphSummaries.filter(Boolean).join(" "),
      selectedSentenceIndices: allIndices,
      sentenceScores: allScores,
    };
  }
}
