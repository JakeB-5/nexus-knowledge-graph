// Sliding window rate limiter: fixed counter, log, and hybrid counter approaches

import type { RateLimitResult, SlidingWindowConfig } from './types.js';

// ── Sliding Window Log ─────────────────────────────────────────────────────
// Exact approach: store timestamps of each request in a queue.
// Memory: O(maxRequests) per key.

export class SlidingWindowLog {
  private windowMs: number;
  private maxRequests: number;
  private logs: Map<string, number[]> = new Map(); // key → sorted timestamps

  constructor(config: SlidingWindowConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
  }

  /**
   * Check and record a request for `key`.
   */
  consume(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const log = this.logs.get(key) ?? [];

    // Remove timestamps outside the window
    const trimmed = log.filter((t) => t > windowStart);

    if (trimmed.length >= this.maxRequests) {
      const oldest = trimmed[0]!;
      const retryAfter = oldest + this.windowMs - now;
      this.logs.set(key, trimmed);
      return {
        allowed: false,
        remaining: 0,
        total: this.maxRequests,
        retryAfter: Math.max(0, retryAfter),
        resetAt: new Date(oldest + this.windowMs),
      };
    }

    trimmed.push(now);
    this.logs.set(key, trimmed);

    return {
      allowed: true,
      remaining: this.maxRequests - trimmed.length,
      total: this.maxRequests,
      resetAt: new Date(now + this.windowMs),
    };
  }

  /**
   * Peek at current request count without incrementing.
   */
  count(key: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    return (this.logs.get(key) ?? []).filter((t) => t > windowStart).length;
  }

  reset(key: string): void {
    this.logs.delete(key);
  }

  clear(): void {
    this.logs.clear();
  }
}

// ── Fixed Window Counter ───────────────────────────────────────────────────
// Simple approach: counter resets at fixed window boundaries.

export class FixedWindowCounter {
  private windowMs: number;
  private maxRequests: number;
  private counters: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(config: SlidingWindowConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
  }

  consume(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const existing = this.counters.get(key);

    if (!existing || existing.windowStart !== windowStart) {
      this.counters.set(key, { count: 1, windowStart });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        total: this.maxRequests,
        resetAt: new Date(windowStart + this.windowMs),
      };
    }

    existing.count++;
    const allowed = existing.count <= this.maxRequests;
    const resetAt = new Date(windowStart + this.windowMs);

    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - existing.count),
      total: this.maxRequests,
      resetAt,
      retryAfter: allowed ? undefined : resetAt.getTime() - now,
    };
  }

  count(key: string): number {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const entry = this.counters.get(key);
    if (!entry || entry.windowStart !== windowStart) return 0;
    return entry.count;
  }

  reset(key: string): void {
    this.counters.delete(key);
  }

  clear(): void {
    this.counters.clear();
  }
}

// ── Sliding Window Counter (Hybrid) ───────────────────────────────────────
// Approximates a sliding window using two fixed windows and a weighted sum.
// Significantly more memory-efficient than the log approach.

export class SlidingWindowCounter {
  private windowMs: number;
  private maxRequests: number;
  private precision: number;
  private windows: Map<string, { current: number; previous: number; windowStart: number }> =
    new Map();

  constructor(config: SlidingWindowConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.precision = config.precision ?? 1;
  }

  consume(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const elapsed = now - windowStart;
    const ratio = elapsed / this.windowMs; // 0..1 — how far into current window

    let entry = this.windows.get(key);

    if (!entry || entry.windowStart !== windowStart) {
      // Rolled into a new window — carry previous count forward
      const prevCount = entry?.windowStart === windowStart - this.windowMs ? entry.current : 0;
      entry = { current: 0, previous: prevCount, windowStart };
      this.windows.set(key, entry);
    }

    // Weighted estimate: (previous * remaining fraction) + current
    const estimate = entry.previous * (1 - ratio) + entry.current;

    if (estimate >= this.maxRequests) {
      const retryAfter = this.windowMs - elapsed;
      return {
        allowed: false,
        remaining: 0,
        total: this.maxRequests,
        retryAfter,
        resetAt: new Date(windowStart + this.windowMs),
      };
    }

    entry.current++;
    const remaining = Math.max(0, Math.floor(this.maxRequests - estimate - 1));

    return {
      allowed: true,
      remaining,
      total: this.maxRequests,
      resetAt: new Date(windowStart + this.windowMs),
    };
  }

  count(key: string): number {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const elapsed = now - windowStart;
    const ratio = elapsed / this.windowMs;
    const entry = this.windows.get(key);
    if (!entry) return 0;
    if (entry.windowStart !== windowStart) return 0;
    return Math.ceil(entry.previous * (1 - ratio) + entry.current);
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  clear(): void {
    this.windows.clear();
  }
}
