import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Queue } from "../queue.js";
import { JobStatus } from "../types.js";

describe("Queue", () => {
  let queue: Queue<{ value: number }, number>;

  beforeEach(() => {
    queue = new Queue({ concurrency: 2, pollInterval: 10 });
    queue.start();
  });

  afterEach(async () => {
    await queue.stop();
  });

  describe("adding jobs", () => {
    it("should add a job and return it", () => {
      const job = queue.add("add", { value: 1 });
      expect(job.id).toBeTruthy();
      expect(job.type).toBe("add");
      expect(job.data).toEqual({ value: 1 });
      expect(job.status).toBe(JobStatus.Pending);
    });

    it("should add delayed job with Delayed status", () => {
      const job = queue.add("add", { value: 1 }, { delay: 5000 });
      expect(job.status).toBe(JobStatus.Delayed);
      expect(job.scheduledFor).toBeDefined();
    });

    it("should use custom jobId", () => {
      const job = queue.add("add", { value: 1 }, { jobId: "custom-id" });
      expect(job.id).toBe("custom-id");
    });

    it("should default to maxAttempts 3", () => {
      const job = queue.add("add", { value: 1 });
      expect(job.maxAttempts).toBe(3);
    });

    it("should respect custom maxAttempts", () => {
      const job = queue.add("add", { value: 1 }, { maxAttempts: 5 });
      expect(job.maxAttempts).toBe(5);
    });
  });

  describe("processing jobs", () => {
    it("should process a job to completion", async () => {
      queue.process("multiply", async (job) => job.data.value * 2);
      const job = queue.add("multiply", { value: 21 });
      await queue.drain();

      const updated = queue.getJob(job.id)!;
      expect(updated.status).toBe(JobStatus.Completed);
      expect(updated.result).toBe(42);
    });

    it("should set job to active during processing", async () => {
      let resolveJob: () => void;
      const started: string[] = [];

      queue.process("slow", async (job) => {
        started.push(job.id);
        await new Promise<void>((r) => {
          resolveJob = r;
        });
        return job.data.value;
      });

      const job = queue.add("slow", { value: 1 });
      // Wait briefly for job to start
      await new Promise((r) => setTimeout(r, 50));

      expect(started).toContain(job.id);
      resolveJob!();
      await queue.drain();
    });

    it("should process multiple jobs concurrently up to concurrency limit", async () => {
      const concurrent: string[] = [];
      let maxConcurrent = 0;

      queue.process("work", async (job) => {
        concurrent.push(job.id);
        maxConcurrent = Math.max(maxConcurrent, concurrent.length);
        await new Promise((r) => setTimeout(r, 20));
        concurrent.splice(concurrent.indexOf(job.id), 1);
        return job.data.value;
      });

      queue.add("work", { value: 1 });
      queue.add("work", { value: 2 });
      queue.add("work", { value: 3 });
      queue.add("work", { value: 4 });

      await queue.drain();
      expect(maxConcurrent).toBeLessThanOrEqual(2); // concurrency = 2
    });

    it("should process jobs in priority order", async () => {
      const processed: number[] = [];

      // Use concurrency 1 for strict ordering; do NOT start until all jobs are queued
      const q = new Queue<{ value: number }, number>({ concurrency: 1, pollInterval: 10 });

      // Register worker before starting
      q.process("prio", async (job) => {
        processed.push(job.priority);
        return job.data.value;
      });

      // Add all jobs while queue is stopped so they all sit in pending
      q.add("prio", { value: 1 }, { priority: 1 });
      q.add("prio", { value: 5 }, { priority: 5 });
      q.add("prio", { value: 3 }, { priority: 3 });

      // Start processing after all three are enqueued
      q.start();
      await q.drain();
      await q.stop();

      // Higher priority should be processed first
      expect(processed[0]).toBe(5);
      expect(processed[1]).toBe(3);
      expect(processed[2]).toBe(1);
    });
  });

  describe("job failure and retry", () => {
    it("should retry a failed job", async () => {
      let attempts = 0;
      queue.process("flaky", async () => {
        attempts++;
        if (attempts < 2) throw new Error("temporary error");
        return 42;
      });

      const job = queue.add("flaky", { value: 1 }, { maxAttempts: 3 });
      await queue.drain();

      const updated = queue.getJob(job.id)!;
      expect(updated.status).toBe(JobStatus.Completed);
      expect(attempts).toBe(2);
    });

    it("should move job to failed after maxAttempts exhausted", async () => {
      queue.process("always-fail", async () => {
        throw new Error("permanent error");
      });

      const job = queue.add("always-fail", { value: 1 }, { maxAttempts: 2, backoff: { strategy: "fixed", delay: 10 } });
      await queue.drain();

      const updated = queue.getJob(job.id)!;
      expect(updated.status).toBe(JobStatus.Failed);
      expect(updated.error).toContain("permanent error");
    });

    it("should add failed job to dead letter queue", async () => {
      queue.process("fail", async () => {
        throw new Error("boom");
      });

      const job = queue.add("fail", { value: 1 }, { maxAttempts: 1 });
      await queue.drain();

      expect(queue.deadLetter.count()).toBe(1);
      expect(queue.deadLetter.get(job.id)?.error).toContain("boom");
    });

    it("should apply exponential backoff", async () => {
      let attempts = 0;
      const attemptTimes: number[] = [];

      queue.process("backoff", async () => {
        attempts++;
        attemptTimes.push(Date.now());
        if (attempts < 3) throw new Error("retry");
        return 1;
      });

      queue.add("backoff", { value: 1 }, {
        maxAttempts: 3,
        backoff: { strategy: "exponential", delay: 50, maxDelay: 500 },
      });

      await queue.drain();
      expect(attempts).toBe(3);
    });
  });

  describe("job timeout", () => {
    it("should fail job on timeout", async () => {
      queue.process("slow", async () => {
        await new Promise((r) => setTimeout(r, 500));
        return 1;
      });

      const job = queue.add("slow", { value: 1 }, { timeout: 50, maxAttempts: 1 });
      await queue.drain();

      const updated = queue.getJob(job.id)!;
      expect(updated.status).toBe(JobStatus.Failed);
      expect(updated.error).toContain("timed out");
    });
  });

  describe("event emission", () => {
    it("should emit job:added event", () => {
      const events: string[] = [];
      queue.on("job:added", () => events.push("added"));
      queue.add("test", { value: 1 });
      expect(events).toContain("added");
    });

    it("should emit job:completed event", async () => {
      const events: string[] = [];
      queue.on("job:completed", () => events.push("completed"));
      queue.process("t", async () => 1);
      queue.add("t", { value: 1 });
      await queue.drain();
      expect(events).toContain("completed");
    });

    it("should emit job:failed event", async () => {
      const events: string[] = [];
      queue.on("job:failed", (e) => events.push(e.job?.id ?? ""));
      queue.process("fail", async () => {
        throw new Error("x");
      });
      const job = queue.add("fail", { value: 1 }, { maxAttempts: 1 });
      await queue.drain();
      expect(events).toContain(job.id);
    });

    it("should remove event listener with off()", async () => {
      let count = 0;
      const listener = () => count++;
      queue.on("job:added", listener);
      queue.add("x", { value: 1 });
      queue.off("job:added", listener);
      queue.add("x", { value: 2 });
      expect(count).toBe(1);
    });
  });

  describe("stats", () => {
    it("should return correct stats", async () => {
      queue.process("stat", async () => 1);
      queue.add("stat", { value: 1 });
      queue.add("stat", { value: 2 });
      await queue.drain();

      const stats = queue.getStats();
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(0);
    });
  });

  describe("removeJob", () => {
    it("should remove a pending job", () => {
      const job = queue.add("noop", { value: 1 });
      const removed = queue.removeJob(job.id);
      expect(removed).toBe(true);
      expect(queue.getJob(job.id)).toBeUndefined();
    });

    it("should not remove active job", async () => {
      let resolveJob!: () => void;
      queue.process("lock", async () => {
        await new Promise<void>((r) => (resolveJob = r));
        return 1;
      });

      const job = queue.add("lock", { value: 1 });
      await new Promise((r) => setTimeout(r, 30));

      const removed = queue.removeJob(job.id);
      expect(removed).toBe(false);
      resolveJob();
      await queue.drain();
    });
  });

  describe("clean", () => {
    it("should remove completed jobs", async () => {
      queue.process("c", async () => 1);
      queue.add("c", { value: 1 });
      await queue.drain();
      const cleaned = queue.clean([JobStatus.Completed]);
      expect(cleaned).toBeGreaterThan(0);
    });
  });

  describe("getJobsByStatus", () => {
    it("should return jobs filtered by status", async () => {
      queue.process("ok", async () => 1);
      queue.process("bad", async () => {
        throw new Error("x");
      });
      queue.add("ok", { value: 1 });
      queue.add("bad", { value: 2 }, { maxAttempts: 1 });
      await queue.drain();

      const completed = queue.getJobsByStatus(JobStatus.Completed);
      const failed = queue.getJobsByStatus(JobStatus.Failed);
      expect(completed).toHaveLength(1);
      expect(failed).toHaveLength(1);
    });
  });
});
