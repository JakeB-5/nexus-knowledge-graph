// MultiTierCache - L1 (fast/small) + L2 (larger) with read-through and write-through

import type { CacheProvider, CacheStats } from './types.js';

export interface TierConfig {
  /** TTL override for this tier in ms. Undefined = use the value passed to set(). */
  ttl?: number;
}

export interface MultiTierCacheOptions<K, V> {
  l1: CacheProvider<K, V>;
  l2: CacheProvider<K, V>;
  /** Config for L1 tier */
  l1Config?: TierConfig;
  /** Config for L2 tier */
  l2Config?: TierConfig;
  /**
   * Read-through: on L1 miss, check L2 and populate L1.
   * Default: true
   */
  readThrough?: boolean;
  /**
   * Write-through: writes go to both L1 and L2 simultaneously.
   * Default: true
   */
  writeThrough?: boolean;
}

export class MultiTierCache<K = string, V = unknown> implements CacheProvider<K, V> {
  private readonly l1: CacheProvider<K, V>;
  private readonly l2: CacheProvider<K, V>;
  private readonly l1Config: TierConfig;
  private readonly l2Config: TierConfig;
  private readonly readThrough: boolean;
  private readonly writeThrough: boolean;

  // Stats specific to multi-tier behavior
  private _l1Hits = 0;
  private _l2Hits = 0;
  private _totalMisses = 0;
  private _promotions = 0; // L2 → L1 promotions

  constructor(options: MultiTierCacheOptions<K, V>) {
    this.l1 = options.l1;
    this.l2 = options.l2;
    this.l1Config = options.l1Config ?? {};
    this.l2Config = options.l2Config ?? {};
    this.readThrough = options.readThrough ?? true;
    this.writeThrough = options.writeThrough ?? true;
  }

  // ── CacheProvider interface ───────────────────────────────────────────────

  get(key: K): V | undefined {
    // Check L1 first
    const l1Value = this.l1.get(key);
    if (l1Value !== undefined) {
      this._l1Hits++;
      return l1Value;
    }

    // L1 miss: check L2 if read-through is enabled
    if (!this.readThrough) {
      this._totalMisses++;
      return undefined;
    }

    const l2Value = this.l2.get(key);
    if (l2Value !== undefined) {
      this._l2Hits++;
      // Promote to L1
      this.l1.set(key, l2Value, this.l1Config.ttl);
      this._promotions++;
      return l2Value;
    }

    this._totalMisses++;
    return undefined;
  }

  set(key: K, value: V, ttl?: number): void {
    const l1Ttl = this.l1Config.ttl ?? ttl;
    const l2Ttl = this.l2Config.ttl ?? ttl;

    // Always write to L1
    this.l1.set(key, value, l1Ttl);

    // Write to L2 if write-through
    if (this.writeThrough) {
      this.l2.set(key, value, l2Ttl);
    }
  }

  delete(key: K): boolean {
    const l1Deleted = this.l1.delete(key);
    const l2Deleted = this.l2.delete(key);
    return l1Deleted || l2Deleted;
  }

  has(key: K): boolean {
    return this.l1.has(key) || (this.readThrough && this.l2.has(key));
  }

  clear(): void {
    this.l1.clear();
    this.l2.clear();
  }

  /** Returns total entries across both tiers (may overlap for the same key) */
  get size(): number {
    return this.l1.size;
  }

  // ── Tier-specific operations ──────────────────────────────────────────────

  /** Sets a value only in L1 (bypasses L2) */
  setL1Only(key: K, value: V, ttl?: number): void {
    this.l1.set(key, value, this.l1Config.ttl ?? ttl);
  }

  /** Sets a value only in L2 (bypasses L1) */
  setL2Only(key: K, value: V, ttl?: number): void {
    this.l2.set(key, value, this.l2Config.ttl ?? ttl);
  }

  /** Invalidates a key from L1 only, keeping it in L2 */
  invalidateL1(key: K): boolean {
    return this.l1.delete(key);
  }

  /** Manually promote an L2 value to L1 */
  promoteToL1(key: K): boolean {
    const value = this.l2.get(key);
    if (value === undefined) return false;
    this.l1.set(key, value, this.l1Config.ttl);
    this._promotions++;
    return true;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  get tierStats(): {
    l1Hits: number;
    l2Hits: number;
    totalMisses: number;
    promotions: number;
    l1Size: number;
    l2Size: number;
    l1HitRate: number;
    overallHitRate: number;
  } {
    const total = this._l1Hits + this._l2Hits + this._totalMisses;
    return {
      l1Hits: this._l1Hits,
      l2Hits: this._l2Hits,
      totalMisses: this._totalMisses,
      promotions: this._promotions,
      l1Size: this.l1.size,
      l2Size: this.l2.size,
      l1HitRate: total === 0 ? 0 : this._l1Hits / total,
      overallHitRate: total === 0 ? 0 : (this._l1Hits + this._l2Hits) / total,
    };
  }

  resetStats(): void {
    this._l1Hits = 0;
    this._l2Hits = 0;
    this._totalMisses = 0;
    this._promotions = 0;
  }

  // ── Tier access ──────────────────────────────────────────────────────────

  getL1(): CacheProvider<K, V> {
    return this.l1;
  }

  getL2(): CacheProvider<K, V> {
    return this.l2;
  }
}
