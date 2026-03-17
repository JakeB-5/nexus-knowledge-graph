/**
 * BaseAIProvider - abstract base class with retry logic, rate limiting,
 * error normalisation, and usage tracking.
 */

import {
  AIProvider,
  AIModel,
  ChatMessage,
  ClassificationOptions,
  ClassificationResult,
  CompletionOptions,
  CompletionResult,
  EmbeddingOptions,
  EmbeddingResult,
  StreamChunk,
  UsageRecord,
} from '../types.js';

export interface BaseProviderOptions {
  /** Maximum number of retry attempts on transient errors */
  maxRetries?: number;
  /** Base delay in ms between retries (exponential backoff) */
  retryDelayMs?: number;
  /** Minimum interval in ms between requests (simple rate limit) */
  rateLimitIntervalMs?: number;
  /** Enable request/response logging */
  debug?: boolean;
}

// Errors that should trigger a retry
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export abstract class BaseAIProvider implements AIProvider {
  protected readonly opts: Required<BaseProviderOptions>;
  private readonly usageRecords: UsageRecord[] = [];
  private lastRequestTime = 0;

  constructor(opts: BaseProviderOptions = {}) {
    this.opts = {
      maxRetries: opts.maxRetries ?? 3,
      retryDelayMs: opts.retryDelayMs ?? 500,
      rateLimitIntervalMs: opts.rateLimitIntervalMs ?? 0,
      debug: opts.debug ?? false,
    };
  }

  // ─── Abstract methods for subclasses ───────────────────────────────────────

  protected abstract doComplete(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult>;

  protected abstract doStream(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): AsyncIterable<StreamChunk>;

  protected abstract doEmbed(options: EmbeddingOptions): Promise<EmbeddingResult>;

  protected abstract doClassify(
    text: string,
    options: ClassificationOptions,
  ): Promise<ClassificationResult>;

  abstract listModels(): Promise<AIModel[]>;

  // ─── Public interface ───────────────────────────────────────────────────────

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<CompletionResult> {
    await this.enforceRateLimit();
    const result = await this.withRetry(() => this.doComplete(messages, options));
    this.recordUsage(result.model, result.usage);
    return result;
  }

  async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncIterable<StreamChunk> {
    await this.enforceRateLimit();
    yield* this.doStream(messages, options);
  }

  async embed(options: EmbeddingOptions): Promise<EmbeddingResult> {
    await this.enforceRateLimit();
    const result = await this.withRetry(() => this.doEmbed(options));
    this.recordUsage(result.model, result.usage);
    return result;
  }

  async classify(text: string, options: ClassificationOptions): Promise<ClassificationResult> {
    await this.enforceRateLimit();
    const result = await this.withRetry(() => this.doClassify(text, options));
    this.recordUsage(result.model, result.usage);
    return result;
  }

  getUsageRecords(): UsageRecord[] {
    return [...this.usageRecords];
  }

  // ─── Retry logic ───────────────────────────────────────────────────────────

  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (err instanceof AIProviderError && !err.retryable) {
          throw err;
        }
        if (attempt < this.opts.maxRetries) {
          const delay = this.opts.retryDelayMs * Math.pow(2, attempt);
          this.log(`Retry ${attempt + 1}/${this.opts.maxRetries} after ${delay}ms`);
          await sleep(delay);
        }
      }
    }
    throw lastError;
  }

  // ─── Rate limiting ─────────────────────────────────────────────────────────

  private async enforceRateLimit(): Promise<void> {
    if (this.opts.rateLimitIntervalMs <= 0) return;
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.opts.rateLimitIntervalMs) {
      await sleep(this.opts.rateLimitIntervalMs - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  // ─── Error mapping ─────────────────────────────────────────────────────────

  protected mapHttpError(statusCode: number, message: string): AIProviderError {
    const retryable = RETRYABLE_STATUS_CODES.has(statusCode);
    return new AIProviderError(
      `HTTP ${statusCode}: ${message}`,
      statusCode,
      retryable,
    );
  }

  // ─── Usage recording ───────────────────────────────────────────────────────

  private recordUsage(
    model: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  ): void {
    this.usageRecords.push({
      model,
      usage,
      timestamp: new Date(),
    });
  }

  // ─── Logging ───────────────────────────────────────────────────────────────

  protected log(message: string): void {
    if (this.opts.debug) {
      console.log(`[AIProvider] ${message}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
