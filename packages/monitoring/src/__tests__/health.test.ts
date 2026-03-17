import { describe, it, expect, beforeEach } from "vitest";
import {
  HealthAggregator,
  livenessCheck,
  memoryCheck,
} from "../health/health-aggregator.js";
import type { HealthCheckResult } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function healthyCheck(name: string = "test"): () => Promise<HealthCheckResult> {
  return async () => ({
    name,
    status: "healthy",
    message: "All good",
    duration: 1,
    timestamp: Date.now(),
  });
}

function unhealthyCheck(name: string = "test"): () => Promise<HealthCheckResult> {
  return async () => ({
    name,
    status: "unhealthy",
    message: "Something is wrong",
    duration: 1,
    timestamp: Date.now(),
  });
}

function degradedCheck(name: string = "test"): () => Promise<HealthCheckResult> {
  return async () => ({
    name,
    status: "degraded",
    message: "Slow response",
    duration: 200,
    timestamp: Date.now(),
  });
}

// ─── HealthAggregator tests ───────────────────────────────────────────────────

describe("HealthAggregator", () => {
  let aggregator: HealthAggregator;

  beforeEach(() => {
    aggregator = new HealthAggregator({ historySize: 10 });
  });

  it("registers and lists checks", () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    expect(aggregator.getCheckNames()).toContain("db");
  });

  it("throws on duplicate registration", () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    expect(() => aggregator.register({ name: "db", check: healthyCheck("db") })).toThrow();
  });

  it("deregisters checks", () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    expect(aggregator.deregister("db")).toBe(true);
    expect(aggregator.getCheckNames()).not.toContain("db");
  });

  it("runAll returns healthy when all checks pass", async () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    aggregator.register({ name: "cache", check: healthyCheck("cache") });
    const report = await aggregator.runAll();
    expect(report.status).toBe("healthy");
    expect(report.checks).toHaveLength(2);
  });

  it("runAll returns unhealthy when a critical check fails", async () => {
    aggregator.register({ name: "db", check: unhealthyCheck("db"), critical: true });
    const report = await aggregator.runAll();
    expect(report.status).toBe("unhealthy");
  });

  it("runAll returns degraded when non-critical check is unhealthy", async () => {
    aggregator.register({ name: "cache", check: unhealthyCheck("cache"), critical: false });
    aggregator.register({ name: "db", check: healthyCheck("db"), critical: true });
    const report = await aggregator.runAll();
    expect(report.status).toBe("degraded");
  });

  it("runAll returns degraded when a check returns degraded status", async () => {
    aggregator.register({ name: "slow", check: degradedCheck("slow") });
    const report = await aggregator.runAll();
    expect(report.status).toBe("degraded");
  });

  it("runAll includes duration and timestamp", async () => {
    const report = await aggregator.runAll();
    expect(report.timestamp).toBeGreaterThan(0);
    expect(report.duration).toBeGreaterThanOrEqual(0);
  });

  it("runCheck executes a single check", async () => {
    aggregator.register({ name: "single", check: healthyCheck("single") });
    const result = await aggregator.runCheck("single");
    expect(result.name).toBe("single");
    expect(result.status).toBe("healthy");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("runCheck throws for unknown check", async () => {
    await expect(aggregator.runCheck("nonexistent")).rejects.toThrow();
  });

  it("records last result", async () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    await aggregator.runCheck("db");
    const last = aggregator.getLastResult("db");
    expect(last).toBeDefined();
    expect(last?.status).toBe("healthy");
  });

  it("stores history and respects historySize", async () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    for (let i = 0; i < 15; i++) {
      await aggregator.runCheck("db");
    }
    const history = aggregator.getHistory("db");
    expect(history.length).toBeLessThanOrEqual(10);
    expect(history.length).toBeGreaterThan(0);
  });

  it("computes response time stats", async () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    for (let i = 0; i < 5; i++) {
      await aggregator.runCheck("db");
    }
    const stats = aggregator.getResponseTimeStats("db");
    expect(stats.avg).toBeGreaterThanOrEqual(0);
    expect(stats.min).toBeGreaterThanOrEqual(0);
    expect(stats.max).toBeGreaterThanOrEqual(stats.min);
    expect(stats.p95).toBeGreaterThanOrEqual(0);
  });

  it("returns unknown status when no checks registered", () => {
    expect(aggregator.getQuickStatus()).toBe("unknown");
  });

  it("getQuickStatus reflects last results without re-running", async () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    await aggregator.runCheck("db");
    expect(aggregator.getQuickStatus()).toBe("healthy");
  });

  it("handles timed-out checks gracefully", async () => {
    const slowCheck = async (): Promise<HealthCheckResult> => {
      await new Promise<void>(r => setTimeout(r, 200));
      return { name: "slow", status: "healthy", message: "ok", duration: 200, timestamp: Date.now() };
    };
    aggregator.register({ name: "slow", check: slowCheck, timeoutMs: 50 });
    const result = await aggregator.runCheck("slow");
    expect(result.status).toBe("unhealthy");
    expect(result.message).toContain("timed out");
  });

  it("handles thrown exceptions in checks", async () => {
    const throwingCheck = async (): Promise<HealthCheckResult> => {
      throw new Error("Check exploded");
    };
    aggregator.register({ name: "throwing", check: throwingCheck });
    const result = await aggregator.runCheck("throwing");
    expect(result.status).toBe("unhealthy");
    expect(result.message).toContain("Check exploded");
  });

  it("filters checks by tag", () => {
    aggregator.register({ name: "db", check: healthyCheck("db"), tags: ["storage", "critical"] });
    aggregator.register({ name: "cache", check: healthyCheck("cache"), tags: ["storage"] });
    aggregator.register({ name: "auth", check: healthyCheck("auth"), tags: ["security"] });

    const storageChecks = aggregator.getChecksByTag("storage");
    expect(storageChecks).toHaveLength(2);
    expect(aggregator.getChecksByTag("critical")).toHaveLength(1);
    expect(aggregator.getChecksByTag("missing")).toHaveLength(0);
  });

  it("includes dependency health in report", async () => {
    const dep = new HealthAggregator();
    dep.register({ name: "dep-check", check: healthyCheck("dep-check") });

    aggregator.addDependency("external-service", dep);
    aggregator.register({ name: "main", check: healthyCheck("main") });

    const report = await aggregator.runAll();
    expect(report.dependencies).toBeDefined();
    expect(report.dependencies?.["external-service"]).toBeDefined();
  });

  it("dependency unhealthy makes parent unhealthy", async () => {
    const dep = new HealthAggregator();
    dep.register({ name: "dep", check: unhealthyCheck("dep"), critical: true });

    aggregator.addDependency("broken-dep", dep);
    aggregator.register({ name: "main", check: healthyCheck("main") });

    const report = await aggregator.runAll();
    expect(report.status).toBe("unhealthy");
  });

  it("removeDependency removes it", () => {
    const dep = new HealthAggregator();
    aggregator.addDependency("dep", dep);
    expect(aggregator.removeDependency("dep")).toBe(true);
  });

  it("start/stop manages the check interval", () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    aggregator.start();
    aggregator.stop();
    // No errors thrown
  });

  it("getLastReport returns null before first run", () => {
    expect(aggregator.getLastReport()).toBeNull();
  });

  it("getLastReport returns last report after runAll", async () => {
    aggregator.register({ name: "db", check: healthyCheck("db") });
    await aggregator.runAll();
    expect(aggregator.getLastReport()).not.toBeNull();
  });
});

// ─── Built-in check factory tests ─────────────────────────────────────────────

describe("livenessCheck", () => {
  it("always returns healthy", async () => {
    const check = livenessCheck();
    const aggregator = new HealthAggregator();
    aggregator.register({ name: "liveness", check });
    const result = await aggregator.runCheck("liveness");
    expect(result.status).toBe("healthy");
  });
});

describe("memoryCheck", () => {
  it("returns healthy under normal memory conditions", async () => {
    const check = memoryCheck(99, 100); // very high thresholds — should always be healthy
    const aggregator = new HealthAggregator();
    aggregator.register({ name: "memory", check });
    const result = await aggregator.runCheck("memory");
    // Should be healthy since thresholds are at 99% and 100%
    expect(["healthy", "degraded"]).toContain(result.status);
    expect(result.message).toContain("Heap:");
  });

  it("returns unhealthy when crit threshold is 0%", async () => {
    const check = memoryCheck(0, 0); // always unhealthy
    const aggregator = new HealthAggregator();
    aggregator.register({ name: "memory", check });
    const result = await aggregator.runCheck("memory");
    expect(result.status).toBe("unhealthy");
  });
});
