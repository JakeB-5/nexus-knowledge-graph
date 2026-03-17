// Core types for the cache package

export interface CacheOptions {
  /** Time-to-live in milliseconds. Undefined means no expiry. */
  ttl?: number;
  /** Maximum number of entries to store */
  maxSize?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  size: number;
  hitRate: number;
}

export interface CacheProvider<K = string, V = unknown> {
  get(key: K): V | undefined;
  set(key: K, value: V, ttl?: number): void;
  delete(key: K): boolean;
  has(key: K): boolean;
  clear(): void;
  readonly size: number;
}

export interface SerializedEntry<V> {
  value: V;
  expiresAt: number | null;
}

export interface SerializedCache<K, V> {
  entries: Array<[K, SerializedEntry<V>]>;
  timestamp: number;
}
