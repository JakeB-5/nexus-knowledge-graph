/**
 * Core types for the AI integration package.
 */

// ─── Model info ───────────────────────────────────────────────────────────────

export interface AIModel {
  id: string;
  name: string;
  /** Maximum tokens in the context window */
  contextWindow: number;
  /** Maximum tokens the model can generate */
  maxOutputTokens: number;
  /** Whether the model supports embedding */
  supportsEmbedding: boolean;
  /** Whether the model supports chat/completion */
  supportsCompletion: boolean;
  /** Whether the model supports streaming */
  supportsStreaming: boolean;
  /** Cost per 1K input tokens (USD) */
  inputCostPer1K?: number;
  /** Cost per 1K output tokens (USD) */
  outputCostPer1K?: number;
}

// ─── Usage tracking ───────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageRecord {
  model: string;
  usage: TokenUsage;
  /** Estimated cost in USD */
  estimatedCost?: number;
  timestamp: Date;
  requestId?: string;
}

// ─── Completion ───────────────────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface CompletionOptions {
  /** Model identifier */
  model?: string;
  /** Sampling temperature (0–2). Lower = more deterministic */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string[];
  /** Top-p nucleus sampling */
  topP?: number;
  /** Frequency penalty */
  frequencyPenalty?: number;
  /** Presence penalty */
  presencePenalty?: number;
  /** Whether to stream the response */
  stream?: boolean;
  /** Optional request metadata */
  metadata?: Record<string, string>;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error' | 'unknown';
  requestId?: string;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export interface StreamChunk {
  /** Incremental text delta */
  delta: string;
  /** Full accumulated text so far */
  accumulated: string;
  /** Set on the final chunk */
  finishReason?: CompletionResult['finishReason'];
  /** Set on the final chunk */
  usage?: TokenUsage;
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

export interface EmbeddingOptions {
  model?: string;
  /** Input texts to embed */
  input: string | string[];
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  usage: TokenUsage;
  /** Dimensionality of each embedding vector */
  dimensions: number;
}

// ─── Classification ───────────────────────────────────────────────────────────

export interface ClassificationOption {
  label: string;
  description?: string;
}

export interface ClassificationOptions {
  model?: string;
  categories: ClassificationOption[];
  /** Whether to return multiple labels (multi-label classification) */
  multiLabel?: boolean;
  /** Minimum confidence threshold (0–1) */
  minConfidence?: number;
}

export interface ClassificationResult {
  /** Predicted label(s) */
  labels: string[];
  /** Confidence scores per label (0–1) */
  scores: Record<string, number>;
  model: string;
  usage: TokenUsage;
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface AIProvider {
  /**
   * Complete a chat conversation.
   */
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;

  /**
   * Stream a completion, yielding chunks as they arrive.
   */
  stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncIterable<StreamChunk>;

  /**
   * Generate embedding vectors for the given input(s).
   */
  embed(options: EmbeddingOptions): Promise<EmbeddingResult>;

  /**
   * Classify text into one or more categories.
   */
  classify(text: string, options: ClassificationOptions): Promise<ClassificationResult>;

  /**
   * Return information about the available models.
   */
  listModels(): Promise<AIModel[]>;

  /**
   * Return usage records accumulated since provider creation or last reset.
   */
  getUsageRecords(): UsageRecord[];
}
