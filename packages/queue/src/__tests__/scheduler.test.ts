import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Scheduler } from "../scheduler.js";
import { Queue } from "../queue.js";

describe("Scheduler", () => {
  let scheduler: Scheduler;
  let queue: Queue;

  beforeEach(() => {
    scheduler = new Scheduler({ tickInterval: 20 });
    queue = new Queue({ pollInterval: 10 });
    queue.start();
    scheduler.attachQueue(queue);
  });

  afterEach(async () => {
    scheduler.stop();
    await queue.stop();
  });

  describe("parseCronString", () => {
    it("should parse a valid cron string", () => {
      const cron = scheduler.parseCronString("30 9 * * 1");
      expect(cron.minute).toBe("30");
      expect(cron.hour).toBe("9");
      expect(cron.dayOfMonth).toBe("*");
      expect(cron.month).toBe("*");
      expect(cron.dayOfWeek).toBe("1");
    });

    it("should throw on invalid cron string", () => {
      expect(() => scheduler.parseCronString("* * *")).toThrow("Invalid cron expression");
    });

    it("should parse wildcard cron", () => {
      const cron = scheduler.parseCronString("* * * * *");
      expect(cron.minute).toBe("*");
    });
  });

  describe("computeNextRun", () => {
    it("should compute next run for every-minute cron", () => {
      const cron = scheduler.parseCronString("* * * * *");
      const after = new Date("2024-01-15T10:00:00");
      const next = scheduler.computeNextRun(cron, after);
      // next should be 10:01
      expect(next.getHours()).toBe(10);
      expect(next.getMinutes()).toBe(1);
    });

    it("should compute next run for specific hour", () => {
      const cron = scheduler.parseCronString("0 9 * * *");
      const after = new Date("2024-01-15T10:00:00"); // already past 9am
      const next = scheduler.computeNextRun(cron, after);
      // next should be 9:00 on Jan 16
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
      expect(next.getDate()).toBe(16);
    });

    it("should handle step expressions (*/5 minutes)", () => {
      const cron = scheduler.parseCronString("*/5 * * * *");
      const after = new Date("2024-01-15T10:00:00");
      const next = scheduler.computeNextRun(cron, after);
      expect(next.getMinutes() % 5).toBe(0);
    });

    it("should handle range expressions (1-5 days of week)", () => {
      const cron = scheduler.parseCronString("0 9 * * 1-5");
      const after = new Date("2024-01-13T20:00:00"); // Saturday
      const next = scheduler.computeNextRun(cron, after);
      // next weekday (Mon=1)
      expect(next.getDay()).toBeGreaterThanOrEqual(1);
      expect(next.getDay()).toBeLessThanOrEqual(5);
    });

    it("should handle list expressions (1,3,5 days)", () => {
      const cron = scheduler.parseCronString("0 0 1,15 * *");
      const after = new Date("2024-01-15T00:01:00");
      const next = scheduler.computeNextRun(cron, after);
      expect([1, 15]).toContain(next.getDate());
    });
  });

  describe("scheduleCron", () => {
    it("should schedule a cron job", () => {
      const job = scheduler.scheduleCron("daily-report", "report", {}, "0 9 * * *");
      expect(job.id).toBeTruthy();
      expect(job.name).toBe("daily-report");
      expect(job.type).toBe("report");
      expect(job.oneTime).toBe(false);
      expect(job.enabled).toBe(true);
    });

    it("should accept CronExpression object directly", () => {
      const job = scheduler.scheduleCron("test", "t", {}, {
        minute: "0",
        hour: "9",
        dayOfMonth: "*",
        month: "*",
        dayOfWeek: "*",
      });
      expect(job.cron?.hour).toBe("9");
    });
  });

  describe("scheduleOnce", () => {
    it("should schedule a one-time job", async () => {
      const processed: unknown[] = [];
      queue.process("once", async (job) => {
        processed.push(job.data);
        return null;
      });

      const runAt = new Date(Date.now() + 30);
      scheduler.scheduleOnce("one-time", "once", { key: "val" }, runAt);
      scheduler.start();

      await new Promise((r) => setTimeout(r, 100));
      await queue.drain();

      expect(processed).toHaveLength(1);
      expect(processed[0]).toEqual({ key: "val" });
    });

    it("should remove the scheduled job after it runs", async () => {
      queue.process("once2", async () => null);
      const runAt = new Date(Date.now() + 30);
      const job = scheduler.scheduleOnce("once2", "once2", {}, runAt);
      scheduler.start();

      await new Promise((r) => setTimeout(r, 100));
      expect(scheduler.get(job.id)).toBeUndefined();
    });
  });

  describe("cancel", () => {
    it("should cancel a scheduled job", () => {
      const job = scheduler.scheduleCron("test", "t", {}, "* * * * *");
      expect(scheduler.cancel(job.id)).toBe(true);
      expect(scheduler.get(job.id)).toBeUndefined();
    });

    it("should return false for nonexistent id", () => {
      expect(scheduler.cancel("nonexistent")).toBe(false);
    });
  });

  describe("setEnabled", () => {
    it("should disable a scheduled job", () => {
      const job = scheduler.scheduleCron("test", "t", {}, "* * * * *");
      expect(scheduler.setEnabled(job.id, false)).toBe(true);
      expect(scheduler.get(job.id)?.enabled).toBe(false);
    });

    it("should return false for nonexistent id", () => {
      expect(scheduler.setEnabled("nonexistent", false)).toBe(false);
    });

    it("should not dispatch disabled jobs", async () => {
      const processed: number[] = [];
      queue.process("disabled", async () => {
        processed.push(1);
        return null;
      });

      const runAt = new Date(Date.now() + 20);
      const job = scheduler.scheduleOnce("dis", "disabled", {}, runAt);
      scheduler.setEnabled(job.id, false);
      scheduler.start();

      await new Promise((r) => setTimeout(r, 100));
      expect(processed).toHaveLength(0);
    });
  });

  describe("list and getUpcoming", () => {
    it("should list all scheduled jobs", () => {
      scheduler.scheduleCron("j1", "t1", {}, "* * * * *");
      scheduler.scheduleCron("j2", "t2", {}, "0 9 * * *");
      expect(scheduler.list()).toHaveLength(2);
    });

    it("should list only enabled jobs when requested", () => {
      const j1 = scheduler.scheduleCron("j1", "t1", {}, "* * * * *");
      scheduler.scheduleCron("j2", "t2", {}, "* * * * *");
      scheduler.setEnabled(j1.id, false);
      expect(scheduler.list(true)).toHaveLength(1);
    });

    it("should return upcoming jobs sorted by nextRunAt", () => {
      // Schedule with specific hours to control ordering
      scheduler.scheduleCron("a", "ta", {}, {
        minute: "0", hour: "23", dayOfMonth: "*", month: "*", dayOfWeek: "*",
      });
      scheduler.scheduleCron("b", "tb", {}, {
        minute: "0", hour: "1", dayOfMonth: "*", month: "*", dayOfWeek: "*",
      });

      const upcoming = scheduler.getUpcoming(10);
      expect(upcoming.length).toBeGreaterThan(0);
      // Verify sorted
      for (let i = 1; i < upcoming.length; i++) {
        expect(upcoming[i]!.nextRunAt.getTime()).toBeGreaterThanOrEqual(
          upcoming[i - 1]!.nextRunAt.getTime(),
        );
      }
    });

    it("should limit getUpcoming results", () => {
      for (let i = 0; i < 5; i++) {
        scheduler.scheduleCron(`j${i}`, "t", {}, "* * * * *");
      }
      expect(scheduler.getUpcoming(3)).toHaveLength(3);
    });
  });

  describe("trigger", () => {
    it("should manually trigger a scheduled job", async () => {
      const processed: unknown[] = [];
      queue.process("manual", async (job) => {
        processed.push(job.data);
        return null;
      });

      const job = scheduler.scheduleCron("manual-job", "manual", { x: 1 }, "0 9 * * *");
      const triggered = scheduler.trigger(job.id);
      expect(triggered).toBe(true);

      await queue.drain();
      expect(processed).toHaveLength(1);
    });

    it("should return false when triggering nonexistent job", () => {
      expect(scheduler.trigger("nonexistent")).toBe(false);
    });
  });

  describe("recurring job dispatch", () => {
    it("should dispatch cron job and update runCount", async () => {
      queue.process("recur", async () => null);

      // Use a cron that fires every minute - we use tick manually
      const job = scheduler.scheduleCron("recur-job", "recur", {}, "* * * * *");

      // Manually trigger to simulate tick
      scheduler.trigger(job.id);
      scheduler.trigger(job.id);

      await queue.drain();

      const updated = scheduler.get(job.id);
      expect(updated?.runCount).toBe(2);
    });
  });
});
