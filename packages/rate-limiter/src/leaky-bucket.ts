// Leaky bucket algorithm: constant outflow rate, queue depth tracking

import type { RateLimitResult, LeakyBucketConfig } from './types.js';

interface BucketState {
  queue: number;        // Current queue depth
  lastLeak: number;     // Epoch ms of last leak calculation
}

export class LeakyBucket {
  private capacity: number;
  private leakRatePerMs: number; // items leaked per millisecond
  private buckets: Map<string, BucketState> = new Map();

  constructor(config: LeakyBucketConfig) {
    this.capacity = config.capacity;
    this.leakRatePerMs = config.leakRatePerSec / 1000;
  }

  /**
   * Attempt to enqueue a request. Returns whether it was accepted.
   */
  consume(key: string): RateLimitResult {
    const state = this.getOrCreate(key);
    this.leak(state);

    if (state.queue >= this.capacity) {
      // Queue is full — request is dropped (overflow)
      const retryAfter = Math.ceil(1 / this.leakRatePerMs); // ms until next slot
      return {
        allowed: false,
        remaining: 0,
        total: this.capacity,
        retryAfter,
      };
    }

    state.queue++;
    return {
      allowed: true,
      remaining: this.capacity - state.queue,
      total: this.capacity,
    };
  }

  /**
   * Return the current queue depth for a key after leaking.
   */
  queueDepth(key: string): number {
    const state = this.getOrCreate(key);
    this.leak(state);
    return state.queue;
  }

  /**
   * Check if the bucket is empty (no queued requests).
   */
  isEmpty(key: string): boolean {
    return this.queueDepth(key) === 0;
  }

  /**
   * Return the effective outflow rate in requests per second.
   */
  get leakRatePerSec(): number {
    return this.leakRatePerMs * 1000;
  }

  /**
   * Reset the queue for a key.
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Remove all bucket states.
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Return the number of tracked buckets.
   */
  size(): number {
    return this.buckets.size;
  }

  // ── Internals ──────────────────────────────────────────────────

  private getOrCreate(key: string): BucketState {
    let state = this.buckets.get(key);
    if (!state) {
      state = { queue: 0, lastLeak: Date.now() };
      this.buckets.set(key, state);
    }
    return state;
  }

  /**
   * Drain items from the bucket proportional to elapsed time.
   */
  private leak(state: BucketState): void {
    const now = Date.now();
    const elapsed = now - state.lastLeak;
    const leaked = elapsed * this.leakRatePerMs;

    if (leaked >= 1) {
      state.queue = Math.max(0, state.queue - Math.floor(leaked));
      state.lastLeak = now;
    }
  }
}
