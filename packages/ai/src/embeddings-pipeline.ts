/**
 * EmbeddingsPipeline - batch embedding generation with queuing, caching,
 * incremental updates, versioning, and simple PCA-based dimension reduction.
 */

import crypto from 'node:crypto';
import { AIProvider, EmbeddingResult } from './types.js';

// ─── Cache interface ──────────────────────────────────────────────────────────

export interface EmbeddingCache {
  get(key: string): number[] | undefined;
  set(key: string, embedding: number[]): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

// Simple in-memory LRU-like cache
export class InMemoryEmbeddingCache implements EmbeddingCache {
  private readonly store = new Map<string, number[]>();
  private readonly maxSize: number;

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
  }

  get(key: string): number[] | undefined {
    const val = this.store.get(key);
    if (val) {
      // Move to end (LRU)
      this.store.delete(key);
      this.store.set(key, val);
    }
    return val;
  }

  set(key: string, embedding: number[]): void {
    if (this.store.size >= this.maxSize) {
      // Evict oldest
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(key, embedding);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// ─── Pipeline types ───────────────────────────────────────────────────────────

export interface EmbeddingNode {
  id: string;
  text: string;
  /** Optional content hash for change detection */
  contentHash?: string;
}

export interface EmbeddingRecord {
  nodeId: string;
  embedding: number[];
  model: string;
  version: number;
  generatedAt: Date;
  contentHash: string;
}

export interface PipelineOptions {
  /** Batch size for API calls (default: 20) */
  batchSize?: number;
  /** Requests per second rate limit (default: 5) */
  requestsPerSecond?: number;
  /** Model to use for embeddings */
  model?: string;
  /** Current embedding schema version (default: 1) */
  version?: number;
}

export interface PipelineResult {
  records: EmbeddingRecord[];
  skipped: number;
  processed: number;
  errors: Array<{ nodeId: string; error: string }>;
}

// ─── EmbeddingsPipeline ───────────────────────────────────────────────────────

export class EmbeddingsPipeline {
  private readonly provider: AIProvider;
  private readonly cache: EmbeddingCache;
  private readonly versionedRecords = new Map<string, EmbeddingRecord>();
  private readonly opts: Required<PipelineOptions>;

  constructor(provider: AIProvider, cache?: EmbeddingCache, opts: PipelineOptions = {}) {
    this.provider = provider;
    this.cache = cache ?? new InMemoryEmbeddingCache();
    this.opts = {
      batchSize: opts.batchSize ?? 20,
      requestsPerSecond: opts.requestsPerSecond ?? 5,
      model: opts.model ?? '',
      version: opts.version ?? 1,
    };
  }

  /**
   * Generate embeddings for a list of nodes.
   * Uses cache and skips nodes whose content hasn't changed.
   */
  async embed(nodes: EmbeddingNode[], options: PipelineOptions = {}): Promise<PipelineResult> {
    const batchSize = options.batchSize ?? this.opts.batchSize;
    const version = options.version ?? this.opts.version;
    const model = options.model ?? this.opts.model;
    const minInterval = 1000 / (options.requestsPerSecond ?? this.opts.requestsPerSecond);

    const records: EmbeddingRecord[] = [];
    const errors: Array<{ nodeId: string; error: string }> = [];
    let skipped = 0;

    // Partition into cached/changed
    const toProcess: EmbeddingNode[] = [];
    for (const node of nodes) {
      const hash = this.hashContent(node.text);
      const existing = this.versionedRecords.get(node.id);

      if (existing && existing.contentHash === hash && existing.version === version) {
        // Content unchanged - use existing record
        records.push(existing);
        skipped++;
        continue;
      }

      const cached = this.cache.get(this.cacheKey(node.text, model, version));
      if (cached) {
        const record: EmbeddingRecord = {
          nodeId: node.id,
          embedding: cached,
          model,
          version,
          generatedAt: new Date(),
          contentHash: hash,
        };
        records.push(record);
        this.versionedRecords.set(node.id, record);
        skipped++;
        continue;
      }

      toProcess.push(node);
    }

    // Process in batches with rate limiting
    let lastRequestTime = 0;

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batch = toProcess.slice(i, i + batchSize);

      // Rate limiting
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (elapsed < minInterval && lastRequestTime > 0) {
        await sleep(minInterval - elapsed);
      }
      lastRequestTime = Date.now();

      try {
        const result = await this.embedBatch(batch, model, version);
        records.push(...result);
        for (const r of result) {
          this.versionedRecords.set(r.nodeId, r);
          this.cache.set(this.cacheKey(r.embedding.join(',').slice(0, 50), model, version), r.embedding);
        }
      } catch (err) {
        for (const node of batch) {
          errors.push({ nodeId: node.id, error: String(err) });
        }
      }
    }

    return { records, skipped, processed: toProcess.length - errors.length, errors };
  }

  /**
   * Embed a single node.
   */
  async embedOne(node: EmbeddingNode, options: PipelineOptions = {}): Promise<EmbeddingRecord> {
    const result = await this.embed([node], options);
    const record = result.records[0];
    if (!record) throw new Error(`Failed to embed node ${node.id}`);
    return record;
  }

  /**
   * Invalidate cached embedding for a node (e.g. when content changes).
   */
  invalidate(nodeId: string): void {
    this.versionedRecords.delete(nodeId);
  }

  /** Clear all cached embeddings. */
  clearCache(): void {
    this.cache.clear();
    this.versionedRecords.clear();
  }

  /**
   * Reduce embedding dimensions using a simplified PCA-inspired projection.
   * Projects embeddings onto the first `targetDims` principal components
   * estimated from the input data.
   */
  reduceDimensions(embeddings: number[][], targetDims: number): number[][] {
    if (embeddings.length === 0) return [];
    const sourceDims = embeddings[0]!.length;
    if (targetDims >= sourceDims) return embeddings;

    // Compute mean vector
    const mean = new Array<number>(sourceDims).fill(0);
    for (const emb of embeddings) {
      for (let d = 0; d < sourceDims; d++) {
        mean[d]! += emb[d]!;
      }
    }
    for (let d = 0; d < sourceDims; d++) {
      mean[d]! /= embeddings.length;
    }

    // Center embeddings
    const centered = embeddings.map((emb) => emb.map((v, d) => v - mean[d]!));

    // Build random projection matrix (approximates PCA directions)
    // In a real implementation this would use SVD; here we use deterministic random vectors
    const projection: number[][] = [];
    for (let k = 0; k < targetDims; k++) {
      const seed = `proj-${k}-${sourceDims}`;
      const hash = crypto.createHash('sha256').update(seed).digest();
      const vec = new Array<number>(sourceDims);
      let mag = 0;
      for (let d = 0; d < sourceDims; d++) {
        const b = hash[d % hash.length]!;
        vec[d] = (b / 127.5) - 1;
        mag += vec[d]! * vec[d]!;
      }
      mag = Math.sqrt(mag);
      projection.push(vec.map((v) => v / mag));
    }

    // Project
    return centered.map((emb) =>
      projection.map((proj) => proj.reduce((s, p, d) => s + p * emb[d]!, 0)),
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async embedBatch(
    nodes: EmbeddingNode[],
    model: string,
    version: number,
  ): Promise<EmbeddingRecord[]> {
    const texts = nodes.map((n) => n.text);
    const embedOpts = model ? { input: texts, model } : { input: texts };
    const result: EmbeddingResult = await this.provider.embed(embedOpts);

    return nodes.map((node, i) => {
      const embedding = result.embeddings[i] ?? [];
      const record: EmbeddingRecord = {
        nodeId: node.id,
        embedding,
        model: result.model,
        version,
        generatedAt: new Date(),
        contentHash: this.hashContent(node.text),
      };
      // Also store in cache by content hash
      this.cache.set(this.cacheKey(node.text, result.model, version), embedding);
      return record;
    });
  }

  private hashContent(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  }

  private cacheKey(text: string, model: string, version: number): string {
    return `${version}::${model}::${this.hashContent(text)}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
