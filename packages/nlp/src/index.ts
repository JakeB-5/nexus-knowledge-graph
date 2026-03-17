/**
 * @nexus/nlp – barrel exports
 */

// Types
export type {
  EmbeddingProvider,
  TokenizerResult,
  EntityType,
  Entity,
  Keyword,
  SentimentLabel,
  SentimentResult,
  SimilarityResult,
  SummarizationResult,
  LanguageCode,
  LanguageDetectionResult,
} from "./types.js";

// Tokenizer
export {
  Tokenizer,
  porterStem,
  segmentSentences,
  tokenizeWords,
  generateNgrams,
  generateCharNgrams,
  normalizeTokens,
  ENGLISH_STOP_WORDS,
} from "./tokenizer.js";
export type { TokenizerOptions, NormalizationOptions } from "./tokenizer.js";

// TF-IDF
export { TFIDF } from "./tfidf.js";
export type { TFIDFDocument } from "./tfidf.js";

// Keyword extraction
export { KeywordExtractor, RakeExtractor, TextRankKeywordExtractor } from "./keyword-extractor.js";
export type { KeywordExtractorOptions, KeywordAlgorithm } from "./keyword-extractor.js";

// Entity extraction
export { EntityExtractor } from "./entity-extractor.js";
export type { EntityExtractorOptions } from "./entity-extractor.js";

// Similarity
export {
  cosineSimilarity,
  cosineTextSimilarity,
  jaccardSimilarity,
  jaccardTextSimilarity,
  diceCoefficient,
  diceTextSimilarity,
  levenshteinDistance,
  levenshteinSimilarity,
  jaroSimilarity,
  jaroWinklerSimilarity,
  longestCommonSubsequence,
  lcsSimilarity,
  ngramSimilarity,
  documentSimilarity,
  pairwiseSimilarityMatrix,
} from "./similarity.js";
export type { PairwiseOptions } from "./similarity.js";

// Summarizer
export { Summarizer } from "./summarizer.js";
export type { SummarizerOptions } from "./summarizer.js";

// Sentiment
export { SentimentAnalyzer, analyzeSentiment, analyzeDocumentSentiment } from "./sentiment.js";

// Language detection
export { LanguageDetector, detectLanguage } from "./language-detect.js";

// Text cleaner
export {
  TextCleaner,
  cleanText,
  stripHtml,
  removeUrls,
  removeEmails,
  normalizeUnicode,
  normalizeWhitespace,
  removeExcessivePunctuation,
  removeNonAscii,
} from "./text-cleaner.js";
export type { TextCleanerOptions } from "./text-cleaner.js";

// Embeddings
export { BaseEmbeddingProvider } from "./embeddings/provider.js";
export { LocalEmbeddings } from "./embeddings/local.js";
export type { LocalEmbeddingsOptions } from "./embeddings/local.js";
export { EmbeddingCache } from "./embeddings/cache.js";
export type { CacheStats, SerializedCache } from "./embeddings/cache.js";
