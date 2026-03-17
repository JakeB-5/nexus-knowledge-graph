// Core types for the data pipeline package

export enum BackpressureStrategy {
  // Pause the source when the sink is slow
  Pause = 'pause',
  // Drop items when the buffer is full
  Drop = 'drop',
  // Throw an error when the buffer is full
  Error = 'error',
  // Process sequentially (no buffering)
  Sequential = 'sequential',
}

export interface PipelineStage<TIn, TOut> {
  process(item: TIn): Promise<TOut | TOut[] | null | undefined>;
  flush?(): Promise<TOut[]>;
}

export type TransformFn<TIn, TOut> = (item: TIn) => TOut | Promise<TOut>;
export type FilterFn<T> = (item: T) => boolean | Promise<boolean>;
export type ReduceFn<T, TAcc> = (acc: TAcc, item: T) => TAcc | Promise<TAcc>;
export type FlatMapFn<TIn, TOut> = (item: TIn) => TOut[] | Promise<TOut[]>;

export interface PipelineConfig {
  /** Maximum number of items in the internal buffer */
  bufferSize?: number;
  /** Backpressure strategy when buffer is full */
  backpressure?: BackpressureStrategy;
  /** Maximum concurrent item processing */
  concurrency?: number;
  /** Timeout per item in ms (0 = no timeout) */
  itemTimeout?: number;
}

export interface PipelineMetrics {
  itemsProcessed: number;
  itemsDropped: number;
  itemsFailed: number;
  errors: Error[];
  startTime: number;
  endTime: number | null;
  throughput: number; // items per second
  bytesProcessed?: number;
}

export interface WindowConfig {
  /** Window size in ms (for time-based) or count (for count-based) */
  size: number;
  /** Slide interval in ms or count (for sliding windows) */
  slide?: number;
  /** Gap duration in ms (for session windows) */
  gap?: number;
}

export interface JoinConfig<TLeft, TRight> {
  leftKey: (item: TLeft) => unknown;
  rightKey: (item: TRight) => unknown;
  /** Window in ms for time-based join (0 = no window) */
  windowMs?: number;
}

export type ErrorHandlingStrategy = 'skip' | 'retry' | 'dead-letter' | 'throw';

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoff?: 'linear' | 'exponential';
}
