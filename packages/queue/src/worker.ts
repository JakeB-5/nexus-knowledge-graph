// Worker class for processing queue jobs

import { Job, ProcessFunction, QueueEventListener, QueueEventType } from "./types.js";

export interface WorkerOptions<TData = unknown, TResult = unknown> {
  type: string;
  concurrency?: number;
  process: ProcessFunction<TData, TResult>;
  heartbeatInterval?: number; // ms between health checks
  onError?: (job: Job<TData, TResult>, error: Error) => void;
}

export interface WorkerHealth {
  type: string;
  isRunning: boolean;
  activeJobs: number;
  concurrency: number;
  processedCount: number;
  failedCount: number;
  lastHeartbeat: Date | null;
  uptime: number; // ms since start
}

type EventMap<TData, TResult> = {
  [K in QueueEventType]?: QueueEventListener<TData, TResult>[];
};

export class Worker<TData = unknown, TResult = unknown> {
  readonly type: string;
  readonly concurrency: number;

  private processFunction: ProcessFunction<TData, TResult>;
  private activeJobs: Map<string, Job<TData, TResult>> = new Map();
  private isRunning: boolean = false;
  private startedAt: Date | null = null;
  private lastHeartbeat: Date | null = null;
  private heartbeatInterval: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private processedCount: number = 0;
  private failedCount: number = 0;
  private onError?: (job: Job<TData, TResult>, error: Error) => void;
  private eventListeners: EventMap<TData, TResult> = {};
  private shutdownResolve: (() => void) | null = null;

  constructor(options: WorkerOptions<TData, TResult>) {
    this.type = options.type;
    this.concurrency = options.concurrency ?? 1;
    this.processFunction = options.process;
    this.heartbeatInterval = options.heartbeatInterval ?? 30000;
    this.onError = options.onError;
  }

  /**
   * Start the worker (begin accepting and processing jobs).
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startedAt = new Date();
    this.startHeartbeat();
  }

  /**
   * Gracefully stop the worker: stop accepting new jobs,
   * wait for active jobs to complete.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.stopHeartbeat();

    if (this.activeJobs.size > 0) {
      await new Promise<void>((resolve) => {
        this.shutdownResolve = resolve;
      });
    }
  }

  /**
   * Force stop, cancelling active jobs (they will not complete).
   */
  forceStop(): void {
    this.isRunning = false;
    this.stopHeartbeat();
    this.activeJobs.clear();
    this.shutdownResolve?.();
    this.shutdownResolve = null;
  }

  /**
   * Check if worker can accept a new job.
   */
  canAccept(): boolean {
    return this.isRunning && this.activeJobs.size < this.concurrency;
  }

  /**
   * Execute a job. Returns the result or throws on failure.
   */
  async execute(job: Job<TData, TResult>): Promise<TResult> {
    if (!this.isRunning) {
      throw new Error(`Worker '${this.type}' is not running`);
    }
    if (this.activeJobs.size >= this.concurrency) {
      throw new Error(`Worker '${this.type}' is at capacity`);
    }

    this.activeJobs.set(job.id, job);
    this.emit("job:started", job);

    try {
      let result: TResult;

      if (job.timeout && job.timeout > 0) {
        result = await this.executeWithTimeout(job, job.timeout);
      } else {
        result = await this.processFunction(job);
      }

      this.processedCount++;
      this.emit("job:completed", job);
      return result;
    } catch (error) {
      this.failedCount++;
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(job, err);
      this.emit("worker:error", job, err);
      throw err;
    } finally {
      this.activeJobs.delete(job.id);

      // If we were waiting for shutdown and now drained, resolve
      if (!this.isRunning && this.activeJobs.size === 0) {
        this.shutdownResolve?.();
        this.shutdownResolve = null;
      }
    }
  }

  /**
   * Execute a job with a timeout, rejecting if it takes too long.
   */
  private executeWithTimeout(job: Job<TData, TResult>, timeoutMs: number): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job ${job.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.processFunction(job).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  /**
   * Get current health status.
   */
  getHealth(): WorkerHealth {
    return {
      type: this.type,
      isRunning: this.isRunning,
      activeJobs: this.activeJobs.size,
      concurrency: this.concurrency,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      lastHeartbeat: this.lastHeartbeat,
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
    };
  }

  /**
   * Get list of currently active job IDs.
   */
  getActiveJobIds(): string[] {
    return Array.from(this.activeJobs.keys());
  }

  /**
   * Register event listener.
   */
  on(event: QueueEventType, listener: QueueEventListener<TData, TResult>): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]!.push(listener);
  }

  /**
   * Remove event listener.
   */
  off(event: QueueEventType, listener: QueueEventListener<TData, TResult>): void {
    const listeners = this.eventListeners[event];
    if (!listeners) return;
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  }

  private emit(type: QueueEventType, job?: Job<TData, TResult>, error?: Error): void {
    const listeners = this.eventListeners[type];
    if (!listeners) return;
    const event = { type, job, error, timestamp: new Date() };
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors should not crash the worker
      }
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.lastHeartbeat = new Date();
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Replace the process function at runtime.
   */
  setProcessFunction(fn: ProcessFunction<TData, TResult>): void {
    this.processFunction = fn;
  }

  get running(): boolean {
    return this.isRunning;
  }

  get activeCount(): number {
    return this.activeJobs.size;
  }
}

/**
 * WorkerPool manages multiple workers of different types.
 */
export class WorkerPool {
  private workers: Map<string, Worker[]> = new Map();

  /**
   * Register a worker for a job type.
   */
  register<TData, TResult>(worker: Worker<TData, TResult>): void {
    if (!this.workers.has(worker.type)) {
      this.workers.set(worker.type, []);
    }
    this.workers.get(worker.type)!.push(worker as unknown as Worker);
    worker.start();
  }

  /**
   * Get an available worker for a given job type.
   */
  getAvailable(type: string): Worker | undefined {
    const pool = this.workers.get(type);
    if (!pool) return undefined;
    return pool.find((w) => w.canAccept());
  }

  /**
   * Stop all workers gracefully.
   */
  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const pool of this.workers.values()) {
      for (const worker of pool) {
        promises.push(worker.stop());
      }
    }
    await Promise.all(promises);
  }

  /**
   * Get health of all workers.
   */
  getHealth(): WorkerHealth[] {
    const result: WorkerHealth[] = [];
    for (const pool of this.workers.values()) {
      for (const worker of pool) {
        result.push(worker.getHealth());
      }
    }
    return result;
  }

  /**
   * Get all registered types.
   */
  getTypes(): string[] {
    return Array.from(this.workers.keys());
  }
}
