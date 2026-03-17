// Job queue types for the Nexus platform

export enum JobStatus {
  Pending = "pending",
  Active = "active",
  Completed = "completed",
  Failed = "failed",
  Delayed = "delayed",
}

export interface Job<TData = unknown, TResult = unknown> {
  id: string;
  type: string;
  data: TData;
  status: JobStatus;
  priority: number; // higher = processed first
  attempts: number;
  maxAttempts: number;
  result?: TResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  scheduledFor?: Date; // for delayed jobs
  timeout?: number; // ms; 0 = no timeout
  backoff?: BackoffOptions;
}

export type BackoffStrategy = "fixed" | "exponential" | "linear";

export interface BackoffOptions {
  strategy: BackoffStrategy;
  delay: number; // base delay in ms
  maxDelay?: number; // cap for exponential backoff
}

export interface JobOptions {
  priority?: number;
  delay?: number; // ms before job becomes active
  maxAttempts?: number;
  timeout?: number; // ms
  backoff?: BackoffOptions;
  jobId?: string; // override generated id
}

export type ProcessFunction<TData = unknown, TResult = unknown> = (
  job: Job<TData, TResult>,
) => Promise<TResult>;

export interface Worker<TData = unknown, TResult = unknown> {
  type: string;
  concurrency: number;
  process: ProcessFunction<TData, TResult>;
}

export type QueueEventType =
  | "job:added"
  | "job:started"
  | "job:completed"
  | "job:failed"
  | "job:retrying"
  | "job:delayed"
  | "worker:registered"
  | "worker:error"
  | "queue:drained";

export interface QueueEvent<TData = unknown, TResult = unknown> {
  type: QueueEventType;
  job?: Job<TData, TResult>;
  error?: Error;
  timestamp: Date;
}

export type QueueEventListener<TData = unknown, TResult = unknown> = (
  event: QueueEvent<TData, TResult>,
) => void;

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}
