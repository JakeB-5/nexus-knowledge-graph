/**
 * TokenCounter - token counting utilities for LLM context window management.
 *
 * Uses a simplified BPE-inspired tokenizer:
 * - Common multi-character patterns (BPE-like) reduce token count vs naive char split
 * - Per-model estimates calibrated to approximate GPT-3/4 token counts
 * - Budget management helpers
 * - Text splitter that respects sentence boundaries
 */

import { ChatMessage } from './types.js';

// ─── Model token limits ───────────────────────────────────────────────────────

export interface ModelTokenInfo {
  contextWindow: number;
  maxOutputTokens: number;
  /** Reserve this many tokens for output (default: 1024) */
  outputReserve?: number;
}

const MODEL_INFO: Record<string, ModelTokenInfo> = {
  'gpt-3.5-turbo': { contextWindow: 4096, maxOutputTokens: 4096 },
  'gpt-3.5-turbo-16k': { contextWindow: 16384, maxOutputTokens: 4096 },
  'gpt-4': { contextWindow: 8192, maxOutputTokens: 8192 },
  'gpt-4-32k': { contextWindow: 32768, maxOutputTokens: 8192 },
  'gpt-4o': { contextWindow: 128000, maxOutputTokens: 4096 },
  'gpt-4-turbo': { contextWindow: 128000, maxOutputTokens: 4096 },
  'claude-3-haiku': { contextWindow: 200000, maxOutputTokens: 4096 },
  'claude-3-sonnet': { contextWindow: 200000, maxOutputTokens: 4096 },
  'claude-3-opus': { contextWindow: 200000, maxOutputTokens: 4096 },
  'claude-3-5-sonnet': { contextWindow: 200000, maxOutputTokens: 8192 },
  'llama-2-7b': { contextWindow: 4096, maxOutputTokens: 2048 },
  'llama-2-13b': { contextWindow: 4096, maxOutputTokens: 2048 },
  'llama-3-8b': { contextWindow: 8192, maxOutputTokens: 4096 },
  'mistral-7b': { contextWindow: 8192, maxOutputTokens: 4096 },
  'mixtral-8x7b': { contextWindow: 32768, maxOutputTokens: 4096 },
};

// ─── Simplified BPE patterns ──────────────────────────────────────────────────

// Common English multi-character sequences that map to a single token
// Ordered from longest to shortest for greedy matching
const BPE_PATTERNS = [
  'tion', 'ing', 'ness', 'ment', 'ble', 'ful', 'less', 'ous', 'ive', 'ize',
  'ise', 'ate', 'ent', 'ance', 'ence', 'ity', 'ism', 'ist', 'ify', 'ly',
  'ed', 'er', 'es', 'th', 'sh', 'ch', 'wh', 'ph', 'gh', 'qu', 'ck',
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
  'was', 'one', 'our', 'had', 'his', 'have', 'from', 'they', 'with', 'this',
];

const BPE_SET = new Set(BPE_PATTERNS);

// ─── TokenCounter class ───────────────────────────────────────────────────────

export class TokenCounter {
  private readonly defaultModel: string;

  constructor(defaultModel = 'gpt-4') {
    this.defaultModel = defaultModel;
  }

  // ─── Core counting ──────────────────────────────────────────────────────────

  /**
   * Estimate token count for a string using BPE-inspired tokenization.
   */
  count(text: string): number {
    if (!text) return 0;
    return this.bpeEstimate(text);
  }

  /**
   * Count tokens for an array of chat messages.
   * Adds overhead for role labels and message formatting (~4 tokens per message).
   */
  countMessages(messages: ChatMessage[]): number {
    const OVERHEAD_PER_MESSAGE = 4;
    return messages.reduce(
      (total, msg) => total + this.count(msg.content) + OVERHEAD_PER_MESSAGE,
      3, // base conversation overhead
    );
  }

  // ─── Model-specific estimates ───────────────────────────────────────────────

  /**
   * Get token info for a model (falls back to generic limits if unknown).
   */
  getModelInfo(model = this.defaultModel): ModelTokenInfo {
    return MODEL_INFO[model] ?? { contextWindow: 4096, maxOutputTokens: 2048 };
  }

