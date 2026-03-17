/**
 * Core types for the NLP package.
 */

// ---------------------------------------------------------------------------
// Embedding provider
// ---------------------------------------------------------------------------

export interface EmbeddingProvider {
  /** Human-readable name of this provider */
  readonly name: string;

  /** Dimensionality of the produced vectors */
  readonly dimensions: number;

  /** Embed a single text string */
  embed(text: string): Promise<number[]>;

  /** Embed multiple texts in a batch (may be optimised per provider) */
  embedBatch(texts: string[]): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export interface TokenizerResult {
  /** Raw tokens (words / punctuation) produced by word tokenization */
  tokens: string[];

  /** Lowercased, stemmed, stop-word-filtered tokens */
  normalizedTokens: string[];

  /** Sentence boundaries – each entry is one sentence string */
  sentences: string[];

  /** Unigrams (same as tokens) */
  unigrams: string[];

  /** Adjacent token pairs */
  bigrams: [string, string][];

  /** Adjacent token triples */
  trigrams: [string, string, string][];
}

// ---------------------------------------------------------------------------
// Named entity recognition
// ---------------------------------------------------------------------------

export type EntityType =
  | "EMAIL"
  | "URL"
  | "DATE"
  | "NUMBER"
  | "CURRENCY"
  | "PERSON"
  | "ORGANIZATION"
  | "LOCATION"
  | "MISC";

export interface Entity {
  /** Surface form of the entity as it appears in the text */
  name: string;

  /** Classified entity type */
  type: EntityType;

  /** Character offset – start (inclusive) */
  start: number;

  /** Character offset – end (exclusive) */
  end: number;
}

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

export interface Keyword {
  /** The keyword or key-phrase */
  word: string;

  /** Relevance score (higher = more relevant) */
  score: number;
}

// ---------------------------------------------------------------------------
// Sentiment analysis
// ---------------------------------------------------------------------------

export type SentimentLabel = "positive" | "negative" | "neutral";

export interface SentimentResult {
  /** Overall polarity label */
  label: SentimentLabel;

  /** Aggregate numeric score (positive = positive sentiment, negative = negative) */
  score: number;

  /** Normalised score in [-1, 1] */
  comparative: number;

  /** Individual tokens that contributed a non-zero score */
  tokens: Array<{ word: string; score: number }>;
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

export interface SimilarityResult {
  /** Value in [0, 1] – higher means more similar */
  score: number;

  /** Name of the algorithm used */
  method: string;
}

// ---------------------------------------------------------------------------
// Summarization
// ---------------------------------------------------------------------------

export interface SummarizationResult {
  /** The extracted summary text */
  summary: string;

  /** Indices of the original sentences selected for the summary */
  selectedSentenceIndices: number[];

  /** Per-sentence relevance scores computed during ranking */
  sentenceScores: number[];
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

export type LanguageCode =
  | "en"
  | "ko"
  | "ja"
  | "zh"
  | "es"
  | "fr"
  | "de"
  | "unknown";

export interface LanguageDetectionResult {
  /** ISO 639-1 language code */
  language: LanguageCode;

  /** Confidence in [0, 1] */
  confidence: number;

  /** All candidates sorted by descending confidence */
  candidates: Array<{ language: LanguageCode; confidence: number }>;
}
