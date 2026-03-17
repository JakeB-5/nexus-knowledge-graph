// TTL-based cache with lazy expiration and optional active cleanup

import type { CacheProvider, CacheStats } from './types.js';

interface TtlEntry<V> {
  value: V;
  expiresAt: number | null; // null = no expiry
}

export interface TtlCacheOptions {
  /** Default TTL in ms. Undefined = entries never expire by default. */
  defaultTtl?: number;
  /** Maximum number of entries. Undefined = unlimited. */
  maxSize?: number;
  /** Interval in ms to run active cleanup. Disabled when 0 or undefined. */
  cleanupInterval?: number;
}

export class TtlCache<K = string, V = unknown> implements CacheProvider<K, V> {
  private readonly store = new Map<K, TtlEntry<V>>();
  private readonly defaultTtl: number | undefined;
  private readonly maxSize: number | undefined;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private _expirations = 0;

  constructor(options: TtlCacheOptions = {}) {
    this.defaultTtl = options.defaultTtl;
    this.maxSize = options.maxSize;

    if (options.cleanupInterval && options.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.purgeExpired();
      }, options.cleanupInterval);
      if (this.cleanupTimer.unref) this.cleanupTimer.unref();
    }
  }

  // ── CacheProvider interface ───────────────────────────────────────────────

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.store.delete(key);
      this._expirations++;
      this._misses++;
      return undefined;
    }

    this._hits++;
    return entry.value;
  }

  set(key: K, value: V, ttl?: number): void {
    const effectiveTtl = ttl ?? this.defaultTtl;
    const expiresAt = effectiveTtl !== undefined ? Date.now() + effectiveTtl : null;

    // If at max capacity and adding a new key, evict oldest expiring entry first
    if (
      this.maxSize !== undefined &&
      this.store.size >= this.maxSize &&
      !this.store.has(key)
    ) {
      this.evictOne();
    }

    this.store.set(key, { value, expiresAt });
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  has(key: K): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      this._expirations++;
      return false;
    }
    return true;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  /** Removes all expired entries. Returns number of entries removed. */
  purgeExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.store.delete(key);
        this._expirations++;
        count++;
      }
    }
    return count;
  }

  /** Stops the background cleanup timer */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ── Statistics ────────────────────────────────────────────────────────────

  get stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      expirations: this._expirations,
      size: this.store.size,
      hitRate: total === 0 ? 0 : this._hits / total,
    };
  }

  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
    this._expirations = 0;
  }

  // ── Iteration ─────────────────────────────────────────────────────────────

  *entries(): IterableIterator<[K, V]> {
    for (const [key, entry] of this.store) {
      if (!this.isExpired(entry)) {
        yield [key, entry.value];
      }
    }
  }

  keys(): K[] {
    return Array.from(this.entries()).map(([k]) => k);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private isExpired(entry: TtlEntry<V>): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  private evictOne(): void {
    // Evict the entry with the earliest expiry (or any entry if none expire)
    let earliest: { key: K; expiresAt: number } | null = null;
    let anyKey: K | undefined;

    for (const [key, entry] of this.store) {
      anyKey = key;
      if (entry.expiresAt !== null) {
        if (earliest === null || entry.expiresAt < earliest.expiresAt) {
          earliest = { key, expiresAt: entry.expiresAt };
        }
      }
    }

    const toEvict = earliest?.key ?? anyKey;
    if (toEvict !== undefined) {
      this.store.delete(toEvict);
      this._evictions++;
    }
  }
}
