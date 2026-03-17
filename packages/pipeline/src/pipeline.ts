// Pipeline: fluent functional data processing with map, filter, reduce, flatMap,
// batch, windowing, error handling, backpressure, metrics, and composition.

import type {
  TransformFn,
  FilterFn,
  ReduceFn,
  FlatMapFn,
  PipelineConfig,
  PipelineMetrics,
  ErrorHandlingStrategy,
  RetryConfig,
} from './types.js';
import { BackpressureStrategy } from './types.js';

type Source<T> = T[] | AsyncIterable<T> | (() => AsyncGenerator<T>);
type SinkFn<T> = (item: T) => void | Promise<void>;

interface StageDescriptor<TIn, TOut> {
  type: string;
  fn: (item: TIn) => Promise<TOut | TOut[] | null | undefined>;
  flush?: () => Promise<TOut | TOut[] | null | undefined>;
}

// Internal: convert any source to an async generator
async function* toAsyncGenerator<T>(source: Source<T>): AsyncGenerator<T> {
  if (Array.isArray(source)) {
    for (const item of source) yield item;
  } else if (typeof source === 'function') {
    yield* source();
  } else {
    yield* source;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.maxAttempts - 1) {
        const delay =
          config.backoff === 'exponential'
            ? config.delayMs * Math.pow(2, attempt)
            : config.delayMs;
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

export class Pipeline<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stages: StageDescriptor<any, any>[] = [];
  private source: Source<T> | null = null;
  private config: Required<PipelineConfig>;
  private metrics: PipelineMetrics = {
    itemsProcessed: 0,
    itemsDropped: 0,
    itemsFailed: 0,
    errors: [],
    startTime: 0,
    endTime: null,
    throughput: 0,
  };
  private deadLetterQueue: unknown[] = [];
  private errorStrategy: ErrorHandlingStrategy = 'skip';
  private retryConfig: RetryConfig = { maxAttempts: 3, delayMs: 100 };

  constructor(config: PipelineConfig = {}) {
    this.config = {
      bufferSize: config.bufferSize ?? 1000,
      backpressure: config.backpressure ?? BackpressureStrategy.Sequential,
      concurrency: config.concurrency ?? 1,
      itemTimeout: config.itemTimeout ?? 0,
    };
  }

  // ─── Source factories ───────────────────────────────────────────────────────

  static from<T>(source: Source<T>, config?: PipelineConfig): Pipeline<T> {
    const p = new Pipeline<T>(config);
    p.source = source;
    return p;
  }

  // ─── Transformation stages ──────────────────────────────────────────────────

  map<TOut>(fn: TransformFn<T, TOut>): Pipeline<TOut> {
    const next = this.clone<TOut>();
    next.stages.push({
      type: 'map',
      fn: async (item: T) => fn(item),
    });
    return next;
  }

  filter(fn: FilterFn<T>): Pipeline<T> {
    const next = this.clone<T>();
    next.stages.push({
      type: 'filter',
      fn: async (item: T) => {
        const keep = await fn(item);
        return keep ? item : null;
      },
    });
    return next;
  }

  flatMap<TOut>(fn: FlatMapFn<T, TOut>): Pipeline<TOut> {
    const next = this.clone<TOut>();
    next.stages.push({
      type: 'flatMap',
      fn: async (item: T) => fn(item),
    });
    return next;
  }

  reduce<TAcc>(fn: ReduceFn<T, TAcc>, initial: TAcc): Pipeline<TAcc> {
    const next = this.clone<TAcc>();
    let acc = initial;
    next.stages.push({
      type: 'reduce',
      fn: async (item: T) => {
        acc = await fn(acc, item);
        return undefined; // will emit on flush
      },
    });
    // Store accumulator access for later retrieval
    (next as unknown as { _reduceAcc: () => TAcc })._reduceAcc = () => acc;
    return next;
  }

  tap(fn: (item: T) => void | Promise<void>): Pipeline<T> {
    const next = this.clone<T>();
    next.stages.push({
      type: 'tap',
      fn: async (item: T) => {
        await fn(item);
        return item;
      },
    });
    return next;
  }

  take(n: number): Pipeline<T> {
    const next = this.clone<T>();
    let count = 0;
    next.stages.push({
      type: 'take',
      fn: async (item: T) => {
        if (count >= n) return null;
        count++;
        return item;
      },
    });
    return next;
  }

  skip(n: number): Pipeline<T> {
    const next = this.clone<T>();
    let skipped = 0;
    next.stages.push({
      type: 'skip',
      fn: async (item: T) => {
        if (skipped < n) {
          skipped++;
          return null;
        }
        return item;
      },
    });
    return next;
  }

  batch(size: number): Pipeline<T[]> {
    const next = this.clone<T[]>();
    let buffer: T[] = [];
    next.stages.push({
      type: 'batch',
      fn: async (item: T) => {
        buffer.push(item);
        if (buffer.length >= size) {
          const batch = buffer;
          buffer = [];
          return batch;
        }
        return null;
      },
      flush: async () => {
        if (buffer.length > 0) {
          const batch = buffer;
          buffer = [];
          return batch;
        }
        return null;
      },
    });
    return next;
  }

  distinct(): Pipeline<T> {
    const next = this.clone<T>();
    const seen = new Set<unknown>();
    next.stages.push({
      type: 'distinct',
      fn: async (item: T) => {
        if (seen.has(item)) return null;
        seen.add(item);
        return item;
      },
    });
    return next;
  }

  distinctBy<K>(keyFn: (item: T) => K): Pipeline<T> {
    const next = this.clone<T>();
    const seen = new Set<K>();
    next.stages.push({
      type: 'distinctBy',
      fn: async (item: T) => {
        const key = keyFn(item);
        if (seen.has(key)) return null;
        seen.add(key);
        return item;
      },
    });
    return next;
  }

  // ─── Error handling ─────────────────────────────────────────────────────────

  onError(strategy: ErrorHandlingStrategy, retryConfig?: Partial<RetryConfig>): Pipeline<T> {
    const next = this.clone<T>();
    next.errorStrategy = strategy;
    if (retryConfig) {
      next.retryConfig = { ...next.retryConfig, ...retryConfig };
    }
    return next;
  }

  // ─── Sink methods ───────────────────────────────────────────────────────────

  async toArray(): Promise<T[]> {
    const results: T[] = [];
    await this.forEach((item) => { results.push(item); });
    return results;
  }

  async forEach(sink: SinkFn<T>): Promise<void> {
    if (!this.source) throw new Error('No source configured');
    this.metrics.startTime = Date.now();

    for await (const item of this.process()) {
      await sink(item);
    }

    this.metrics.endTime = Date.now();
    const elapsed = (this.metrics.endTime - this.metrics.startTime) / 1000;
    this.metrics.throughput = elapsed > 0 ? this.metrics.itemsProcessed / elapsed : 0;
  }

  async first(): Promise<T | undefined> {
    if (!this.source) throw new Error('No source configured');
    for await (const item of this.process()) {
      return item;
    }
    return undefined;
  }

  async last(): Promise<T | undefined> {
    let last: T | undefined;
    await this.forEach((item) => { last = item; });
    return last;
  }

  async count(): Promise<number> {
    let n = 0;
    await this.forEach(() => { n++; });
    return n;
  }

  // ─── Composition ─────────────────────────────────────────────────────────────

  compose<TOut>(other: Pipeline<TOut>): Pipeline<TOut> {
    // Feed this pipeline's output as source to the other pipeline
    const self = this;
    const composed = Pipeline.from<TOut>(async function* () {
      for await (const item of self.process()) {
        other.source = [item as unknown as TOut];
        for await (const out of other.processSource([item as unknown as TOut])) {
          yield out;
        }
      }
    }, this.config);
    return composed;
  }

  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  getDeadLetterQueue(): unknown[] {
    return [...this.deadLetterQueue];
  }

  // ─── Internal processing ────────────────────────────────────────────────────

  async *process(): AsyncGenerator<T> {
    if (!this.source) throw new Error('No source configured');
    yield* this.processSource(toAsyncGenerator(this.source));
  }

  async *processSource(source: AsyncIterable<T>): AsyncGenerator<T> {
    for await (const raw of source) {
      yield* this.processItem(raw);
    }
    // Flush buffered stages (e.g. batch remainder)
    yield* this.flushStages();
  }

  private async *flushStages(): AsyncGenerator<T> {
    for (const stage of this.stages) {
      if (!stage.flush) continue;
      const result = await stage.flush();
      if (result === null || result === undefined) continue;
      if (Array.isArray(result) && stage.type === 'batch') {
        // batch flush emits a single array item
        this.metrics.itemsProcessed++;
        yield result as unknown as T;
      } else if (Array.isArray(result) && stage.type === 'flatMap') {
        for (const item of result) {
          this.metrics.itemsProcessed++;
          yield item as T;
        }
      } else {
        this.metrics.itemsProcessed++;
        yield result as unknown as T;
      }
    }
  }

  private async *processItem(item: unknown): AsyncGenerator<T> {
    let current: unknown[] = [item];

    for (const stage of this.stages) {
      const next: unknown[] = [];

      for (const val of current) {
        try {
          const processFn = () => stage.fn(val) as Promise<unknown>;
          const result = this.retryConfig && this.errorStrategy === 'retry'
            ? await withRetry(processFn, this.retryConfig)
            : await processFn();

          if (result === null || result === undefined) {
            // item filtered out or suppressed — skip
          } else if (Array.isArray(result) && stage.type === 'flatMap') {
            // flatMap: spread the returned array into multiple items
            next.push(...result);
          } else {
            // batch, map, tap, take, skip, distinct, distinctBy, reduce — treat as single item
            next.push(result);
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.metrics.itemsFailed++;
          this.metrics.errors.push(error);

          if (this.errorStrategy === 'dead-letter') {
            this.deadLetterQueue.push(val);
          } else if (this.errorStrategy === 'throw') {
            throw error;
          }
          // skip or retry already handled
        }
      }

      current = next;
    }

    for (const item of current) {
      this.metrics.itemsProcessed++;
      yield item as T;
    }
  }

  private clone<TOut>(): Pipeline<TOut> {
    const next = new Pipeline<TOut>(this.config);
    next.source = this.source as unknown as Source<TOut>;
    next.stages = [...this.stages];
    next.errorStrategy = this.errorStrategy;
    next.retryConfig = { ...this.retryConfig };
    return next;
  }
}
