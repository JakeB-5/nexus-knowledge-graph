// In-memory priority job queue with full lifecycle management

import { randomUUID } from "crypto";
import {
  Job,
  JobOptions,
  JobStatus,
  ProcessFunction,
  QueueEvent,
  QueueEventListener,
  QueueEventType,
  QueueStats,
} from "./types.js";
import { PriorityQueue } from "./priority-queue.js";
import { DeadLetterQueue } from "./dead-letter.js";

interface QueuePriorityItem {
  id: string;
  priority: number;
  insertionOrder: number;
}

export interface QueueOptions {
  concurrency?: number;
  defaultMaxAttempts?: number;
  defaultTimeout?: number;
  deadLetterEnabled?: boolean;
  pollInterval?: number; // ms between checking delayed jobs
}

type EventMap = {
  [K in QueueEventType]?: QueueEventListener[];
};

export class Queue<TData = unknown, TResult = unknown> {
  private pendingQueue: PriorityQueue<QueuePriorityItem> = new PriorityQueue();
  private jobs: Map<string, Job<TData, TResult>> = new Map();
  private activeJobs: Map<string, Promise<void>> = new Map();
  private delayedJobs: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private workers: Map<string, ProcessFunction<TData, TResult>> = new Map();
  private eventListeners: EventMap = {};

  private readonly concurrency: number;
  private readonly defaultMaxAttempts: number;
  private readonly defaultTimeout: number;
  private readonly deadLetterEnabled: boolean;
  private readonly pollInterval: number;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private completedCount: number = 0;
  private failedCount: number = 0;

  readonly deadLetter: DeadLetterQueue<TData, TResult>;

  constructor(options: QueueOptions = {}) {
    this.concurrency = options.concurrency ?? 5;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.defaultTimeout = options.defaultTimeout ?? 0;
    this.deadLetterEnabled = options.deadLetterEnabled ?? true;
    this.pollInterval = options.pollInterval ?? 500;
    this.deadLetter = new DeadLetterQueue();
  }

  /**
   * Start the queue processing loop.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollTimer = setInterval(() => this.tick(), this.pollInterval);
    // Process any jobs that were added before start()
    this.tick();
  }

  /**
   * Stop the queue. Waits for active jobs to finish.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    // Clear delayed timers
    for (const timer of this.delayedJobs.values()) {
      clearTimeout(timer);
    }
    this.delayedJobs.clear();
    // Wait for active jobs
    await Promise.allSettled(this.activeJobs.values());
  }

  /**
   * Register a worker process function for a job type.
   */
  process(type: string, fn: ProcessFunction<TData, TResult>): void {
    this.workers.set(type, fn);
    this.emit("worker:registered", undefined);
    this.tick(); // attempt to start processing immediately
  }

  /**
   * Add a job to the queue.
   */
  add(type: string, data: TData, options: JobOptions = {}): Job<TData, TResult> {
    const id = options.jobId ?? randomUUID();
    const now = new Date();
    const priority = options.priority ?? 0;
    const delay = options.delay ?? 0;
    const maxAttempts = options.maxAttempts ?? this.defaultMaxAttempts;
    const timeout = options.timeout ?? this.defaultTimeout;

    const job: Job<TData, TResult> = {
      id,
      type,
      data,
      status: delay > 0 ? JobStatus.Delayed : JobStatus.Pending,
      priority,
      attempts: 0,
      maxAttempts,
      timeout,
      backoff: options.backoff,
      createdAt: now,
      updatedAt: now,
      scheduledFor: delay > 0 ? new Date(Date.now() + delay) : undefined,
    };

    this.jobs.set(id, job);
    this.emit("job:added", job);

    if (delay > 0) {
      this.scheduleDelayed(job, delay);
    } else {
      this.enqueue(job);
      this.tick();
    }

    return job;
  }

