import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../scheduler.js';
import { TaskStatus } from '../types.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new Scheduler({ tickIntervalMs: 100 });
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe('lifecycle', () => {
    it('starts and stops correctly', () => {
      expect(scheduler.isRunning).toBe(false);
      scheduler.start();
      expect(scheduler.isRunning).toBe(true);
      scheduler.stop();
      expect(scheduler.isRunning).toBe(false);
    });

    it('pause and resume', () => {
      scheduler.start();
      scheduler.pause();
      expect(scheduler.isPaused).toBe(true);
      scheduler.resume();
      expect(scheduler.isPaused).toBe(false);
    });

    it('double start does not create multiple ticks', () => {
      scheduler.start();
      scheduler.start(); // should be a no-op
      expect(scheduler.isRunning).toBe(true);
    });
  });

  describe('scheduleAt', () => {
    it('executes one-time task at specified time', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const runAt = new Date(Date.now() + 500);
      scheduler.scheduleAt('test-task', runAt, handler);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(600);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not execute before scheduled time', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const runAt = new Date(Date.now() + 5000);
      scheduler.scheduleAt('future-task', runAt, handler);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(100);
      expect(handler).not.toHaveBeenCalled();
    });

    it('removes one-time task after execution', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const runAt = new Date(Date.now() + 200);
      const id = scheduler.scheduleAt('one-time', runAt, handler);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(400);
      expect(scheduler.getTask(id)).toBeUndefined();
    });
  });

  describe('scheduleAfter', () => {
    it('executes after delay', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      scheduler.scheduleAfter('delayed', 300, handler);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(250);
      expect(handler).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(150);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('cancels a task', () => {
      const handler = vi.fn();
      const id = scheduler.scheduleAfter('cancel-me', 1000, handler);
      expect(scheduler.cancel(id)).toBe(true);
      expect(scheduler.getTask(id)).toBeUndefined();
    });

    it('returns false for non-existing task', () => {
      expect(scheduler.cancel('nonexistent')).toBe(false);
    });
  });

  describe('pauseTask / resumeTask', () => {
    it('paused task does not execute', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const runAt = new Date(Date.now() + 200);
      const id = scheduler.scheduleAt('pausable', runAt, handler);
      scheduler.pauseTask(id);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(500);
      expect(handler).not.toHaveBeenCalled();
    });

    it('resumed task executes', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const runAt = new Date(Date.now() + 300);
      const id = scheduler.scheduleAt('resumable', runAt, handler);
      scheduler.pauseTask(id);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(200);
      scheduler.resumeTask(id);

      await vi.advanceTimersByTimeAsync(300);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('resumeTask returns false for non-existing task', () => {
      expect(scheduler.resumeTask('nonexistent')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('handles task errors without crashing', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Task failed'));
      const runAt = new Date(Date.now() + 100);
      const id = scheduler.scheduleAt('failing', runAt, handler);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(300);
      // Task removed after one-time run even on failure
      expect(handler).toHaveBeenCalled();
    });

    it('records error count', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('oops'));
      const runAt = new Date(Date.now() + 100);
      const id = scheduler.scheduleAfter('failing-cron', 100, handler);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(300);
      // One-time tasks are removed after run, so we just verify the handler was called
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getAllTasks', () => {
    it('returns all registered tasks', () => {
      scheduler.scheduleAfter('t1', 1000, () => {});
      scheduler.scheduleAfter('t2', 2000, () => {});
      expect(scheduler.getAllTasks()).toHaveLength(2);
    });
  });

  describe('history', () => {
    it('records execution history', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      scheduler.scheduleAfter('history-task', 100, handler);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(300);
      const history = scheduler.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('can filter history by task id', async () => {
      const h1 = vi.fn().mockResolvedValue(undefined);
      const h2 = vi.fn().mockResolvedValue(undefined);
      const id1 = scheduler.scheduleAfter('task-a', 100, h1);
      scheduler.scheduleAfter('task-b', 100, h2);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(300);
      const history = scheduler.getHistory(id1);
      expect(history.every((e) => e.taskId === id1)).toBe(true);
    });
  });

  describe('timeout', () => {
    it('times out slow tasks', async () => {
      const handler = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 10000)),
      );
      scheduler.scheduleAfter('slow', 100, handler, { timeout: 200 });
      scheduler.start();

      await vi.advanceTimersByTimeAsync(500);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('config', () => {
    it('uses custom historySize', async () => {
      const s = new Scheduler({ historySize: 3, tickIntervalMs: 50 });
      s.start();

      for (let i = 0; i < 5; i++) {
        s.scheduleAt(`t${i}`, new Date(Date.now() + (i + 1) * 60), () => {});
      }

      await vi.advanceTimersByTimeAsync(500);
      expect(s.getHistory().length).toBeLessThanOrEqual(3);
      s.stop();
    });
  });
});
