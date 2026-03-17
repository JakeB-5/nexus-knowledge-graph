import { CronParser } from './cron-parser.js';
import {
  TaskStatus,
  type ScheduledTask,
  type SchedulerConfig,
  type TaskHistoryEntry,
} from './types.js';

let taskIdCounter = 0;
function nextId(): string {
  return `task-${++taskIdCounter}-${Date.now()}`;
}

export class Scheduler {
  private readonly tasks: Map<string, ScheduledTask> = new Map();
  private readonly config: Required<SchedulerConfig>;
  private readonly history: TaskHistoryEntry[] = [];
  private running = false;
  private paused = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private readonly activeRuns: Map<string, number> = new Map(); // taskId -> concurrent count

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks ?? 10,
      timezone: config.timezone ?? 'UTC',
      defaultMissedRunBehavior: config.defaultMissedRunBehavior ?? 'skip',
      defaultTimeout: config.defaultTimeout ?? 0,
      historySize: config.historySize ?? 100,
      tickIntervalMs: config.tickIntervalMs ?? 1000,
    };
  }

  // Start the scheduler tick loop
  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.tickHandle = setInterval(() => void this.tick(), this.config.tickIntervalMs);
  }

  // Stop the scheduler
  stop(): void {
    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.running = false;
  }

  // Pause all task execution (tasks still accumulate nextRunAt)
  pause(): void {
    this.paused = true;
  }

  // Resume execution
  resume(): void {
    this.paused = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  // Schedule a recurring cron task
  scheduleCron(
    name: string,
    cronExpr: string,
    handler: () => Promise<void> | void,
    options?: Partial<Pick<ScheduledTask, 'description' | 'timeout' | 'missedRunBehavior' | 'maxConcurrentRuns'>>,
  ): string {
    const parser = new CronParser(cronExpr);
    const nextRunAt = parser.nextDate(new Date());
    const id = nextId();

    const task: ScheduledTask = {
      id,
      name,
      cron: cronExpr,
      handler,
      status: TaskStatus.Pending,
      createdAt: new Date(),
      nextRunAt,
      runCount: 0,
      errorCount: 0,
      description: options?.description,
      timeout: options?.timeout ?? this.config.defaultTimeout,
      missedRunBehavior: options?.missedRunBehavior ?? this.config.defaultMissedRunBehavior,
      maxConcurrentRuns: options?.maxConcurrentRuns ?? 1,
    };

    this.tasks.set(id, task);
    return id;
  }

  // Schedule a one-time task at a specific date
  scheduleAt(
    name: string,
    runAt: Date,
    handler: () => Promise<void> | void,
    options?: Partial<Pick<ScheduledTask, 'description' | 'timeout'>>,
  ): string {
    const id = nextId();
    const task: ScheduledTask = {
      id,
      name,
      runAt,
      handler,
      status: TaskStatus.Pending,
      createdAt: new Date(),
      nextRunAt: runAt,
      runCount: 0,
      errorCount: 0,
      description: options?.description,
      timeout: options?.timeout ?? this.config.defaultTimeout,
      maxConcurrentRuns: 1,
    };
    this.tasks.set(id, task);
    return id;
  }

  // Schedule a task to run after a delay
  scheduleAfter(
    name: string,
    delayMs: number,
    handler: () => Promise<void> | void,
    options?: Partial<Pick<ScheduledTask, 'description' | 'timeout'>>,
  ): string {
    const runAt = new Date(Date.now() + delayMs);
    return this.scheduleAt(name, runAt, handler, options);
  }

  // Cancel a task
  cancel(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.status = TaskStatus.Cancelled;
    this.tasks.delete(id);
    return true;
  }

  // Pause a specific task
  pauseTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.status = TaskStatus.Paused;
    return true;
  }

  // Resume a specific task
  resumeTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status === TaskStatus.Paused) {
      task.status = TaskStatus.Pending;
    }
    return true;
  }

  // Get task by id
  getTask(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }

  // All tasks
  getAllTasks(): ScheduledTask[] {
    return [...this.tasks.values()];
  }

  // Task execution history
  getHistory(taskId?: string): TaskHistoryEntry[] {
    if (taskId) return this.history.filter((h) => h.taskId === taskId);
    return [...this.history];
  }

  // Main tick: check for due tasks and execute them
  private async tick(): Promise<void> {
    if (this.paused) return;

    const now = new Date();
    const totalActive = [...this.activeRuns.values()].reduce((a, b) => a + b, 0);
    if (totalActive >= this.config.maxConcurrentTasks) return;

    for (const task of this.tasks.values()) {
      if (task.status === TaskStatus.Paused || task.status === TaskStatus.Cancelled) continue;
      if (task.status === TaskStatus.Running) continue;
      if (!task.nextRunAt || task.nextRunAt > now) continue;

      const concurrent = this.activeRuns.get(task.id) ?? 0;
      if (concurrent >= (task.maxConcurrentRuns ?? 1)) continue;

      // Handle missed runs
      const missedBehavior = task.missedRunBehavior ?? this.config.defaultMissedRunBehavior;
      const missedMs = now.getTime() - task.nextRunAt.getTime();
      if (missedMs > this.config.tickIntervalMs * 2) {
        if (missedBehavior === 'skip') {
          this.advanceNextRun(task);
          continue;
        }
        // 'run' - execute even if missed
      }

      void this.executeTask(task);
    }
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    const startedAt = new Date();
    const historyEntry: TaskHistoryEntry = {
      taskId: task.id,
      taskName: task.name,
      startedAt,
      status: TaskStatus.Running,
    };

    this.activeRuns.set(task.id, (this.activeRuns.get(task.id) ?? 0) + 1);
    task.status = TaskStatus.Running;
    task.lastRunAt = startedAt;

    try {
      if (task.timeout && task.timeout > 0) {
        await Promise.race([
          Promise.resolve(task.handler()),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Task "${task.name}" timed out after ${task.timeout}ms`)), task.timeout),
          ),
        ]);
      } else {
        await Promise.resolve(task.handler());
      }

      task.runCount++;
      task.status = TaskStatus.Pending;
      historyEntry.status = TaskStatus.Completed;
    } catch (err) {
      task.errorCount++;
      task.lastError = err instanceof Error ? err : new Error(String(err));
      task.status = TaskStatus.Failed;
      historyEntry.status = TaskStatus.Failed;
      historyEntry.error = task.lastError.message;
      // Reset to pending so it can run again on next schedule
      task.status = TaskStatus.Pending;
    } finally {
      const completedAt = new Date();
      historyEntry.completedAt = completedAt;
      historyEntry.durationMs = completedAt.getTime() - startedAt.getTime();
      this.addHistory(historyEntry);

      const cur = this.activeRuns.get(task.id) ?? 1;
      this.activeRuns.set(task.id, Math.max(0, cur - 1));

      // Advance schedule or remove one-time tasks
      this.advanceNextRun(task);
    }
  }

  private advanceNextRun(task: ScheduledTask): void {
    if (task.cron) {
      const parser = new CronParser(task.cron);
      task.nextRunAt = parser.nextDate(new Date());
    } else if (task.runAt || task.runAfterMs !== undefined) {
      // One-time task: remove after completion
      this.tasks.delete(task.id);
    }
  }

  private addHistory(entry: TaskHistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > this.config.historySize) {
      this.history.shift();
    }
  }
}
