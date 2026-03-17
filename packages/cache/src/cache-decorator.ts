// Function memoization with cache key generation, TTL, and invalidation

import type { CacheProvider } from './types.js';
import { LRUCache } from './lru.js';

// ── Key generation ────────────────────────────────────────────────────────────

export type KeySerializer = (...args: unknown[]) => string;

/** Default key serializer: JSON stringifies all arguments */
export const defaultKeySerializer: KeySerializer = (...args: unknown[]): string => {
  return JSON.stringify(args);
};

// ── Memoize options ───────────────────────────────────────────────────────────

export interface MemoizeOptions {
  /** Cache to use. Defaults to a new LRUCache with maxSize 256. */
  cache?: CacheProvider<string, unknown>;
  /** Default TTL in ms for cached results. */
  ttl?: number;
  /** Custom key serializer. Defaults to JSON.stringify of arguments. */
  keySerializer?: KeySerializer;
  /** Cache name for identification (used in invalidation) */
  name?: string;
}

export interface MemoizedFunction<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T>;
  /** Invalidate a specific cache entry by arguments */
  invalidate(...args: Parameters<T>): boolean;
  /** Clear all cached entries for this function */
  clearAll(): void;
  /** Returns the underlying cache */
  getCache(): CacheProvider<string, unknown>;
  /** Cache name */
  readonly name: string;
}

/**
 * Memoizes a synchronous function.
 */
export function memoize<T extends (...args: never[]) => unknown>(
  fn: T,
  options: MemoizeOptions = {},
): MemoizedFunction<T> {
  const cache: CacheProvider<string, unknown> =
    options.cache ?? new LRUCache({ maxSize: 256 });
  const keySerializer = options.keySerializer ?? defaultKeySerializer;
  const ttl = options.ttl;
  const name = options.name ?? fn.name ?? 'memoized';

  const memoized = function (...args: Parameters<T>): ReturnType<T> {
    const key = keySerializer(...(args as unknown[]));
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached as ReturnType<T>;
    }
    const result = fn(...args);
    cache.set(key, result, ttl);
    return result as ReturnType<T>;
  };

  memoized.invalidate = (...args: Parameters<T>): boolean => {
    const key = keySerializer(...(args as unknown[]));
    return cache.delete(key);
  };

  memoized.clearAll = (): void => {
    cache.clear();
  };

  memoized.getCache = (): CacheProvider<string, unknown> => cache;

  Object.defineProperty(memoized, 'name', { value: name });

  return memoized as MemoizedFunction<T>;
}

/**
 * Memoizes an async function.
 */
export interface AsyncMemoizeOptions extends MemoizeOptions {
  /**
   * Whether to deduplicate in-flight requests for the same key.
   * Default: true
   */
  deduplicateInflight?: boolean;
}

export interface AsyncMemoizedFunction<T extends (...args: never[]) => Promise<unknown>> {
  (...args: Parameters<T>): ReturnType<T>;
  invalidate(...args: Parameters<T>): boolean;
  clearAll(): void;
  getCache(): CacheProvider<string, unknown>;
  readonly name: string;
}

export function memoizeAsync<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  options: AsyncMemoizeOptions = {},
): AsyncMemoizedFunction<T> {
  const cache: CacheProvider<string, unknown> =
    options.cache ?? new LRUCache({ maxSize: 256 });
  const keySerializer = options.keySerializer ?? defaultKeySerializer;
  const ttl = options.ttl;
  const name = options.name ?? fn.name ?? 'memoizedAsync';
  const deduplicateInflight = options.deduplicateInflight ?? true;

  // In-flight promise deduplication
  const inflight = new Map<string, Promise<unknown>>();

  const memoized = function (...args: Parameters<T>): ReturnType<T> {
    const key = keySerializer(...(args as unknown[]));

    const cached = cache.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached) as ReturnType<T>;
    }

    // Deduplicate concurrent calls for the same key
    if (deduplicateInflight) {
      const existing = inflight.get(key);
      if (existing) return existing as ReturnType<T>;
    }

    const promise = fn(...args).then((result) => {
      cache.set(key, result, ttl);
      inflight.delete(key);
      return result;
    }).catch((err: unknown) => {
      inflight.delete(key);
      throw err;
    });

    if (deduplicateInflight) {
      inflight.set(key, promise);
    }

    return promise as ReturnType<T>;
  };

  memoized.invalidate = (...args: Parameters<T>): boolean => {
    const key = keySerializer(...(args as unknown[]));
    inflight.delete(key);
    return cache.delete(key);
  };

  memoized.clearAll = (): void => {
    inflight.clear();
    cache.clear();
  };

  memoized.getCache = (): CacheProvider<string, unknown> => cache;

  Object.defineProperty(memoized, 'name', { value: name });

  return memoized as AsyncMemoizedFunction<T>;
}

// ── Cache key builders ────────────────────────────────────────────────────────

/** Creates a key serializer that prefixes all keys with a namespace */
export function namespacedKeySerializer(namespace: string): KeySerializer {
  return (...args: unknown[]): string => `${namespace}:${JSON.stringify(args)}`;
}

/** Creates a key serializer that uses only the first argument */
export function firstArgKeySerializer(...args: unknown[]): string {
  return String(args[0]);
}
