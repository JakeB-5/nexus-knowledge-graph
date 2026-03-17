/**
 * BackupScheduler - schedule automatic backups with retention policy
 */

import { randomUUID } from "crypto";
import type {
  BackupMetadata,
  BackupOptions,
  BackupSchedule,
  RetentionPolicy,
} from "./types.js";
import { BackupStatus } from "./types.js";

export interface SchedulerCallbacks {
  /** Called when a backup completes successfully */
  onComplete?: (metadata: BackupMetadata) => void;
  /** Called when a backup fails */
  onFailure?: (scheduleId: string, error: unknown) => void;
  /** Called when old backups are cleaned up */
  onCleanup?: (deleted: BackupMetadata[]) => void;
}

export type BackupRunner = (options: BackupOptions) => Promise<BackupMetadata>;

const INTERVAL_MS: Record<BackupSchedule["cronExpression"], number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export class BackupScheduler {
  private readonly schedules = new Map<string, BackupSchedule>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly backupHistory = new Map<string, BackupMetadata[]>();
  private readonly runner: BackupRunner;
  private readonly callbacks: SchedulerCallbacks;

  constructor(runner: BackupRunner, callbacks: SchedulerCallbacks = {}) {
    this.runner = runner;
    this.callbacks = callbacks;
  }

  /** Add and start a backup schedule */
  addSchedule(schedule: Omit<BackupSchedule, "id" | "nextRunAt">): BackupSchedule {
    const id = randomUUID();
    const intervalMs = INTERVAL_MS[schedule.cronExpression];

    const fullSchedule: BackupSchedule = {
      ...schedule,
      id,
      nextRunAt: new Date(Date.now() + intervalMs),
    };

    this.schedules.set(id, fullSchedule);
    this.backupHistory.set(id, []);

    if (schedule.enabled) {
      this.startTimer(id, intervalMs);
    }

    return fullSchedule;
  }

  /** Remove a schedule */
  removeSchedule(id: string): boolean {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }
    this.backupHistory.delete(id);
    return this.schedules.delete(id);
  }

  /** Enable or disable a schedule */
  setEnabled(id: string, enabled: boolean): void {
    const schedule = this.schedules.get(id);
    if (!schedule) throw new Error(`Schedule not found: ${id}`);

    schedule.enabled = enabled;

    if (enabled) {
      const intervalMs = INTERVAL_MS[schedule.cronExpression];
      this.startTimer(id, intervalMs);
    } else {
      const timer = this.timers.get(id);
      if (timer) {
        clearInterval(timer);
        this.timers.delete(id);
      }
    }
  }

  /** Manually trigger a backup for a schedule */
  async runNow(id: string): Promise<BackupMetadata> {
    const schedule = this.schedules.get(id);
    if (!schedule) throw new Error(`Schedule not found: ${id}`);

    return this.executeBackup(id, schedule);
  }

  /** Get all schedules */
  getSchedules(): BackupSchedule[] {
    return Array.from(this.schedules.values());
  }

  /** Get backup history for a schedule */
  getHistory(scheduleId: string): BackupMetadata[] {
    return [...(this.backupHistory.get(scheduleId) ?? [])];
  }

  /** Apply retention policy to clean up old backups */
  applyRetentionPolicy(scheduleId: string, policy: RetentionPolicy): BackupMetadata[] {
    const history = this.backupHistory.get(scheduleId) ?? [];
    const toDelete: BackupMetadata[] = [];
    const toKeep: BackupMetadata[] = [];

    const sorted = [...history].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    for (let i = 0; i < sorted.length; i++) {
      const backup = sorted[i]!;
      const ageMs = Date.now() - backup.timestamp.getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      const ageWeeks = ageDays / 7;
      const ageMonths = ageDays / 30;

      let keep = false;

      if (policy.keepLast !== undefined && i < policy.keepLast) {
        keep = true;
      }

      if (policy.keepDailyDays !== undefined && ageDays <= policy.keepDailyDays) {
        keep = true;
      }

      if (policy.keepWeeklyWeeks !== undefined && ageWeeks <= policy.keepWeeklyWeeks) {
        keep = true;
      }

      if (policy.keepMonthlyMonths !== undefined && ageMonths <= policy.keepMonthlyMonths) {
        keep = true;
      }

      if (keep) {
        toKeep.push(backup);
      } else {
        toDelete.push(backup);
      }
    }

    this.backupHistory.set(scheduleId, toKeep);

    if (toDelete.length > 0) {
      this.callbacks.onCleanup?.(toDelete);
    }

    return toDelete;
  }

  /** Stop all schedules */
  stopAll(): void {
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
      this.timers.delete(id);
    }
  }

  private startTimer(id: string, intervalMs: number): void {
    const existing = this.timers.get(id);
    if (existing) clearInterval(existing);

    const schedule = this.schedules.get(id)!;

    const timer = setInterval(() => {
      void this.executeBackup(id, schedule).catch((err) => {
        this.callbacks.onFailure?.(id, err);
      });
    }, intervalMs);

    this.timers.set(id, timer);
  }

  private async executeBackup(id: string, schedule: BackupSchedule): Promise<BackupMetadata> {
    const schedule_ = this.schedules.get(id)!;
    const intervalMs = INTERVAL_MS[schedule_.cronExpression];

    try {
      const metadata = await this.runner(schedule.options);

      schedule_.lastRunAt = new Date();
      schedule_.nextRunAt = new Date(Date.now() + intervalMs);

      const history = this.backupHistory.get(id) ?? [];
      history.push(metadata);
      this.backupHistory.set(id, history);

      this.callbacks.onComplete?.(metadata);
      this.applyRetentionPolicy(id, schedule.retentionPolicy);

      return metadata;
    } catch (err) {
      schedule_.lastRunAt = new Date();
      schedule_.nextRunAt = new Date(Date.now() + intervalMs);
      this.callbacks.onFailure?.(id, err);
      throw err;
    }
  }
}
