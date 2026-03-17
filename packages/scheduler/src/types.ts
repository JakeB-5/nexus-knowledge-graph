// Task status enum
export enum TaskStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
  Paused = 'paused',
  Skipped = 'skipped',
}

// Cron expression string type (standard 5-field or extended)
export type CronExpression = string;

// Recurrence rule for describing recurring schedules
export interface RecurrenceRule {
  // Interval types
  minutes?: number;
  hours?: number;
  days?: number;
  weeks?: number;
  months?: number;

  // Specific days of week (0=Sun, 1=Mon, ..., 6=Sat)
  daysOfWeek?: number[];

  // Specific day of month (1-31)
  dayOfMonth?: number;

  // First or last weekday of month
  firstWeekdayOfMonth?: number; // 0=Sun ... 6=Sat
  lastWeekdayOfMonth?: number;

  // Dates to exclude
  excludeDates?: Date[];

  // End condition
  endAfterOccurrences?: number;
  endDate?: Date;

  // Starting point
  startDate?: Date;
}

// Configuration for a scheduled task
export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;

  // Schedule definition (one of these must be provided)
  cron?: CronExpression;
  recurrence?: RecurrenceRule;
  runAt?: Date;       // one-time execution
  runAfterMs?: number; // delay in milliseconds

  // Execution
  handler: () => Promise<void> | void;
  timeout?: number; // ms, default no limit

  // Behavior
  status: TaskStatus;
  missedRunBehavior?: 'run' | 'skip'; // default 'skip'
  maxConcurrentRuns?: number; // default 1

  // Metadata
  createdAt: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
  runCount: number;
  errorCount: number;
  lastError?: Error;
}

// Scheduler configuration
export interface SchedulerConfig {
  maxConcurrentTasks?: number; // default 10
  timezone?: string;           // IANA timezone identifier
  defaultMissedRunBehavior?: 'run' | 'skip';
  defaultTimeout?: number;     // ms
  historySize?: number;        // max run history entries to keep, default 100
  tickIntervalMs?: number;     // how often to check for due tasks, default 1000
}

// Task execution history entry
export interface TaskHistoryEntry {
  taskId: string;
  taskName: string;
  startedAt: Date;
  completedAt?: Date;
  status: TaskStatus;
  error?: string;
  durationMs?: number;
}
