/**
 * String and document similarity metrics:
 * Cosine, Jaccard, Dice, Levenshtein, Jaro-Winkler, LCS,
 * character n-gram similarity, and batch pairwise matrix.
 */

import { generateCharNgrams } from "./tokenizer.js";
import type { SimilarityResult } from "./types.js";

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

function dotProduct(a: Map<string, number>, b: Map<string, number>): number {
  let sum = 0;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (bv !== undefined) sum += v * bv;
  }
  return sum;
}

function magnitude(v: Map<string, number>): number {
  let sum = 0;
  for (const val of v.values()) sum += val * val;
  return Math.sqrt(sum);
}

// ---------------------------------------------------------------------------
// Cosine similarity (vector space)
// ---------------------------------------------------------------------------

export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

/** Text-level cosine similarity using term frequency vectors. */
export function cosineTextSimilarity(textA: string, textB: string): SimilarityResult {
  const vecA = termFrequencyVector(textA);
  const vecB = termFrequencyVector(textB);
  return { score: cosineSimilarity(vecA, vecB), method: "cosine" };
}

function termFrequencyVector(text: string): Map<string, number> {
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) ?? [];
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return freq;
}

// ---------------------------------------------------------------------------
// Jaccard similarity
// ---------------------------------------------------------------------------

export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}

/** Text-level Jaccard on word sets. */
export function jaccardTextSimilarity(textA: string, textB: string): SimilarityResult {
  const wordsA = new Set((textA.toLowerCase().match(/\b[a-z]+\b/g) ?? []));
  const wordsB = new Set((textB.toLowerCase().match(/\b[a-z]+\b/g) ?? []));
  return { score: jaccardSimilarity(wordsA, wordsB), method: "jaccard" };
}

// ---------------------------------------------------------------------------
// Dice coefficient
// ---------------------------------------------------------------------------

export function diceCoefficient(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  return (2 * intersection) / (setA.size + setB.size);
}

/** Text-level Dice coefficient on bigram character sets. */
export function diceTextSimilarity(textA: string, textB: string): SimilarityResult {
  const bigramsA = new Set(generateCharNgrams(textA.toLowerCase(), 2));
  const bigramsB = new Set(generateCharNgrams(textB.toLowerCase(), 2));
  return { score: diceCoefficient(bigramsA, bigramsB), method: "dice" };
}

// ---------------------------------------------------------------------------
// Levenshtein distance
// ---------------------------------------------------------------------------

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use two-row DP to save memory
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,         // deletion
        (curr[j - 1] ?? 0) + 1,     // insertion
        (prev[j - 1] ?? 0) + cost,  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n] ?? 0;
}

/** Normalised Levenshtein similarity in [0,1]. */
export function levenshteinSimilarity(a: string, b: string): SimilarityResult {
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  const score = maxLen === 0 ? 1 : 1 - dist / maxLen;
  return { score, method: "levenshtein" };
}

// ---------------------------------------------------------------------------
// Jaro similarity
// ---------------------------------------------------------------------------

export function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  );
}

// ---------------------------------------------------------------------------
// Jaro-Winkler distance
// ---------------------------------------------------------------------------

export function jaroWinklerSimilarity(
  s1: string,
  s2: string,
  prefixWeight = 0.1,
): SimilarityResult {
  const jaro = jaroSimilarity(s1, s2);
  const prefixLen = Math.min(
    4,
    [...s1].findIndex((c, i) => c !== s2[i]) === -1
      ? Math.min(s1.length, s2.length)
      : [...s1].findIndex((c, i) => c !== s2[i]),
  );
  const score = jaro + prefixLen * prefixWeight * (1 - jaro);
  return { score: Math.min(1, score), method: "jaro-winkler" };
}

// ---------------------------------------------------------------------------
// Longest Common Subsequence
// ---------------------------------------------------------------------------

export function longestCommonSubsequence(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Two-row DP
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = (prev[j - 1] ?? 0) + 1;
      } else {
        curr[j] = Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev[n] ?? 0;
}

/** Normalised LCS similarity. */
export function lcsSimilarity(a: string, b: string): SimilarityResult {
  const lcs = longestCommonSubsequence(a, b);
  const maxLen = Math.max(a.length, b.length);
  const score = maxLen === 0 ? 1 : lcs / maxLen;
  return { score, method: "lcs" };
}

// ---------------------------------------------------------------------------
// Character n-gram similarity
// ---------------------------------------------------------------------------

export function ngramSimilarity(
  a: string,
  b: string,
  n = 3,
): SimilarityResult {
  const ngramsA = new Set(generateCharNgrams(a.toLowerCase(), n));
  const ngramsB = new Set(generateCharNgrams(b.toLowerCase(), n));
  const score = diceCoefficient(ngramsA, ngramsB);
  return { score, method: `ngram-${n}` };
}

// ---------------------------------------------------------------------------
// Document similarity using pre-computed TF-IDF vectors
// ---------------------------------------------------------------------------

export function documentSimilarity(
  vecA: Map<string, number>,
  vecB: Map<string, number>,
): SimilarityResult {
  return { score: cosineSimilarity(vecA, vecB), method: "tfidf-cosine" };
}

// ---------------------------------------------------------------------------
// Batch pairwise similarity matrix
// ---------------------------------------------------------------------------

export interface PairwiseOptions {
  method?: "cosine" | "jaccard" | "dice" | "levenshtein" | "ngram";
  ngramSize?: number;
}

export function pairwiseSimilarityMatrix(
  texts: string[],
  options: PairwiseOptions = {},
): number[][] {
  const { method = "cosine", ngramSize = 3 } = options;
  const n = texts.length;
  const matrix: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );

  const getSim = (a: string, b: string): number => {
    switch (method) {
      case "cosine":
        return cosineTextSimilarity(a, b).score;
      case "jaccard":
        return jaccardTextSimilarity(a, b).score;
      case "dice":
        return diceTextSimilarity(a, b).score;
      case "levenshtein":
        return levenshteinSimilarity(a, b).score;
      case "ngram":
        return ngramSimilarity(a, b, ngramSize).score;
    }
  };

  for (let i = 0; i < n; i++) {
    matrix[i]![i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sim = getSim(texts[i]!, texts[j]!);
      matrix[i]![j] = sim;
      matrix[j]![i] = sim;
    }
  }

  return matrix;
}