  /**
   * Enqueue a job into the priority queue.
   */
  private enqueue(job: Job<TData, TResult>): void {
    this.updateJob(job.id, { status: JobStatus.Pending });
    this.pendingQueue.insert({ id: job.id, priority: job.priority, insertionOrder: 0 });
  }

  /**
   * Schedule a delayed job using setTimeout.
   * If delayMs is 0, enqueues immediately without a timer.
   */
  private scheduleDelayed(job: Job<TData, TResult>, delayMs: number): void {
    if (delayMs <= 0) {
      this.enqueue(job);
      this.tick();
      return;
    }
    const timer = setTimeout(() => {
      this.delayedJobs.delete(job.id);
      const current = this.jobs.get(job.id);
      if (!current || current.status !== JobStatus.Delayed) return;
      this.emit("job:delayed", current);
      this.enqueue(current);
      this.tick();
    }, delayMs);
    this.delayedJobs.set(job.id, timer);
  }

  /**
   * Main processing tick. Dispatches pending jobs to available workers.
   * No-op when queue is not running.
   */
  private tick(): void {
    if (!this.isRunning) return;
    while (this.activeJobs.size < this.concurrency && !this.pendingQueue.isEmpty) {
      const next = this.pendingQueue.peek();
      if (!next) break;

      const job = this.jobs.get(next.id);
      if (!job) {
        this.pendingQueue.extractMax();
        continue;
      }

      const worker = this.workers.get(job.type);
      if (!worker) break; // no worker registered for this type

      this.pendingQueue.extractMax();
      this.dispatchJob(job, worker);
    }

    // Emit drained event when queue is empty and no active jobs
    if (this.pendingQueue.isEmpty && this.activeJobs.size === 0 && this.jobs.size > 0) {
      this.emit("queue:drained", undefined);
    }
  }

  /**
   * Dispatch a job to its worker.
   */
  private dispatchJob(job: Job<TData, TResult>, worker: ProcessFunction<TData, TResult>): void {
    const now = new Date();
    this.updateJob(job.id, {
      status: JobStatus.Active,
      startedAt: now,
      updatedAt: now,
      attempts: job.attempts + 1,
    });

    const updated = this.jobs.get(job.id)!;
    this.emit("job:started", updated);

    const promise = this.runJob(updated, worker).finally(() => {
      this.activeJobs.delete(job.id);
      this.tick();
    });

    this.activeJobs.set(job.id, promise);
  }

  /**
   * Run a job with timeout and retry logic.
   */
  private async runJob(job: Job<TData, TResult>, worker: ProcessFunction<TData, TResult>): Promise<void> {
    try {
      let result: TResult;

      if (job.timeout && job.timeout > 0) {
        result = await this.withTimeout(worker(job), job.timeout, job.id);
      } else {
        result = await worker(job);
      }

      const now = new Date();
      this.updateJob(job.id, {
        status: JobStatus.Completed,
        result,
        completedAt: now,
        updatedAt: now,
      });
      this.completedCount++;
      this.emit("job:completed", this.jobs.get(job.id));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.handleFailure(job, err);
    }
  }

  /**
   * Handle job failure: retry if attempts remain, otherwise move to DLQ.
   */
  private async handleFailure(job: Job<TData, TResult>, error: Error): Promise<void> {
    const current = this.jobs.get(job.id);
    if (!current) return;

    const attemptsUsed = current.attempts;

    if (attemptsUsed < current.maxAttempts) {
      // Schedule retry with backoff
      const delay = this.computeBackoff(current);
      this.updateJob(job.id, {
        status: JobStatus.Delayed,
        error: error.message,
        updatedAt: new Date(),
        scheduledFor: new Date(Date.now() + delay),
      });
      this.emit("job:retrying", this.jobs.get(job.id));
      this.scheduleDelayed(this.jobs.get(job.id)!, delay);
    } else {
      // Final failure
      const now = new Date();
      this.updateJob(job.id, {
        status: JobStatus.Failed,
        error: error.message,
        failedAt: now,
        updatedAt: now,
      });
      this.failedCount++;
      const failed = this.jobs.get(job.id)!;
      this.emit("job:failed", failed);

      if (this.deadLetterEnabled) {
        this.deadLetter.add(failed, error.message);
      }
    }
  }

