/**
 * MockAIProvider - for testing.
 * Configurable responses, simulated latency, call recording, deterministic embeddings.
 */

import crypto from 'node:crypto';
import {
  AIModel,
  ChatMessage,
  ClassificationOptions,
  ClassificationResult,
  CompletionOptions,
  CompletionResult,
  EmbeddingOptions,
  EmbeddingResult,
  StreamChunk,
  TokenUsage,
} from '../types.js';
import { BaseAIProvider, BaseProviderOptions } from './base.js';

export interface MockCall {
  method: 'complete' | 'stream' | 'embed' | 'classify';
  args: unknown[];
  timestamp: Date;
}

export interface MockProviderConfig extends BaseProviderOptions {
  /** Default text to return from completions */
  defaultCompletionText?: string;
  /** Simulated network latency in ms */
  latencyMs?: number;
  /** Dimension of generated embedding vectors */
  embeddingDimensions?: number;
  /** Default model name reported in results */
  modelName?: string;
  /**
   * Callback to generate custom completion text.
   * Receives the messages and options; return a string or undefined to use default.
   */
  completionHandler?: (
    messages: ChatMessage[],
    options: CompletionOptions,
  ) => string | undefined;
}

const DEFAULT_MODELS: AIModel[] = [
  {
    id: 'mock-gpt',
    name: 'Mock GPT',
    contextWindow: 8192,
    maxOutputTokens: 2048,
    supportsEmbedding: false,
    supportsCompletion: true,
    supportsStreaming: true,
  },
  {
    id: 'mock-embed',
    name: 'Mock Embedding',
    contextWindow: 8192,
    maxOutputTokens: 0,
    supportsEmbedding: true,
    supportsCompletion: false,
    supportsStreaming: false,
  },
];

export class MockAIProvider extends BaseAIProvider {
  private readonly mockConfig: Required<
    Pick<MockProviderConfig, 'defaultCompletionText' | 'latencyMs' | 'embeddingDimensions' | 'modelName'>
  > & Pick<MockProviderConfig, 'completionHandler'>;

  readonly calls: MockCall[] = [];

  constructor(config: MockProviderConfig = {}) {
    super({ maxRetries: 0, ...config });
    this.mockConfig = {
      defaultCompletionText: config.defaultCompletionText ?? 'Mock response.',
      latencyMs: config.latencyMs ?? 0,
      embeddingDimensions: config.embeddingDimensions ?? 128,
      modelName: config.modelName ?? 'mock-gpt',
      completionHandler: config.completionHandler,
    };
  }

  // ─── Call recording ─────────────────────────────────────────────────────────

  private record(method: MockCall['method'], args: unknown[]): void {
    this.calls.push({ method, args, timestamp: new Date() });
  }

  clearCalls(): void {
    this.calls.length = 0;
  }

  callsFor(method: MockCall['method']): MockCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  // ─── Simulated latency ──────────────────────────────────────────────────────

  private async delay(): Promise<void> {
    if (this.mockConfig.latencyMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.mockConfig.latencyMs));
    }
  }

  // ─── Deterministic embeddings ───────────────────────────────────────────────

  private generateEmbedding(text: string): number[] {
    // Use SHA-256 hash of text to seed a deterministic vector
    const hash = crypto.createHash('sha256').update(text).digest();
    const dims = this.mockConfig.embeddingDimensions;
    const vec: number[] = new Array(dims) as number[];
    let magnitude = 0;

    for (let i = 0; i < dims; i++) {
      // Cycle through hash bytes
      const byte = hash[i % hash.length]!;
      // Map 0-255 to -1..1
      const val = (byte / 127.5) - 1;
      vec[i] = val;
      magnitude += val * val;
    }

    // Normalize to unit vector
    magnitude = Math.sqrt(magnitude);
    return vec.map((v) => (magnitude > 0 ? v / magnitude : 0));
  }

  private fakeUsage(text: string): TokenUsage {
    const tokens = Math.ceil(text.length / 4);
    return { promptTokens: tokens, completionTokens: tokens, totalTokens: tokens * 2 };
  }

  // ─── Implementations ────────────────────────────────────────────────────────

  protected async doComplete(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    this.record('complete', [messages, options]);
    await this.delay();

    const customText = this.mockConfig.completionHandler?.(messages, options);
    const text = customText ?? this.mockConfig.defaultCompletionText;
    const lastUserMsg = messages.findLast((m) => m.role === 'user')?.content ?? '';

    return {
      text,
      model: options.model ?? this.mockConfig.modelName,
      usage: this.fakeUsage(lastUserMsg + text),
      finishReason: 'stop',
    };
  }

  protected async *doStream(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): AsyncIterable<StreamChunk> {
    this.record('stream', [messages, options]);
    await this.delay();

    const customText = this.mockConfig.completionHandler?.(messages, options);
    const fullText = customText ?? this.mockConfig.defaultCompletionText;
    // Yield word by word to simulate streaming
    const words = fullText.split(' ');
    let accumulated = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;
      const delta = i === 0 ? word : ' ' + word;
      accumulated += delta;
      const isLast = i === words.length - 1;

      const chunk: StreamChunk = {
        delta,
        accumulated,
        ...(isLast ? { finishReason: 'stop' as const } : {}),
      };
      yield chunk;

      if (this.mockConfig.latencyMs > 0) {
        await new Promise<void>((r) => setTimeout(r, Math.floor(this.mockConfig.latencyMs / words.length)));
      }
    }
  }

  protected async doEmbed(options: EmbeddingOptions): Promise<EmbeddingResult> {
    this.record('embed', [options]);
    await this.delay();

    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const embeddings = inputs.map((t) => this.generateEmbedding(t));
    const totalChars = inputs.reduce((s, t) => s + t.length, 0);

    return {
      embeddings,
      model: options.model ?? 'mock-embed',
      usage: this.fakeUsage(' '.repeat(totalChars)),
      dimensions: this.mockConfig.embeddingDimensions,
    };
  }

  protected async doClassify(
    text: string,
    options: ClassificationOptions,
  ): Promise<ClassificationResult> {
    this.record('classify', [text, options]);
    await this.delay();

    // Deterministically pick category based on text hash
    const hash = crypto.createHash('md5').update(text).digest();
    const idx = (hash[0]! % options.categories.length);
    const picked = options.categories[idx]!;
    const scores: Record<string, number> = {};

    for (const cat of options.categories) {
      scores[cat.label] = cat.label === picked.label ? 0.85 : 0.05;
    }

    return {
      labels: [picked.label],
      scores,
      model: options.model ?? this.mockConfig.modelName,
      usage: this.fakeUsage(text),
    };
  }

  async listModels(): Promise<AIModel[]> {
    return DEFAULT_MODELS;
  }
}
