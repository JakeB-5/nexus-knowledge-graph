// HealthAggregator: periodic health check execution and status aggregation
import type {
  HealthCheckResult,
  HealthReport,
  HealthStatus,
} from "../types.js";

// ─── Health check function ────────────────────────────────────────────────────

export type HealthCheckFn = () => Promise<HealthCheckResult> | HealthCheckResult;

export interface HealthCheckRegistration {
  name: string;
  check: HealthCheckFn;
  /** Tags for grouping/filtering */
  tags?: string[];
  /** Timeout for this check (ms, default: 5000) */
  timeoutMs?: number;
  /** Whether this check is critical (unhealthy = system unhealthy) */
  critical?: boolean;
}

export interface AggregatorOptions {
  /** How often to run checks (ms, default: 30000) */
  intervalMs?: number;
  /** Default timeout per check (ms, default: 5000) */
  defaultTimeoutMs?: number;
  /** Number of historical results to retain per check (default: 50) */
  historySize?: number;
}

// ─── HealthAggregator ─────────────────────────────────────────────────────────

export class HealthAggregator {
  private readonly checks: Map<string, HealthCheckRegistration> = new Map();
  private readonly lastResults: Map<string, HealthCheckResult> = new Map();
  private readonly history: Map<string, HealthCheckResult[]> = new Map();
  private readonly dependencies: Map<string, HealthAggregator> = new Map();

  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly historySize: number;

  private lastReport: HealthReport | null = null;

  constructor(options: AggregatorOptions = {}) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5_000;
    this.historySize = options.historySize ?? 50;
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  /**
   * Register a health check.
   */
  register(registration: HealthCheckRegistration): void {
    if (this.checks.has(registration.name)) {
      throw new Error(`Health check "${registration.name}" already registered`);
    }
    this.checks.set(registration.name, {
      timeoutMs: this.defaultTimeoutMs,
      critical: true,
      ...registration,
    });
    this.history.set(registration.name, []);
  }

  /**
   * Deregister a health check.
   */
  deregister(name: string): boolean {
    this.lastResults.delete(name);
    this.history.delete(name);
    return this.checks.delete(name);
  }

  /**
   * Register a dependent service's aggregator. Its health is included in the tree.
   */
  addDependency(name: string, aggregator: HealthAggregator): void {
    this.dependencies.set(name, aggregator);
  }

  removeDependency(name: string): boolean {
    return this.dependencies.delete(name);
  }

  getCheckNames(): string[] {
    return [...this.checks.keys()];
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Start running checks on the configured interval.
   */
  start(): void {
    if (this.checkInterval) return;
    // Run immediately, then on interval
    void this.runAll();
    this.checkInterval = setInterval(() => {
      void this.runAll();
    }, this.intervalMs);

    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
  }

  /**
   * Stop the periodic check runner.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // ─── Execution ────────────────────────────────────────────────────────────

  /**
   * Run a single named check and return its result.
   */
  async runCheck(name: string): Promise<HealthCheckResult> {
    const reg = this.checks.get(name);
    if (!reg) throw new Error(`Health check "${name}" not found`);

    const startTime = Date.now();

    try {
      const result = await withTimeout(reg.check(), reg.timeoutMs ?? this.defaultTimeoutMs);
      const enriched: HealthCheckResult = {
        ...result,
        name,
        duration: Date.now() - startTime,
        timestamp: startTime,
      };
      this.recordResult(name, enriched);
      return enriched;
    } catch (err) {
      const timedOut = err instanceof TimeoutError;
      const result: HealthCheckResult = {
        name,
        status: "unhealthy",
        message: timedOut
          ? `Check timed out after ${reg.timeoutMs ?? this.defaultTimeoutMs}ms`
          : err instanceof Error ? err.message : String(err),
        duration: Date.now() - startTime,
        timestamp: startTime,
      };
      this.recordResult(name, result);
      return result;
    }
  }

  /**
   * Run all registered checks concurrently and produce a health report.
   */
  async runAll(): Promise<HealthReport> {
    const startTime = Date.now();

    const results = await Promise.all(
      [...this.checks.keys()].map(name => this.runCheck(name)),
    );

    // Collect dependency reports
    const dependencyReports: Record<string, HealthReport> = {};
    for (const [depName, depAggregator] of this.dependencies) {
      dependencyReports[depName] = await depAggregator.runAll();
    }

    const aggregateStatus = this.aggregateStatus(results, dependencyReports);
    const duration = Date.now() - startTime;

    const report: HealthReport = {
      status: aggregateStatus,
      timestamp: startTime,
      duration,
      checks: results,
      dependencies: Object.keys(dependencyReports).length > 0 ? dependencyReports : undefined,
    };

    this.lastReport = report;
    return report;
  }

  /**
   * Get the most recent health report without re-running checks.
   */
  getLastReport(): HealthReport | null {
    return this.lastReport;
  }

  // ─── Status aggregation ───────────────────────────────────────────────────

  private aggregateStatus(
    results: HealthCheckResult[],
    dependencies: Record<string, HealthReport>,
  ): HealthStatus {
    // Check critical checks first
    const criticalChecks = results.filter(r => {
      const reg = this.checks.get(r.name);
      return reg?.critical !== false;
    });

    const hasUnhealthyCritical = criticalChecks.some(r => r.status === "unhealthy");
    if (hasUnhealthyCritical) return "unhealthy";

    // Check dependency health
    const depStatuses = Object.values(dependencies).map(d => d.status);
    if (depStatuses.includes("unhealthy")) return "unhealthy";

    // Degraded if any non-critical check is unhealthy, or any check is degraded
    const hasDegraded = results.some(r => r.status === "degraded" || r.status === "unhealthy");
    if (hasDegraded) return "degraded";
    if (depStatuses.includes("degraded")) return "degraded";

    // Unknown if no checks registered
    if (results.length === 0) return "unknown";

    return "healthy";
  }

  // ─── History ──────────────────────────────────────────────────────────────

  private recordResult(name: string, result: HealthCheckResult): void {
    this.lastResults.set(name, result);
    const hist = this.history.get(name) ?? [];
    hist.push(result);
    if (hist.length > this.historySize) {
      hist.splice(0, hist.length - this.historySize);
    }
    this.history.set(name, hist);
  }

  /**
   * Get the last result for a specific check.
   */
  getLastResult(name: string): HealthCheckResult | undefined {
    return this.lastResults.get(name);
  }

  /**
   * Get history for a specific check.
   */
  getHistory(name: string): HealthCheckResult[] {
    return [...(this.history.get(name) ?? [])];
  }

  /**
   * Get response time statistics for a check.
   */
  getResponseTimeStats(name: string): { avg: number; min: number; max: number; p95: number } {
    const hist = this.history.get(name) ?? [];
    if (hist.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };

    const durations = hist.map(r => r.duration).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const p95Idx = Math.floor(durations.length * 0.95);

    return {
      avg: sum / durations.length,
      min: durations[0] ?? 0,
      max: durations[durations.length - 1] ?? 0,
      p95: durations[p95Idx] ?? 0,
    };
  }

  /**
   * Get all last results as a map.
   */
  getAllLastResults(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults);
  }