  /**
   * Compute backoff delay for a retry.
   */
  private computeBackoff(job: Job<TData, TResult>): number {
    if (!job.backoff) return 0; // no backoff config: retry immediately

    const { strategy, delay, maxDelay } = job.backoff;
    const attempt = job.attempts;

    let computed: number;
    switch (strategy) {
      case "fixed":
        computed = delay;
        break;
      case "linear":
        computed = delay * attempt;
        break;
      case "exponential":
        computed = delay * Math.pow(2, attempt - 1);
        break;
      default:
        computed = delay;
    }

    return maxDelay ? Math.min(computed, maxDelay) : computed;
  }

  /**
   * Wrap a promise with a timeout.
   */
  private withTimeout<T>(promise: Promise<T>, ms: number, jobId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job ${jobId} timed out after ${ms}ms`));
      }, ms);

      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  /**
   * Update job fields in the jobs map.
   */
  private updateJob(id: string, updates: Partial<Job<TData, TResult>>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, updates);
  }

  /**
   * Get a job by id.
   */
  getJob(id: string): Job<TData, TResult> | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get all jobs with a given status.
   */
  getJobsByStatus(status: JobStatus): Job<TData, TResult>[] {
    return Array.from(this.jobs.values()).filter((j) => j.status === status);
  }

  /**
   * Remove a job (only if pending or delayed).
   */
  removeJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === JobStatus.Active) return false;

    this.pendingQueue.removeById(id);

    const timer = this.delayedJobs.get(id);
    if (timer) {
      clearTimeout(timer);
      this.delayedJobs.delete(id);
    }

    this.jobs.delete(id);
    return true;
  }

  /**
   * Get queue statistics.
   */
  getStats(): QueueStats {
    const counts = { pending: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    for (const job of this.jobs.values()) {
      switch (job.status) {
        case JobStatus.Pending:
          counts.pending++;
          break;
        case JobStatus.Active:
          counts.active++;
          break;
        case JobStatus.Completed:
          counts.completed++;
          break;
        case JobStatus.Failed:
          counts.failed++;
          break;
        case JobStatus.Delayed:
          counts.delayed++;
          break;
      }
    }
    return { ...counts, total: this.jobs.size };
  }

  /**
   * Wait for all currently pending, active, and delayed (retry) jobs to finish.
   */
  async drain(): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (this.pendingQueue.isEmpty && this.activeJobs.size === 0 && this.delayedJobs.size === 0) {
          resolve();
        } else {
          setTimeout(check, 20);
        }
      };
      check();
    });
  }

  /**
   * Clear all completed and failed jobs from memory.
   */
  clean(statuses: JobStatus[] = [JobStatus.Completed, JobStatus.Failed]): number {
    let removed = 0;
    for (const [id, job] of this.jobs.entries()) {
      if (statuses.includes(job.status)) {
        this.jobs.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Register event listener.
   */
  on(event: QueueEventType, listener: QueueEventListener): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]!.push(listener);
  }

  /**
   * Remove event listener.
   */
  off(event: QueueEventType, listener: QueueEventListener): void {
    const listeners = this.eventListeners[event];
    if (!listeners) return;
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  }

  private emit(type: QueueEventType, job: Job<TData, TResult> | undefined, error?: Error): void {
    const listeners = this.eventListeners[type];
    if (!listeners) return;
    const event: QueueEvent<TData, TResult> = { type, job, error, timestamp: new Date() };
    for (const listener of listeners) {
      try {
        listener(event as QueueEvent);
      } catch {
        // listener errors should not crash the queue
      }
    }
  }

  get running(): boolean {
    return this.isRunning;
  }

  get pendingCount(): number {
    return this.pendingQueue.size;
  }

  get activeCount(): number {
    return this.activeJobs.size;
  }
}
