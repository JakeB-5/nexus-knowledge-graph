/**
 * Advanced tokenizer with sentence segmentation, n-gram generation,
 * Porter stemming, and configurable stop-word filtering.
 */

import type { TokenizerResult } from "./types.js";

// ---------------------------------------------------------------------------
// Stop words
// ---------------------------------------------------------------------------

const ENGLISH_STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "dare", "ought", "used", "it", "its", "this", "that", "these", "those",
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you",
  "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself",
  "she", "her", "hers", "herself", "they", "them", "their", "theirs",
  "themselves", "what", "which", "who", "whom", "when", "where", "why",
  "how", "all", "both", "each", "few", "more", "most", "other", "some",
  "such", "no", "not", "only", "same", "so", "than", "too", "very",
  "just", "because", "if", "then", "else", "while", "about", "against",
  "between", "into", "through", "during", "before", "after", "above",
  "below", "up", "down", "out", "off", "over", "under", "again", "further",
  "once", "here", "there", "any", "also", "get", "got", "like", "well",
  "back", "even", "still", "way", "take", "every", "new", "give", "day",
  "us", "now", "said",
]);

// ---------------------------------------------------------------------------
// Porter Stemmer (English)
// Adapted from the original Porter algorithm specification.
// ---------------------------------------------------------------------------

function hasCVC(word: string): boolean {
  // Returns true if word ends with consonant-vowel-consonant where the last
  // consonant is not w, x, or y.
  const len = word.length;
  if (len < 3) return false;
  const c = word[len - 1]!;
  const v = word[len - 2]!;
  const c2 = word[len - 3]!;
  const isVowel = (ch: string) => /[aeiou]/.test(ch);
  return (
    !isVowel(c) &&
    !/[wxy]/.test(c) &&
    isVowel(v) &&
    !isVowel(c2)
  );
}

function measure(stem: string): number {
  // Count the number of VC sequences (measure) in a word stem.
  let count = 0;
  let inVowel = false;
  for (const ch of stem) {
    if (/[aeiou]/.test(ch)) {
      inVowel = true;
    } else {
      if (inVowel) count++;
      inVowel = false;
    }
  }
  return count;
}

function containsVowel(stem: string): boolean {
  return /[aeiou]/.test(stem);
}

function endsWithDouble(stem: string): boolean {
  if (stem.length < 2) return false;
  const last = stem[stem.length - 1]!;
  return stem[stem.length - 2] === last && !/[aeiouylsz]/.test(last) === false
    ? /[^aeiou]/.test(last) && stem[stem.length - 2] === last
    : false;
}

function doubleConsonant(stem: string): boolean {
  const len = stem.length;
  if (len < 2) return false;
  return stem[len - 1] === stem[len - 2]! && !/[aeiou]/.test(stem[len - 1]!);
}

export function porterStem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 2) return w;

  // Step 1a
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -2);
  else if (w.endsWith("ss")) { /* no-op */ }
  else if (w.endsWith("s")) w = w.slice(0, -1);

  // Step 1b
  let step1bFlag = false;
  if (w.endsWith("eed")) {
    const stem = w.slice(0, -3);
    if (measure(stem) > 0) w = w.slice(0, -1);
  } else if (w.endsWith("ed")) {
    const stem = w.slice(0, -2);
    if (containsVowel(stem)) {
      w = stem;
      step1bFlag = true;
    }
  } else if (w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    if (containsVowel(stem)) {
      w = stem;
      step1bFlag = true;
    }
  }

  if (step1bFlag) {
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) {
      w += "e";
    } else if (doubleConsonant(w) && !/[lsz]$/.test(w)) {
      w = w.slice(0, -1);
    } else if (measure(w) === 1 && hasCVC(w)) {
      w += "e";
    }
  }

  // Step 1c
  if (w.endsWith("y") && containsVowel(w.slice(0, -1))) {
    w = w.slice(0, -1) + "i";
  }

  // Step 2
  const step2Map: [string, string][] = [
    ["ational", "ate"], ["tional", "tion"], ["enci", "ence"],
    ["anci", "ance"], ["izer", "ize"], ["abli", "able"],
    ["alli", "al"], ["entli", "ent"], ["eli", "e"],
    ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"],
    ["ator", "ate"], ["alism", "al"], ["iveness", "ive"],
    ["fulness", "ful"], ["ousness", "ous"], ["aliti", "al"],
    ["iviti", "ive"], ["biliti", "ble"],
  ];
  for (const [suffix, replacement] of step2Map) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (measure(stem) > 0) {
        w = stem + replacement;
      }
      break;
    }
  }

  // Step 3
  const step3Map: [string, string][] = [
    ["icate", "ic"], ["ative", ""], ["alize", "al"],
    ["iciti", "ic"], ["ical", "ic"], ["ful", ""], ["ness", ""],
  ];
  for (const [suffix, replacement] of step3Map) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (measure(stem) > 0) {
        w = stem + replacement;
      }
      break;
    }
  }

  // Step 4
  const step4List = [
    "al", "ance", "ence", "er", "ic", "able", "ible", "ant",
    "ement", "ment", "ent", "ion", "ou", "ism", "ate", "iti",
    "ous", "ive", "ize",
  ];
  for (const suffix of step4List) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (suffix === "ion") {
        if (measure(stem) > 1 && /[st]$/.test(stem)) {
          w = stem;
        }
      } else if (measure(stem) > 1) {
        w = stem;
      }
      break;
    }
  }

  // Step 5a
  if (w.endsWith("e")) {
    const stem = w.slice(0, -1);
    if (measure(stem) > 1) {
      w = stem;
    } else if (measure(stem) === 1 && !hasCVC(stem)) {
      w = stem;
    }
  }

  // Step 5b
  if (measure(w) > 1 && doubleConsonant(w) && w.endsWith("l")) {
    w = w.slice(0, -1);
  }

  return w;
}