  /**
   * How many tokens remain for output given the current prompt.
   */
  remainingTokens(promptTokens: number, model = this.defaultModel): number {
    const info = this.getModelInfo(model);
    const maxInput = info.contextWindow - (info.outputReserve ?? 1024);
    return Math.max(0, maxInput - promptTokens);
  }

  /**
   * Whether a prompt fits within the model's context window.
   */
  fitsInContext(text: string, model = this.defaultModel): boolean {
    const info = this.getModelInfo(model);
    return this.count(text) <= info.contextWindow;
  }

  // ─── Budget management ───────────────────────────────────────────────────────

  /**
   * Allocate token budgets across multiple sections.
   * Returns per-section token limits summing to totalBudget.
   */
  allocateBudget(
    sections: Array<{ name: string; weight: number }>,
    totalBudget: number,
  ): Record<string, number> {
    const totalWeight = sections.reduce((s, sec) => s + sec.weight, 0);
    const allocation: Record<string, number> = {};
    let remaining = totalBudget;

    sections.forEach((sec, i) => {
      const isLast = i === sections.length - 1;
      const share = isLast
        ? remaining
        : Math.floor((sec.weight / totalWeight) * totalBudget);
      allocation[sec.name] = share;
      remaining -= share;
    });

    return allocation;
  }

  // ─── Text splitting ───────────────────────────────────────────────────────────

  /**
   * Split text into chunks that fit within a token limit.
   * Prefers to split on sentence boundaries.
   */
  splitToFit(text: string, maxTokensPerChunk: number): string[] {
    if (this.count(text) <= maxTokensPerChunk) return [text];

    // Try sentence-level splitting first
    const sentences = this.splitIntoSentences(text);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      const candidate = current ? current + ' ' + sentence : sentence;
      if (this.count(candidate) <= maxTokensPerChunk) {
        current = candidate;
      } else {
        if (current) chunks.push(current.trim());
        // If a single sentence is too long, split by words
        if (this.count(sentence) > maxTokensPerChunk) {
          chunks.push(...this.splitByWords(sentence, maxTokensPerChunk));
          current = '';
        } else {
          current = sentence;
        }
      }
    }

    if (current) chunks.push(current.trim());
    return chunks.filter((c) => c.length > 0);
  }

  /**
   * Truncate text to fit within a token limit.
   */
  truncate(text: string, maxTokens: number, ellipsis = '…'): string {
    if (this.count(text) <= maxTokens) return text;

    // Binary search for the right character cutoff
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const candidate = text.slice(0, mid) + ellipsis;
      if (this.count(candidate) <= maxTokens) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return text.slice(0, lo) + ellipsis;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  /**
   * List all known model names.
   */
  listKnownModels(): string[] {
    return Object.keys(MODEL_INFO);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private bpeEstimate(text: string): number {
    // Normalize whitespace
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return 0;

    // Split into words (including punctuation as separate tokens)
    const words = normalized.match(/\w+|[^\w\s]/g) ?? [];
    let tokenCount = 0;

    for (const word of words) {
      tokenCount += this.countWordTokens(word);
    }

    return tokenCount;
  }

  private countWordTokens(word: string): number {
    const lower = word.toLowerCase();
    // Check for common whole-word tokens
    if (BPE_SET.has(lower)) return 1;
    if (word.length <= 2) return 1;

    // Greedy BPE merge simulation
    let remaining = lower;
    let tokens = 0;

    while (remaining.length > 0) {
      let matched = false;
      for (const pattern of BPE_PATTERNS) {
        if (remaining.startsWith(pattern)) {
          tokens++;
          remaining = remaining.slice(pattern.length);
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Single character = one token
        tokens++;
        remaining = remaining.slice(1);
      }
    }

    return tokens;
  }

  private splitIntoSentences(text: string): string[] {
    // Split on sentence-ending punctuation followed by whitespace
    const raw = text.split(/(?<=[.!?])\s+/);
    return raw.filter((s) => s.trim().length > 0);
  }

  private splitByWords(text: string, maxTokens: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (this.count(candidate) <= maxTokens) {
        current = candidate;
      } else {
        if (current) chunks.push(current);
        current = word;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }
}
