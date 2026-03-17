/**
 * OpenAICompatibleProvider - works with any OpenAI-compatible HTTP API
 * (OpenAI, Ollama, LM Studio, Together AI, etc.).
 */

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
import { BaseAIProvider, BaseProviderOptions, AIProviderError } from './base.js';

export interface OpenAICompatibleConfig extends BaseProviderOptions {
  /** API base URL, e.g. "https://api.openai.com/v1" */
  baseUrl: string;
  /** API key (sent as Bearer token) */
  apiKey?: string;
  /** Default model to use when none is specified */
  defaultModel?: string;
  /** Default embedding model */
  defaultEmbeddingModel?: string;
  /** Additional headers to include in every request */
  extraHeaders?: Record<string, string>;
  /** Request timeout in ms (default: 60000) */
  timeoutMs?: number;
}

// Minimal shapes of the OpenAI REST API response objects
interface OAIMessage {
  role: string;
  content: string;
}

interface OAIChoice {
  message?: OAIMessage;
  delta?: { content?: string };
  finish_reason?: string | null;
  index: number;
}

interface OAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OAIChatResponse {
  id?: string;
  model: string;
  choices: OAIChoice[];
  usage?: OAIUsage;
}

interface OAIEmbeddingData {
  embedding: number[];
  index: number;
}

interface OAIEmbeddingResponse {
  model: string;
  data: OAIEmbeddingData[];
  usage?: OAIUsage;
}

interface OAIModel {
  id: string;
  object: string;
}

interface OAIModelsResponse {
  data: OAIModel[];
}

export class OpenAICompatibleProvider extends BaseAIProvider {
  private readonly config: Required<
    Pick<OpenAICompatibleConfig, 'baseUrl' | 'defaultModel' | 'defaultEmbeddingModel' | 'timeoutMs'>
  > &
    Pick<OpenAICompatibleConfig, 'apiKey' | 'extraHeaders'>;

  constructor(config: OpenAICompatibleConfig) {
    super(config);
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      apiKey: config.apiKey,
      defaultModel: config.defaultModel ?? 'gpt-3.5-turbo',
      defaultEmbeddingModel: config.defaultEmbeddingModel ?? 'text-embedding-ada-002',
      extraHeaders: config.extraHeaders,
      timeoutMs: config.timeoutMs ?? 60_000,
    };
  }

  // ─── HTTP helpers ───────────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.extraHeaders,
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  private async fetchJSON<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    this.log(`POST ${url}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw this.mapHttpError(response.status, text);
    }

    return response.json() as Promise<T>;
  }

  private async fetchStream(path: string, body: unknown): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ ...(body as object), stream: true }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw this.mapHttpError(response.status, text);
    }

    if (!response.body) {
      throw new AIProviderError('No response body for streaming request');
    }

    return response.body;
  }

  // ─── Completion ─────────────────────────────────────────────────────────────

  protected async doComplete(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    const body = {
      model: options.model ?? this.config.defaultModel,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stop: options.stop,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stream: false,
    };

    const data = await this.fetchJSON<OAIChatResponse>('/chat/completions', body);
    const choice = data.choices[0];
    const text = choice?.message?.content ?? '';
    const finishReason = this.mapFinishReason(choice?.finish_reason ?? null);
    const usage = this.mapUsage(data.usage);

    this.log(`Completion: ${usage.totalTokens} tokens`);

    return {
      text,
      model: data.model,
      usage,
      finishReason,
      requestId: data.id,
    };
  }

  // ─── Streaming ──────────────────────────────────────────────────────────────

  protected async *doStream(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): AsyncIterable<StreamChunk> {
    const body = {
      model: options.model ?? this.config.defaultModel,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stop: options.stop,
      stream: true,
    };

    const stream = await this.fetchStream('/chat/completions', body);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data) as OAIChatResponse;
            const delta = parsed.choices[0]?.delta?.content ?? '';
            accumulated += delta;

            const chunk: StreamChunk = { delta, accumulated };

            const finishReason = parsed.choices[0]?.finish_reason;
            if (finishReason) {
              chunk.finishReason = this.mapFinishReason(finishReason);
            }

            yield chunk;
          } catch {
            // Skip malformed SSE line
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─── Embeddings ─────────────────────────────────────────────────────────────

  protected async doEmbed(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const input = Array.isArray(options.input) ? options.input : [options.input];
    const body = {
      model: options.model ?? this.config.defaultEmbeddingModel,
      input,
    };

    const data = await this.fetchJSON<OAIEmbeddingResponse>('/embeddings', body);
    const sorted = data.data.sort((a, b) => a.index - b.index);
    const embeddings = sorted.map((d) => d.embedding);
    const dimensions = embeddings[0]?.length ?? 0;

    return {
      embeddings,
      model: data.model,
      usage: this.mapUsage(data.usage),
      dimensions,
    };
  }

  // ─── Classification ─────────────────────────────────────────────────────────

  protected async doClassify(
    text: string,
    options: ClassificationOptions,
  ): Promise<ClassificationResult> {
    const categoryList = options.categories
      .map((c) => `- ${c.label}${c.description ? `: ${c.description}` : ''}`)
      .join('\n');

    const instruction = options.multiLabel
      ? 'Classify the text into one or more of the following categories. You may select multiple.'
      : 'Classify the text into exactly one of the following categories.';

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${instruction}\n\nCategories:\n${categoryList}\n\nRespond with a JSON object: {"labels": [...], "scores": {"label": confidence}}`,
      },
      { role: 'user', content: text },
    ];

    const result = await this.doComplete(messages, {
      model: options.model,
      temperature: 0,
      maxTokens: 256,
    });

    try {
      // Extract JSON from the response
      const match = result.text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON found in classification response');
      const parsed = JSON.parse(match[0]) as { labels?: string[]; scores?: Record<string, number> };
      const labels = parsed.labels ?? [];
      const scores = parsed.scores ?? {};

      // Filter by confidence threshold
      const threshold = options.minConfidence ?? 0;
      const filteredLabels = labels.filter((l) => (scores[l] ?? 1) >= threshold);

      return {
        labels: filteredLabels,
        scores,
        model: result.model,
        usage: result.usage,
      };
    } catch {
      // Fallback: return raw text as label
      return {
        labels: [result.text.trim()],
        scores: {},
        model: result.model,
        usage: result.usage,
      };
    }
  }

  // ─── Model listing ──────────────────────────────────────────────────────────

  async listModels(): Promise<AIModel[]> {
    const url = `${this.config.baseUrl}/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: this.buildHeaders(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw this.mapHttpError(response.status, text);
    }

    const data = (await response.json()) as OAIModelsResponse;
    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
      contextWindow: 4096,
      maxOutputTokens: 2048,
      supportsEmbedding: m.id.includes('embedding'),
      supportsCompletion: !m.id.includes('embedding'),
      supportsStreaming: !m.id.includes('embedding'),
    }));
  }

  // ─── Estimate token count ───────────────────────────────────────────────────

  estimateTokens(text: string): number {
    // Rough approximation: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private mapFinishReason(reason: string | null): CompletionResult['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'content_filter': return 'content_filter';
      default: return 'unknown';
    }
  }

  private mapUsage(usage?: OAIUsage): TokenUsage {
    return {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    };
  }
}
