// Built-in transform functions for use with Pipeline stages.
// All transforms return async-compatible functions.

import type { TransformFn, FilterFn, ReduceFn, FlatMapFn } from './types.js';

// ─── Basic transforms ─────────────────────────────────────────────────────────

export function map<TIn, TOut>(fn: TransformFn<TIn, TOut>): TransformFn<TIn, TOut> {
  return fn;
}

export function filter<T>(fn: FilterFn<T>): FilterFn<T> {
  return fn;
}

export function flatMap<TIn, TOut>(fn: FlatMapFn<TIn, TOut>): FlatMapFn<TIn, TOut> {
  return fn;
}

export function reduce<T, TAcc>(fn: ReduceFn<T, TAcc>, initial: TAcc): ReduceFn<T, TAcc> {
  return fn;
}

// Running accumulate — yields each intermediate accumulated value
export function scan<T, TAcc>(
  fn: ReduceFn<T, TAcc>,
  initial: TAcc,
): (items: AsyncIterable<T>) => AsyncGenerator<TAcc> {
  return async function* (items: AsyncIterable<T>) {
    let acc = initial;
    for await (const item of items) {
      acc = await fn(acc, item);
      yield acc;
    }
  };
}

// ─── Limiting transforms ──────────────────────────────────────────────────────

export function take<T>(n: number): FilterFn<T> {
  let count = 0;
  return () => {
    if (count >= n) return false;
    count++;
    return true;
  };
}

export function skip<T>(n: number): FilterFn<T> {
  let skipped = 0;
  return () => {
    if (skipped < n) {
      skipped++;
      return false;
    }
    return true;
  };
}

// ─── Deduplication ────────────────────────────────────────────────────────────

export function distinct<T>(): FilterFn<T> {
  const seen = new Set<T>();
  return (item: T) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  };
}

export function distinctBy<T, K>(keyFn: (item: T) => K): FilterFn<T> {
  const seen = new Set<K>();
  return (item: T) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

// ─── Rate control ─────────────────────────────────────────────────────────────

/**
 * throttle — passes at most one item per `ms` window.
 * Returns a filter function that tracks last emit time.
 */
export function throttle<T>(ms: number): FilterFn<T> {
  let lastEmit = 0;
  return () => {
    const now = Date.now();
    if (now - lastEmit >= ms) {
      lastEmit = now;
      return true;
    }
    return false;
  };
}

/**
 * debounce — only passes an item if no other item followed within `ms`.
 * Works as a generator transformer (needs lookahead).
 */
export function debounce<T>(
  ms: number,
): (items: AsyncIterable<T>) => AsyncGenerator<T> {
  return async function* (items: AsyncIterable<T>) {
    let pending: T | undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const emitted: T[] = [];

    const emit = (item: T) => {
      emitted.push(item);
    };

    for await (const item of items) {
      pending = item;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pending !== undefined) {
          emit(pending);
          pending = undefined;
        }
      }, ms);
      // yield any already-emitted items
      while (emitted.length > 0) {
        yield emitted.shift()!;
      }
    }

    // flush timer
    if (timer) clearTimeout(timer);
    if (pending !== undefined) yield pending;
    while (emitted.length > 0) {
      yield emitted.shift()!;
    }
  };
}

// ─── Batching ─────────────────────────────────────────────────────────────────

/**
 * buffer — groups items into arrays of size n.
 * Returns a generator transformer.
 */
export function buffer<T>(
  n: number,
): (items: AsyncIterable<T>) => AsyncGenerator<T[]> {
  return async function* (items: AsyncIterable<T>) {
    let batch: T[] = [];
    for await (const item of items) {
      batch.push(item);
      if (batch.length >= n) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length > 0) yield batch;
  };
}

/**
 * window — time-based batching. Collects items over `ms` and emits as array.
 */
export function window<T>(
  ms: number,
): (items: AsyncIterable<T>) => AsyncGenerator<T[]> {
  return async function* (items: AsyncIterable<T>) {
    let batch: T[] = [];
    let windowStart = Date.now();

    for await (const item of items) {
      batch.push(item);
      const now = Date.now();
      if (now - windowStart >= ms) {
        yield batch;
        batch = [];
        windowStart = now;
      }
    }
    if (batch.length > 0) yield batch;
  };
}

// ─── Side-effect ──────────────────────────────────────────────────────────────

export function tap<T>(fn: (item: T) => void | Promise<void>): TransformFn<T, T> {
  return async (item: T) => {
    await fn(item);
    return item;
  };
}

// ─── Retry ────────────────────────────────────────────────────────────────────

/**
 * retry — wraps a transform and retries on failure up to n times with delay ms.
 */
export function retry<TIn, TOut>(
  fn: TransformFn<TIn, TOut>,
  maxAttempts: number,
  delayMs: number,
): TransformFn<TIn, TOut> {
  return async (item: TIn): Promise<TOut> => {
    let lastError: Error = new Error('Unknown error');
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn(item);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError;
  };
}

// ─── Utility generators ───────────────────────────────────────────────────────

/**
 * Apply a plain synchronous map to an async iterable.
 */
export async function* mapAsync<TIn, TOut>(
  source: AsyncIterable<TIn>,
  fn: TransformFn<TIn, TOut>,
): AsyncGenerator<TOut> {
  for await (const item of source) {
    yield await fn(item);
  }
}

/**
 * Apply a filter to an async iterable.
 */
export async function* filterAsync<T>(
  source: AsyncIterable<T>,
  fn: FilterFn<T>,
): AsyncGenerator<T> {
  for await (const item of source) {
    if (await fn(item)) yield item;
  }
}

/**
 * Apply flatMap to an async iterable.
 */
export async function* flatMapAsync<TIn, TOut>(
  source: AsyncIterable<TIn>,
  fn: FlatMapFn<TIn, TOut>,
): AsyncGenerator<TOut> {
  for await (const item of source) {
    const results = await fn(item);
    for (const result of results) yield result;
  }
}