// ---------------------------------------------------------------------------
// Sentence segmentation
// ---------------------------------------------------------------------------

/**
 * Split text into sentences using punctuation heuristics.
 * Handles abbreviations, initials, and decimal numbers to avoid false splits.
 */
export function segmentSentences(text: string): string[] {
  // Protect common abbreviations and initials
  const protected_ = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|St|Ave|Blvd)\./gi, "$1<DOT>")
    .replace(/\b([A-Z])\./g, "$1<DOT>")   // initials like "J. K."
    .replace(/(\d+)\.(\d+)/g, "$1<DOT>$2"); // decimals

  const raw = protected_.split(/(?<=[.!?])\s+(?=[A-Z"'])/);
  return raw
    .map((s) => s.replace(/<DOT>/g, ".").trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Word tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize a string into words and punctuation tokens.
 * Keeps contractions together (it's → it's) but splits punctuation
 * that is not part of a word.
 */
export function tokenizeWords(text: string): string[] {
  // Split on whitespace then further split punctuation attached to words
  const tokens: string[] = [];
  const raw = text.split(/\s+/);
  for (const chunk of raw) {
    if (chunk.length === 0) continue;
    // Extract leading punctuation
    const leadMatch = chunk.match(/^([^a-zA-Z0-9']+)(.*)$/);
    let rest = chunk;
    if (leadMatch) {
      if (leadMatch[1]) tokens.push(leadMatch[1]);
      rest = leadMatch[2] ?? "";
    }
    if (rest.length === 0) continue;
    // Extract trailing punctuation (keep .')
    const trailMatch = rest.match(/^(.*?)([^a-zA-Z0-9']+)$/);
    if (trailMatch && trailMatch[2] !== "'" ) {
      if (trailMatch[1]) tokens.push(trailMatch[1]);
      if (trailMatch[2]) tokens.push(trailMatch[2]);
    } else {
      tokens.push(rest);
    }
  }
  return tokens.filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// N-gram generation
// ---------------------------------------------------------------------------

export function generateNgrams(tokens: string[], n: number): string[][] {
  const result: string[][] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    result.push(tokens.slice(i, i + n));
  }
  return result;
}

export function generateCharNgrams(text: string, n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i <= text.length - n; i++) {
    result.push(text.slice(i, i + n));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Token normalization
// ---------------------------------------------------------------------------

export interface NormalizationOptions {
  lowercase?: boolean;
  stem?: boolean;
  removeStopWords?: boolean;
  extraStopWords?: Set<string>;
  minLength?: number;
}

export function normalizeTokens(
  tokens: string[],
  options: NormalizationOptions = {},
): string[] {
  const {
    lowercase = true,
    stem = true,
    removeStopWords = true,
    extraStopWords = new Set<string>(),
    minLength = 2,
  } = options;

  return tokens
    .filter((t) => /[a-zA-Z]/.test(t)) // only alphabetic tokens
    .map((t) => (lowercase ? t.toLowerCase() : t))
    .filter((t) => t.length >= minLength)
    .filter((t) => {
      if (!removeStopWords) return true;
      return !ENGLISH_STOP_WORDS.has(t) && !extraStopWords.has(t);
    })
    .map((t) => (stem ? porterStem(t) : t));
}

// ---------------------------------------------------------------------------
// Main Tokenizer class
// ---------------------------------------------------------------------------

export interface TokenizerOptions extends NormalizationOptions {
  charNgramSize?: number;
}

export class Tokenizer {
  private readonly options: Required<TokenizerOptions>;

  constructor(options: TokenizerOptions = {}) {
    this.options = {
      lowercase: options.lowercase ?? true,
      stem: options.stem ?? true,
      removeStopWords: options.removeStopWords ?? true,
      extraStopWords: options.extraStopWords ?? new Set(),
      minLength: options.minLength ?? 2,
      charNgramSize: options.charNgramSize ?? 3,
    };
  }

  tokenize(text: string): TokenizerResult {
    const sentences = segmentSentences(text);
    const tokens = tokenizeWords(text);
    const normalizedTokens = normalizeTokens(tokens, this.options);

    const unigrams = [...tokens];
    const bigramArrays = generateNgrams(tokens, 2);
    const trigramArrays = generateNgrams(tokens, 3);

    const bigrams = bigramArrays.map(
      (ng) => [ng[0]!, ng[1]!] as [string, string],
    );
    const trigrams = trigramArrays.map(
      (ng) => [ng[0]!, ng[1]!, ng[2]!] as [string, string, string],
    );

    return { tokens, normalizedTokens, sentences, unigrams, bigrams, trigrams };
  }

  /**
   * Generate character n-grams for a word (useful for fuzzy matching).
   */
  charNgrams(word: string): string[] {
    return generateCharNgrams(
      word.toLowerCase(),
      this.options.charNgramSize,
    );
  }

  /** Expose stop word list for external use */
  get stopWords(): Set<string> {
    return new Set([...ENGLISH_STOP_WORDS, ...this.options.extraStopWords]);
  }
}

export { ENGLISH_STOP_WORDS };