  /**
   * Get checks filtered by tag.
   */
  getChecksByTag(tag: string): HealthCheckRegistration[] {
    return [...this.checks.values()].filter(r => r.tags?.includes(tag));
  }

  /**
   * Quick summary: overall status from last results without re-running.
   */
  getQuickStatus(): HealthStatus {
    if (this.lastResults.size === 0) return "unknown";
    const results = [...this.lastResults.values()];
    const criticalResults = results.filter(r => {
      const reg = this.checks.get(r.name);
      return reg?.critical !== false;
    });
    if (criticalResults.some(r => r.status === "unhealthy")) return "unhealthy";
    if (results.some(r => r.status === "degraded" || r.status === "unhealthy")) return "degraded";
    return "healthy";
  }
}

// ─── Timeout helper ───────────────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T> | T, ms: number): Promise<T> {
  if (!(promise instanceof Promise)) {
    return Promise.resolve(promise);
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

// ─── Built-in check factories ─────────────────────────────────────────────────

/**
 * Create a simple liveness check that always returns healthy.
 */
export function livenessCheck(): HealthCheckFn {
  return async () => ({
    name: "liveness",
    status: "healthy",
    message: "Service is alive",
    duration: 0,
    timestamp: Date.now(),
  });
}

/**
 * Create a check that verifies a URL is reachable (HTTP GET).
 */
export function httpCheck(url: string, expectedStatus: number = 200): HealthCheckFn {
  return async () => {
    const start = Date.now();
    try {
      const response = await fetch(url);
      const duration = Date.now() - start;
      const ok = response.status === expectedStatus;
      return {
        name: `http:${url}`,
        status: ok ? "healthy" : "unhealthy",
        message: ok ? `HTTP ${response.status}` : `Expected ${expectedStatus}, got ${response.status}`,
        duration,
        timestamp: start,
        metadata: { statusCode: response.status, url },
      };
    } catch (err) {
      return {
        name: `http:${url}`,
        status: "unhealthy",
        message: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
        timestamp: start,
        metadata: { url },
      };
    }
  };
}

/**
 * Create a memory pressure check.
 * Fires degraded when heap usage exceeds warnPercent, unhealthy above critPercent.
 */
export function memoryCheck(warnPercent: number = 75, critPercent: number = 90): HealthCheckFn {
  return async () => {
    const mem = process.memoryUsage();
    const usedPercent = (mem.heapUsed / mem.heapTotal) * 100;
    const status: HealthStatus =
      usedPercent >= critPercent ? "unhealthy" :
      usedPercent >= warnPercent ? "degraded" : "healthy";

    return {
      name: "memory",
      status,
      message: `Heap: ${usedPercent.toFixed(1)}% (${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB)`,
      duration: 0,
      timestamp: Date.now(),
      metadata: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        usedPercent,
      },
    };
  };
}
