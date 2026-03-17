// HealthChecker: periodic polling, aggregate status, history tracking

import type { HealthCheckConfig } from './types.js';

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded' | 'unknown';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  durationMs: number;
  checkedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface AggregateHealth {
  status: HealthStatus;
  checks: Record<string, HealthCheckResult>;
  timestamp: Date;
}

export type CustomHealthFn = () => Promise<{
  healthy: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}>;

interface RegisteredCheck {
  name: string;
  type: 'liveness' | 'readiness' | 'dependency';
  config?: HealthCheckConfig;
  customFn?: CustomHealthFn;
  history: HealthCheckResult[];
  maxHistory: number;
  intervalHandle?: ReturnType<typeof setInterval>;
}

export class HealthChecker {
  private checks: Map<string, RegisteredCheck> = new Map();
  private latestResults: Map<string, HealthCheckResult> = new Map();

  /**
   * Register an HTTP-based health check endpoint.
   */
  register(
    name: string,
    config: HealthCheckConfig,
    type: 'liveness' | 'readiness' | 'dependency' = 'readiness',
    maxHistory = 50
  ): void {
    this.checks.set(name, { name, type, config, history: [], maxHistory });
  }

  /**
   * Register a custom function-based health check.
   */
  registerCustom(
    name: string,
    fn: CustomHealthFn,
    type: 'liveness' | 'readiness' | 'dependency' = 'readiness',
    maxHistory = 50
  ): void {
    this.checks.set(name, { name, type, customFn: fn, history: [], maxHistory });
  }

  /**
   * Start periodic polling for all registered checks.
   */
  startPolling(): void {
    this.checks.forEach((check) => {
      if (check.intervalHandle) return;

      const intervalMs = check.config?.intervalMs ?? 30_000;
      // Run immediately, then on interval
      void this.runCheck(check.name);
      check.intervalHandle = setInterval(() => {
        void this.runCheck(check.name);
      }, intervalMs);
    });
  }

  /**
   * Stop all polling intervals.
   */
  stopPolling(): void {
    this.checks.forEach((check) => {
      if (check.intervalHandle) {
        clearInterval(check.intervalHandle);
        check.intervalHandle = undefined;
      }
    });
  }

  /**
   * Run a single check by name and return the result.
   */
  async runCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) throw new Error(`Health check "${name}" not registered`);

    const start = Date.now();
    let result: HealthCheckResult;

    try {
      if (check.customFn) {
        const outcome = await this.runWithTimeout(
          check.customFn,
          check.config?.timeoutMs ?? 5_000
        );
        result = {
          name,
          status: outcome.healthy ? 'healthy' : 'unhealthy',
          message: outcome.message,
          durationMs: Date.now() - start,
          checkedAt: new Date(),
          metadata: outcome.metadata,
        };
      } else if (check.config) {
        result = await this.runHttpCheck(check, start);
      } else {
        result = {
          name,
          status: 'unknown',
          message: 'No check configuration',
          durationMs: 0,
          checkedAt: new Date(),
        };
      }
    } catch (err) {
      result = {
        name,
        status: 'unhealthy',
        message: err instanceof Error ? err.message : 'Unknown error',
        durationMs: Date.now() - start,
        checkedAt: new Date(),
      };
    }

    // Record history
    check.history.push(result);
    if (check.history.length > check.maxHistory) {
      check.history.shift();
    }
    this.latestResults.set(name, result);

    return result;
  }

  /**
   * Run all checks concurrently and return aggregate status.
   */
  async checkAll(): Promise<AggregateHealth> {
    const names = Array.from(this.checks.keys());
    await Promise.all(names.map((n) => this.runCheck(n)));
    return this.aggregate();
  }

  /**
   * Return the aggregated health status based on latest results.
   */
  aggregate(): AggregateHealth {
    const checks: Record<string, HealthCheckResult> = {};
    this.latestResults.forEach((result, name) => {
      checks[name] = result;
    });

    const statuses = Object.values(checks).map((r) => r.status);
    let status: HealthStatus = 'healthy';

    if (statuses.includes('unhealthy')) {
      status = 'unhealthy';
    } else if (statuses.includes('degraded') || statuses.includes('unknown')) {
      status = 'degraded';
    }

    return { status, checks, timestamp: new Date() };
  }

  /**
   * Get liveness check results only.
   */
  async liveness(): Promise<AggregateHealth> {
    const liveness = Array.from(this.checks.values()).filter(
      (c) => c.type === 'liveness'
    );
    await Promise.all(liveness.map((c) => this.runCheck(c.name)));

    const checks: Record<string, HealthCheckResult> = {};
    liveness.forEach((c) => {
      const r = this.latestResults.get(c.name);
      if (r) checks[c.name] = r;
    });

    const unhealthy = Object.values(checks).some((r) => r.status === 'unhealthy');
    return {
      status: unhealthy ? 'unhealthy' : 'healthy',
      checks,
      timestamp: new Date(),
    };
  }

  /**
   * Get readiness check results only.
   */
  async readiness(): Promise<AggregateHealth> {
    const readiness = Array.from(this.checks.values()).filter(
      (c) => c.type === 'readiness'
    );
    await Promise.all(readiness.map((c) => this.runCheck(c.name)));

    const checks: Record<string, HealthCheckResult> = {};
    readiness.forEach((c) => {
      const r = this.latestResults.get(c.name);
      if (r) checks[c.name] = r;
    });

    const unhealthy = Object.values(checks).some((r) => r.status === 'unhealthy');
    return {
      status: unhealthy ? 'unhealthy' : 'healthy',
      checks,
      timestamp: new Date(),
    };
  }

  /**
   * Return check history for a given check name.
   */
  getHistory(name: string): HealthCheckResult[] {
    return this.checks.get(name)?.history ?? [];
  }

  /**
   * Remove a registered check.
   */
  unregister(name: string): void {
    const check = this.checks.get(name);
    if (check?.intervalHandle) clearInterval(check.intervalHandle);
    this.checks.delete(name);
    this.latestResults.delete(name);
  }

  // ── Internals ──────────────────────────────────────────────────

  private async runHttpCheck(check: RegisteredCheck, start: number): Promise<HealthCheckResult> {
    const cfg = check.config!;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      const response = await fetch(cfg.path, { signal: controller.signal });
      clearTimeout(timer);

      const expectedStatus = cfg.expectedStatus ?? 200;
      const ok = response.status === expectedStatus;

      let bodyMatch = true;
      if (cfg.expectedBody) {
        const text = await response.text();
        bodyMatch = text.includes(cfg.expectedBody);
      }

      const healthy = ok && bodyMatch;
      return {
        name: check.name,
        status: healthy ? 'healthy' : 'unhealthy',
        message: healthy ? undefined : `Unexpected status ${response.status}`,
        durationMs: Date.now() - start,
        checkedAt: new Date(),
      };
    } catch (err) {
      clearTimeout(timer);
      const error = err as Error;
      return {
        name: check.name,
        status: 'unhealthy',
        message: error.name === 'AbortError' ? 'Health check timed out' : error.message,
        durationMs: Date.now() - start,
        checkedAt: new Date(),
      };
    }
  }

  private async runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Health check timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
      fn().then(
        (result) => { clearTimeout(timer); resolve(result); },
        (err) => { clearTimeout(timer); reject(err as Error); }
      );
    });
  }
}
