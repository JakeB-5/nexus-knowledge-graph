/**
 * Async utility functions for the Nexus platform.
 */

// Portable timer helpers that work in both Node.js and browser environments
// without requiring DOM or @types/node lib entries in the tsconfig.
const _setTimeout = (fn: () => void, ms: number): unknown =>
  (globalThis as unknown as Record<string, Function>)["setTimeout"]!(fn, ms);
const _clearTimeout = (id: unknown): void =>
  (globalThis as unknown as Record<string, Function>)["clearTimeout"]!(id);

/**
 * Wait for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => _setTimeout(resolve, ms));
}

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  attempts?: number;
  /** Initial delay in ms (default: 100) */
  delay?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoff?: number;
  /** Maximum delay in ms (default: 30_000) */
  maxDelay?: number;
  /** Optional predicate – if false, stop retrying */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Retry an async function with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    delay = 100,
    backoff = 2,
    maxDelay = 30_000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts || !shouldRetry(err, attempt)) break;
      await sleep(Math.min(currentDelay, maxDelay));
      currentDelay *= backoff;
    }
  }
  throw lastError;
}

/**
 * Add a timeout to a promise. Rejects with a TimeoutError if exceeded.
 */
export function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = _setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => { _clearTimeout(timer); resolve(value); },
      (err) => { _clearTimeout(timer); reject(err as Error); },
    );
  });
}

/**
 * Debounce a function: delays execution until after `ms` milliseconds
 * have elapsed since the last call.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: unknown;
  return (...args: Parameters<T>) => {
    if (timer !== undefined) _clearTimeout(timer);
    timer = _setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, ms);
  };
}

/**
 * Throttle a function: ensures it is called at most once per `ms` milliseconds.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    }
  };
}

/**
 * Map over an array with an async function, limiting concurrency.
 */
export async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = Infinity,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let activeCount = 0;
  let index = 0;

  return new Promise((resolve, reject) => {
    function next(): void {
      while (activeCount < concurrency && index < items.length) {
        const i = index++;
        const item = items[i] as T; // noUncheckedIndexedAccess: i is always valid here
        activeCount++;
        fn(item, i).then(
          (result) => {
            results[i] = result;
            activeCount--;
            if (index < items.length) {
              next();
            } else if (activeCount === 0) {
              resolve(results);
            }
          },
          (err) => reject(err),
        );
      }
      if (items.length === 0) resolve(results);
    }
    next();
  });
}

export type SettledResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

/**
 * Like Promise.allSettled but with proper TypeScript types.
 */
export async function pSettle<T>(
  promises: Promise<T>[],
): Promise<SettledResult<T>[]> {
  return Promise.allSettled(promises) as Promise<SettledResult<T>[]>;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Create an externally resolvable promise.
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const locks = new Map<string, Promise<void>>();

/**
 * Execute fn while holding a named lock (simple async mutex).
 * Concurrent calls with the same key are queued.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const deferred = createDeferred<void>();
  locks.set(key, deferred.promise);
  try {
    await prev;
    return await fn();
  } finally {
    deferred.resolve();
    if (locks.get(key) === deferred.promise) {
      locks.delete(key);
    }
  }
}

/**
 * Wrap a function so it can be called at most `limit` times per `windowMs`.
 * Excess calls return undefined without invoking fn.
 */
export function rateLimit<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number,
  windowMs: number,
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  const calls: number[] = [];
  return (...args: Parameters<T>): ReturnType<T> | undefined => {
    const now = Date.now();
    // Evict calls outside the window
    while (calls.length > 0 && (calls[0] ?? now) < now - windowMs) {
      calls.shift();
    }
    if (calls.length >= limit) return undefined;
    calls.push(now);
    return fn(...args) as ReturnType<T>;
  };
}
