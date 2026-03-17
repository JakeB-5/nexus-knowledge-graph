// Cron-like job scheduler

import { randomUUID } from "crypto";
import { JobOptions } from "./types.js";
import { Queue } from "./queue.js";

export interface CronExpression {
  minute: string;   // 0-59 or "*"
  hour: string;     // 0-23 or "*"
  dayOfMonth: string; // 1-31 or "*"
  month: string;    // 1-12 or "*"
  dayOfWeek: string; // 0-6 (Sun=0) or "*"
}

export interface ScheduledJob {
  id: string;
  name: string;
  type: string;
  data: unknown;
  cron?: CronExpression;
  nextRunAt: Date;
  lastRunAt?: Date;
  runCount: number;
  enabled: boolean;
  options: JobOptions;
  // for one-time delayed jobs
  oneTime: boolean;
}

export interface SchedulerOptions {
  tickInterval?: number; // ms between scheduler ticks (default 1000)
}

export class Scheduler {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private readonly tickInterval: number;
  private queue?: Queue;
  private isRunning: boolean = false;

  constructor(options: SchedulerOptions = {}) {
    this.tickInterval = options.tickInterval ?? 1000;
  }

  /**
   * Attach a queue to dispatch jobs into.
   */
  attachQueue(queue: Queue): void {
    this.queue = queue;
  }

  /**
   * Start the scheduler tick loop.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tickTimer = setInterval(() => this.tick(), this.tickInterval);
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    this.isRunning = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /**
   * Schedule a recurring job with a cron expression.
   */
  scheduleCron(
    name: string,
    type: string,
    data: unknown,
    cron: CronExpression | string,
    options: JobOptions = {},
  ): ScheduledJob {
    const parsed = typeof cron === "string" ? this.parseCronString(cron) : cron;
    const nextRunAt = this.computeNextRun(parsed, new Date());

    const job: ScheduledJob = {
      id: randomUUID(),
      name,
      type,
      data,
      cron: parsed,
      nextRunAt,
      runCount: 0,
      enabled: true,
      options,
      oneTime: false,
    };

    this.scheduledJobs.set(job.id, job);
    return job;
  }

  /**
   * Schedule a one-time delayed job.
   */
  scheduleOnce(
    name: string,
    type: string,
    data: unknown,
    runAt: Date,
    options: JobOptions = {},
  ): ScheduledJob {
    const job: ScheduledJob = {
      id: randomUUID(),
      name,
      type,
      data,
      nextRunAt: runAt,
      runCount: 0,
      enabled: true,
      options,
      oneTime: true,
    };

    this.scheduledJobs.set(job.id, job);
    return job;
  }

  /**
   * Cancel a scheduled job by id.
   */
  cancel(id: string): boolean {
    return this.scheduledJobs.delete(id);
  }

  /**
   * Enable or disable a scheduled job.
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const job = this.scheduledJobs.get(id);
    if (!job) return false;
    job.enabled = enabled;
    return true;
  }

  /**
   * Get a scheduled job by id.
   */
  get(id: string): ScheduledJob | undefined {
    return this.scheduledJobs.get(id);
  }

  /**
   * List all scheduled jobs, optionally filtering enabled only.
   */
  list(enabledOnly = false): ScheduledJob[] {
    const all = Array.from(this.scheduledJobs.values());
    return enabledOnly ? all.filter((j) => j.enabled) : all;
  }

  /**
   * Get upcoming jobs sorted by nextRunAt.
   */
  getUpcoming(limit = 10): ScheduledJob[] {
    return this.list(true)
      .sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime())
      .slice(0, limit);
  }

  /**
   * Main tick: check which jobs are due and dispatch them.
   */
  private tick(): void {
    if (!this.queue) return;
    const now = new Date();

    for (const job of this.scheduledJobs.values()) {
      if (!job.enabled) continue;
      if (job.nextRunAt > now) continue;

      this.dispatch(job, now);
    }
  }

  /**
   * Dispatch a job to the queue.
   */
  private dispatch(scheduledJob: ScheduledJob, now: Date): void {
    if (!this.queue) return;

    this.queue.add(scheduledJob.type, scheduledJob.data as never, scheduledJob.options);

    scheduledJob.lastRunAt = now;
    scheduledJob.runCount++;

    if (scheduledJob.oneTime) {
      this.scheduledJobs.delete(scheduledJob.id);
    } else if (scheduledJob.cron) {
      scheduledJob.nextRunAt = this.computeNextRun(scheduledJob.cron, now);
    }
  }

  /**
   * Compute the next run time for a cron expression after a given date.
   */
  computeNextRun(cron: CronExpression, after: Date): Date {
    const next = new Date(after);
    // Round up to the next minute
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);

    // Try up to 1 year of minutes
    const limit = new Date(after.getTime() + 365 * 24 * 60 * 60 * 1000);

    while (next <= limit) {
      if (this.matchesCron(cron, next)) {
        return next;
      }
      next.setMinutes(next.getMinutes() + 1);
    }

    throw new Error("Could not compute next run time for cron expression");
  }

  /**
   * Check if a date matches a cron expression.
   */
  private matchesCron(cron: CronExpression, date: Date): boolean {
    return (
      this.matchField(cron.minute, date.getMinutes(), 0, 59) &&
      this.matchField(cron.hour, date.getHours(), 0, 23) &&
      this.matchField(cron.dayOfMonth, date.getDate(), 1, 31) &&
      this.matchField(cron.month, date.getMonth() + 1, 1, 12) &&
      this.matchField(cron.dayOfWeek, date.getDay(), 0, 6)
    );
  }

  /**
   * Match a single cron field.
   * Supports: "*", "5", "1,2,3", "1-5", star-slash-5 (step)
   */
  private matchField(field: string, value: number, _min: number, _max: number): boolean {
    if (field === "*") return true;

    // Step syntax: */5
    if (field.startsWith("*/")) {
      const step = parseInt(field.slice(2), 10);
      return value % step === 0;
    }

    // List syntax: 1,2,3
    if (field.includes(",")) {
      return field.split(",").some((f) => this.matchField(f.trim(), value, _min, _max));
    }

    // Range syntax: 1-5
    if (field.includes("-")) {
      const [start, end] = field.split("-").map(Number);
      return value >= (start ?? 0) && value <= (end ?? 0);
    }

    // Exact value
    return parseInt(field, 10) === value;
  }

  /**
   * Parse a cron string "m h dom mon dow" into a CronExpression object.
   */
  parseCronString(cron: string): CronExpression {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: "${cron}" (expected 5 fields: m h dom mon dow)`);
    }
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    return {
      minute: minute ?? "*",
      hour: hour ?? "*",
      dayOfMonth: dayOfMonth ?? "*",
      month: month ?? "*",
      dayOfWeek: dayOfWeek ?? "*",
    };
  }

  /**
   * Manually trigger a scheduled job by id (bypasses time check).
   */
  trigger(id: string): boolean {
    const job = this.scheduledJobs.get(id);
    if (!job || !this.queue) return false;
    this.dispatch(job, new Date());
    return true;
  }

  get running(): boolean {
    return this.isRunning;
  }
}
