// Dead letter queue for failed jobs

import { Job, JobStatus } from "./types.js";

export interface DeadLetterEntry<TData = unknown, TResult = unknown> {
  job: Job<TData, TResult>;
  error: string;
  failedAt: Date;
  originalQueueType: string;
}

export interface DeadLetterQueueOptions {
  maxSize?: number; // max entries to keep (oldest purged first)
  ttl?: number; // milliseconds before an entry is auto-purged (0 = no ttl)
}

export class DeadLetterQueue<TData = unknown, TResult = unknown> {
  private entries: Map<string, DeadLetterEntry<TData, TResult>> = new Map();
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(options: DeadLetterQueueOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.ttl = options.ttl ?? 0;
  }

  /**
   * Add a failed job to the dead letter queue.
   */
  add(job: Job<TData, TResult>, error: string): DeadLetterEntry<TData, TResult> {
    // Prune expired entries first
    if (this.ttl > 0) this.pruneExpired();

    // Enforce max size by removing oldest
    if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }

    const entry: DeadLetterEntry<TData, TResult> = {
      job: { ...job, status: JobStatus.Failed, error, failedAt: new Date() },
      error,
      failedAt: new Date(),
      originalQueueType: job.type,
    };

    this.entries.set(job.id, entry);
    return entry;
  }

  /**
   * Get an entry by job id.
   */
  get(jobId: string): DeadLetterEntry<TData, TResult> | undefined {
    const entry = this.entries.get(jobId);
    if (!entry) return undefined;

    if (this.ttl > 0 && Date.now() - entry.failedAt.getTime() > this.ttl) {
      this.entries.delete(jobId);
      return undefined;
    }

    return entry;
  }

  /**
   * Remove an entry from the dead letter queue.
   */
  remove(jobId: string): boolean {
    return this.entries.delete(jobId);
  }

  /**
   * Get all entries, optionally filtered by job type.
   */
  list(type?: string): DeadLetterEntry<TData, TResult>[] {
    if (this.ttl > 0) this.pruneExpired();
    const all = Array.from(this.entries.values());
    return type ? all.filter((e) => e.originalQueueType === type) : all;
  }

  /**
   * Get the count of entries, optionally filtered.
   */
  count(type?: string): number {
    return this.list(type).length;
  }

  /**
   * Retry a job from the dead letter queue.
   * Returns the job ready to be re-added to the main queue, or undefined if not found.
   */
  retry(jobId: string): Job<TData, TResult> | undefined {
    const entry = this.get(jobId);
    if (!entry) return undefined;

    this.entries.delete(jobId);

    return {
      ...entry.job,
      status: JobStatus.Pending,
      attempts: 0,
      error: undefined,
      failedAt: undefined,
      startedAt: undefined,
      completedAt: undefined,
      updatedAt: new Date(),
    };
  }

  /**
   * Retry all jobs matching an optional type filter.
   * Returns the jobs ready to be re-added to the main queue.
   */
  retryAll(type?: string): Job<TData, TResult>[] {
    const entries = this.list(type);
    return entries.map((e) => this.retry(e.job.id)!).filter(Boolean);
  }

  /**
   * Remove expired entries (based on TTL).
   */
  pruneExpired(): number {
    if (this.ttl === 0) return 0;
    const now = Date.now();
    let pruned = 0;
    for (const [id, entry] of this.entries.entries()) {
      if (now - entry.failedAt.getTime() > this.ttl) {
        this.entries.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Purge all entries.
   */
  purge(type?: string): number {
    if (!type) {
      const count = this.entries.size;
      this.entries.clear();
      return count;
    }

    let purged = 0;
    for (const [id, entry] of this.entries.entries()) {
      if (entry.originalQueueType === type) {
        this.entries.delete(id);
        purged++;
      }
    }
    return purged;
  }

  get size(): number {
    return this.entries.size;
  }
}
