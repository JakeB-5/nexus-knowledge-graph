/**
 * LocalEmbeddings: pure TypeScript bag-of-words + TF-IDF based document
 * vectors with random projection dimensionality reduction.
 * No external API calls required.
 */

import { Tokenizer } from "../tokenizer.js";
import { TFIDF } from "../tfidf.js";
import { BaseEmbeddingProvider } from "./provider.js";

// ---------------------------------------------------------------------------
// Seeded pseudo-random number generator (Mulberry32) for reproducible projections
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// Random Projection matrix
// ---------------------------------------------------------------------------

function buildProjectionMatrix(
  inputDim: number,
  outputDim: number,
  seed = 42,
): number[][] {
  const rng = mulberry32(seed);
  // Sparse random projection: each entry is -1, 0, or +1 with prob 1/6, 2/3, 1/6
  const scale = Math.sqrt(3 / outputDim);
  const matrix: number[][] = [];
  for (let i = 0; i < outputDim; i++) {
    const row: number[] = [];
    for (let j = 0; j < inputDim; j++) {
      const r = rng();
      if (r < 1 / 6) row.push(-scale);
      else if (r < 5 / 6) row.push(0);
      else row.push(scale);
    }
    matrix.push(row);
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// LocalEmbeddings
// ---------------------------------------------------------------------------

export interface LocalEmbeddingsOptions {
  /** Output dimension of embeddings (default: 256) */
  dimensions?: number;
  /** Random seed for reproducible projection (default: 42) */
  seed?: number;
  /** Maximum vocabulary size (default: 10000) */
  maxVocabSize?: number;
}

export class LocalEmbeddings extends BaseEmbeddingProvider {
  readonly name = "local-tfidf";
  readonly dimensions: number;

  private readonly tokenizer: Tokenizer;
  private readonly tfidf: TFIDF;
  private readonly seed: number;
  private readonly maxVocabSize: number;

  /** Vocabulary: term → column index in the high-dimensional vector */
  private vocabulary = new Map<string, number>();

  /** Lazy-built random projection matrix */
  private projectionMatrix: number[][] | null = null;

  /** Number of documents added to the corpus (for vocab building) */
  private corpusDocCount = 0;

  constructor(options: LocalEmbeddingsOptions = {}) {
    super();
    this.dimensions = options.dimensions ?? 256;
    this.seed = options.seed ?? 42;
    this.maxVocabSize = options.maxVocabSize ?? 10_000;
    this.tokenizer = new Tokenizer({ stem: true, removeStopWords: true });
    this.tfidf = new TFIDF(this.tokenizer);
  }

  // ---------------------------------------------------------------------------
  // Corpus building
  // ---------------------------------------------------------------------------

  /**
   * Add documents to the corpus to build vocabulary and IDF statistics.
   * Must be called before embed() for best results.
   */
  addToCorpus(texts: string[]): void {
    for (const text of texts) {
      const id = `__corpus__${this.corpusDocCount++}`;
      this.tfidf.addDocument(id, text);
    }
    this.rebuildVocabulary();
    this.projectionMatrix = null; // invalidate
  }

  private rebuildVocabulary(): void {
    // Collect all terms from TF-IDF and sort by document frequency (descending)
    // to keep the most common terms in limited vocab
    const termScores: Array<[string, number]> = [];

    for (const docId of this.tfidf.allDocumentIds()) {
      const vec = this.tfidf.vector(docId);
      for (const [term] of vec) {
        if (!this.vocabulary.has(term)) {
          termScores.push([term, this.tfidf.idf(term)]);
        }
      }
    }

    // Sort ascending by IDF (lower IDF = higher document frequency = more common)
    termScores.sort((a, b) => a[1] - b[1]);

    this.vocabulary = new Map();
    let idx = 0;
    for (const [term] of termScores) {
      if (idx >= this.maxVocabSize) break;
      this.vocabulary.set(term, idx++);
    }
  }

  // ---------------------------------------------------------------------------
  // Embedding
  // ---------------------------------------------------------------------------

  async embed(text: string): Promise<number[]> {
    return this.embedSync(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedSync(t));
  }

  /**
   * Synchronous embedding for internal use.
   */
  embedSync(text: string): number[] {
    const tokens = this.tokenizer.tokenize(text).normalizedTokens;

    // Build TF vector over known vocabulary
    const tf = this.computeTF(tokens);

    // Build high-dimensional sparse vector
    const vocabSize = Math.max(this.vocabulary.size, 1);
    const highDim = new Array<number>(vocabSize).fill(0);

    for (const [term, tf_val] of tf) {
      const idx = this.vocabulary.get(term);
      if (idx !== undefined) {
        const idf = this.tfidf.idf(term);
        highDim[idx] = tf_val * idf;
      }
    }

    // If vocabulary is small enough, no projection needed
    if (vocabSize <= this.dimensions) {
      const padded = new Array<number>(this.dimensions).fill(0);
      for (let i = 0; i < highDim.length; i++) padded[i] = highDim[i]!;
      return BaseEmbeddingProvider.normalize(padded);
    }

    // Apply random projection
    const projected = this.project(highDim);
    return BaseEmbeddingProvider.normalize(projected);
  }

  private computeTF(tokens: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    const total = tokens.length || 1;
    for (const [t, c] of freq) freq.set(t, c / total);
    return freq;
  }

  private project(vector: number[]): number[] {
    const matrix = this.getProjectionMatrix(vector.length);
    const output = new Array<number>(this.dimensions).fill(0);
    for (let i = 0; i < this.dimensions; i++) {
      const row = matrix[i]!;
      let sum = 0;
      for (let j = 0; j < vector.length; j++) {
        sum += row[j]! * vector[j]!;
      }
      output[i] = sum;
    }
    return output;
  }

  private getProjectionMatrix(inputDim: number): number[][] {
    if (
      this.projectionMatrix === null ||
      this.projectionMatrix[0]?.length !== inputDim
    ) {
      this.projectionMatrix = buildProjectionMatrix(
        inputDim,
        this.dimensions,
        this.seed,
      );
    }
    return this.projectionMatrix;
  }

  // ---------------------------------------------------------------------------
  // Introspection
  // ---------------------------------------------------------------------------

  get vocabularySize(): number {
    return this.vocabulary.size;
  }

  getVocabulary(): string[] {
    return Array.from(this.vocabulary.keys());
  }
}
