// In-memory rate limiter store with automatic cleanup of expired entries

import type { RateLimiterStore } from '../types.js';

interface Entry {
  count: number;
  resetAt: Date;
  expiresAt: number; // epoch ms
}

export class MemoryStore implements RateLimiterStore {
  private store: Map<string, Entry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs = 60_000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Allow the process to exit even if this interval is running
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || existing.expiresAt <= now) {
      // Start a new window
      const resetAt = new Date(now + windowMs);
      const entry: Entry = { count: 1, resetAt, expiresAt: now + windowMs };
      this.store.set(key, entry);
      return { count: 1, resetAt };
    }

    existing.count++;
    return { count: existing.count, resetAt: existing.resetAt };
  }

  async decrement(key: string): Promise<void> {
    const entry = this.store.get(key);
    if (entry && entry.count > 0) {
      entry.count--;
    }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async get(key: string): Promise<{ count: number; resetAt: Date } | null> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= now) return null;
    return { count: entry.count, resetAt: entry.resetAt };
  }

  /**
   * Stop the background cleanup timer.
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }

  /**
   * Return the number of active (non-expired) keys.
   */
  size(): number {
    const now = Date.now();
    let count = 0;
    this.store.forEach((entry) => {
      if (entry.expiresAt > now) count++;
    });
    return count;
  }

  /**
   * Remove all expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    this.store.forEach((entry, key) => {
      if (entry.expiresAt <= now) this.store.delete(key);
    });
  }
}
