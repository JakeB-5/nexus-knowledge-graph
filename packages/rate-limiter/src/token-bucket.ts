// Token bucket algorithm: capacity + refill rate, burst handling, reservation

import type { RateLimitResult, TokenBucketConfig } from './types.js';

interface BucketState {
  tokens: number;
  lastRefill: number; // epoch ms
}

export class TokenBucket {
  private capacity: number;
  private refillRate: number; // tokens per millisecond
  private buckets: Map<string, BucketState> = new Map();
  private initialTokens: number;

  constructor(config: TokenBucketConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate / 1000; // convert to per-ms
    this.initialTokens = config.initialTokens ?? config.capacity;
  }

  /**
   * Attempt to consume `tokens` from the bucket for `key`.
   */
  consume(key: string, tokens = 1): RateLimitResult {
    const state = this.getOrCreate(key);
    this.refill(state);

    if (state.tokens >= tokens) {
      state.tokens -= tokens;
      return {
        allowed: true,
        remaining: Math.floor(state.tokens),
        total: this.capacity,
      };
    }

    // Calculate how long until enough tokens are available
    const deficit = tokens - state.tokens;
    const retryAfter = Math.ceil(deficit / this.refillRate);

    return {
      allowed: false,
      remaining: Math.floor(state.tokens),
      total: this.capacity,
      retryAfter,
    };
  }

  /**
   * Reserve `tokens` without consuming them (pre-claim).
   * Returns true if the reservation was successful.
   */
  reserve(key: string, tokens = 1): boolean {
    const state = this.getOrCreate(key);
    this.refill(state);

    if (state.tokens >= tokens) {
      state.tokens -= tokens;
      return true;
    }
    return false;
  }

  /**
   * Return tokens to the bucket (cancel a reservation or refund).
   */
  release(key: string, tokens = 1): void {
    const state = this.buckets.get(key);
    if (state) {
      state.tokens = Math.min(this.capacity, state.tokens + tokens);
    }
  }

  /**
   * Peek at the current token count for a key without modifying it.
   */
  peek(key: string): number {
    const state = this.getOrCreate(key);
    this.refill(state);
    return Math.floor(state.tokens);
  }

  /**
   * Reset the bucket for a key.
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Remove all buckets.
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Return all active key count.
   */
  size(): number {
    return this.buckets.size;
  }

  // ── Internals ──────────────────────────────────────────────────

  private getOrCreate(key: string): BucketState {
    let state = this.buckets.get(key);
    if (!state) {
      state = { tokens: this.initialTokens, lastRefill: Date.now() };
      this.buckets.set(key, state);
    }
    return state;
  }

  private refill(state: BucketState): void {
    const now = Date.now();
    const elapsed = now - state.lastRefill;
    const newTokens = elapsed * this.refillRate;
    state.tokens = Math.min(this.capacity, state.tokens + newTokens);
    state.lastRefill = now;
  }
}
