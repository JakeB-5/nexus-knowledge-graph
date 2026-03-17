// MetricRegistry: central registry for all metrics, with export capabilities
import type { MetricFamily, MetricSample } from "../types.js";
import { Counter } from "./counter.js";
import { Gauge } from "./gauge.js";
import { Histogram } from "./histogram.js";

type Metric = Counter | Gauge | Histogram;

interface CollectableMetric {
  collect(): MetricFamily;
  getName(): string;
  getHelp(): string;
}

interface DefaultMetrics {
  processUptimeSeconds: Gauge;
  processMemoryHeapUsedBytes: Gauge;
  processMemoryHeapTotalBytes: Gauge;
  processMemoryRssBytes: Gauge;
  processMemoryExternalBytes: Gauge;
  nodejsEventLoopLagSeconds: Gauge;
  processOpenFds: Gauge;
}

export class MetricRegistry {
  private static instance: MetricRegistry | null = null;

  private readonly metrics: Map<string, CollectableMetric> = new Map();
  private readonly families: Map<string, string[]> = new Map(); // family name → metric names
  private defaultMetricsRegistered = false;
  private defaultMetricsInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  /**
   * Get the singleton registry instance.
   */
  static getInstance(): MetricRegistry {
    if (!MetricRegistry.instance) {
      MetricRegistry.instance = new MetricRegistry();
    }
    return MetricRegistry.instance;
  }

  /**
   * Reset the singleton (useful for testing).
   */
  static resetInstance(): void {
    if (MetricRegistry.instance) {
      MetricRegistry.instance.clear();
      MetricRegistry.instance = null;
    }
  }

  /**
   * Register a metric. Throws if a metric with the same name already exists.
   */
  register(metric: CollectableMetric): void {
    const name = metric.getName();
    if (this.metrics.has(name)) {
      throw new Error(`Metric "${name}" is already registered`);
    }
    this.metrics.set(name, metric);
  }

  /**
   * Register a metric, replacing any existing metric with the same name.
   */
  registerOrReplace(metric: CollectableMetric): void {
    this.metrics.set(metric.getName(), metric);
  }

  /**
   * Get a registered metric by name.
   */
  get(name: string): CollectableMetric | undefined {
    return this.metrics.get(name);
  }

  /**
   * Check if a metric is registered.
   */
  has(name: string): boolean {
    return this.metrics.has(name);
  }

  /**
   * Unregister a metric by name.
   */
  unregister(name: string): boolean {
    return this.metrics.delete(name);
  }

  /**
   * Collect all metric families.
   */
  collect(): MetricFamily[] {
    const families: MetricFamily[] = [];
    for (const metric of this.metrics.values()) {
      families.push(metric.collect());
    }
    return families;
  }

  /**
   * Get all registered metric names.
   */
  getNames(): string[] {
    return [...this.metrics.keys()];
  }

  /**
   * Group metrics into a named family for logical organization.
   */
  createFamily(familyName: string, metricNames: string[]): void {
    this.families.set(familyName, metricNames);
  }

  /**
   * Get all metrics belonging to a family.
   */
  getFamily(familyName: string): CollectableMetric[] {
    const names = this.families.get(familyName) ?? [];
    return names.flatMap(n => {
      const m = this.metrics.get(n);
      return m ? [m] : [];
    });
  }

  /**
   * Collect metrics for a specific family.
   */
  collectFamily(familyName: string): MetricFamily[] {
    return this.getFamily(familyName).map(m => m.collect());
  }

  /**
   * Clear all registered metrics and families.
   */
  clear(): void {
    this.metrics.clear();
    this.families.clear();
    if (this.defaultMetricsInterval) {
      clearInterval(this.defaultMetricsInterval);
      this.defaultMetricsInterval = null;
    }
    this.defaultMetricsRegistered = false;
  }

  /**
   * Register and start collecting default Node.js process metrics.
   * intervalMs controls how often the metrics are refreshed.
   */
  registerDefaultMetrics(intervalMs: number = 10_000): DefaultMetrics {
    if (this.defaultMetricsRegistered) {
      throw new Error("Default metrics already registered");
    }
    this.defaultMetricsRegistered = true;

    const processUptimeSeconds = new Gauge({
      name: "process_uptime_seconds",
      help: "Process uptime in seconds",
    });

    const processMemoryHeapUsedBytes = new Gauge({
      name: "process_memory_heap_used_bytes",
      help: "V8 heap used bytes",
    });

    const processMemoryHeapTotalBytes = new Gauge({
      name: "process_memory_heap_total_bytes",
      help: "V8 heap total bytes",
    });

    const processMemoryRssBytes = new Gauge({
      name: "process_memory_rss_bytes",
      help: "Resident set size bytes",
    });

    const processMemoryExternalBytes = new Gauge({
      name: "process_memory_external_bytes",
      help: "Memory used by C++ objects bound to V8 objects",
    });

    const nodejsEventLoopLagSeconds = new Gauge({
      name: "nodejs_eventloop_lag_seconds",
      help: "Lag of event loop in seconds",
    });

    const processOpenFds = new Gauge({
      name: "process_open_fds",
      help: "Number of open file descriptors",
    });

    this.register(processUptimeSeconds);
    this.register(processMemoryHeapUsedBytes);
    this.register(processMemoryHeapTotalBytes);
    this.register(processMemoryRssBytes);
    this.register(processMemoryExternalBytes);
    this.register(nodejsEventLoopLagSeconds);
    this.register(processOpenFds);

    this.createFamily("process", [
      "process_uptime_seconds",
      "process_memory_heap_used_bytes",
      "process_memory_heap_total_bytes",
      "process_memory_rss_bytes",
      "process_memory_external_bytes",
      "nodejs_eventloop_lag_seconds",
      "process_open_fds",
    ]);

    const collectDefaults = () => {
      processUptimeSeconds.set(process.uptime());

      const mem = process.memoryUsage();
      processMemoryHeapUsedBytes.set(mem.heapUsed);
      processMemoryHeapTotalBytes.set(mem.heapTotal);
      processMemoryRssBytes.set(mem.rss);
      processMemoryExternalBytes.set(mem.external);
    };

    // Measure event loop lag
    const measureEventLoopLag = () => {
      const start = Date.now();
      setImmediate(() => {
        const lag = (Date.now() - start) / 1000;
        nodejsEventLoopLagSeconds.set(lag);
      });
    };

    // Collect immediately
    collectDefaults();
    measureEventLoopLag();

    // Then on interval
    this.defaultMetricsInterval = setInterval(() => {
      collectDefaults();
      measureEventLoopLag();
    }, intervalMs);

    // Don't prevent process exit
    if (this.defaultMetricsInterval.unref) {
      this.defaultMetricsInterval.unref();
    }

    return {
      processUptimeSeconds,
      processMemoryHeapUsedBytes,
      processMemoryHeapTotalBytes,
      processMemoryRssBytes,
      processMemoryExternalBytes,
      nodejsEventLoopLagSeconds,
      processOpenFds,
    };
  }

  /**
   * Export all metrics in Prometheus text exposition format.
   */
  exportPrometheus(): string {
    const families = this.collect();
    const lines: string[] = [];

    for (const family of families) {
      if (family.samples.length === 0) continue;

      lines.push(`# HELP ${family.name} ${family.help}`);
      lines.push(`# TYPE ${family.name} ${family.type}`);

      for (const sample of family.samples) {
        const labelStr = formatLabels(sample.labels);
        const name = sample.name;
        const value = formatValue(sample.value);
        const ts = sample.timestamp;
        lines.push(`${name}${labelStr} ${value} ${ts}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Export all metrics as a JSON structure.
   */
  exportJSON(): MetricExportJSON {
    const families = this.collect();
    const timestamp = Date.now();

    return {
      timestamp,
      metrics: families.map(family => ({
        name: family.name,
        help: family.help,
        type: family.type,
        samples: family.samples.map(s => ({
          name: s.name,
          labels: s.labels,
          value: s.value,
          timestamp: s.timestamp,
        })),
      })),
    };
  }

  /**
   * Export summary statistics as a flat object (for dashboards).
   */
  exportSummary(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const family of this.collect()) {
      for (const sample of family.samples) {
        const labelStr = Object.entries(sample.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",");
        const key = labelStr ? `${sample.name}{${labelStr}}` : sample.name;
        result[key] = sample.value;
      }
    }
    return result;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => `${k}="${escapePrometheusLabel(v)}"`);
  return `{${parts.join(",")}}`;
}

function formatValue(value: number): string {
  if (!isFinite(value)) {
    return value > 0 ? "+Inf" : value < 0 ? "-Inf" : "NaN";
  }
  return String(value);
}

function escapePrometheusLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// ─── JSON Export Shape ────────────────────────────────────────────────────────

export interface MetricExportJSON {
  timestamp: number;
  metrics: Array<{
    name: string;
    help: string;
    type: string;
    samples: Array<{
      name: string;
      labels: Record<string, string>;
      value: number;
      timestamp: number;
    }>;
  }>;
}

// ─── Convenience factory functions ───────────────────────────────────────────

export function createCounter(
  registry: MetricRegistry,
  name: string,
  help: string,
  labelNames?: string[],
): Counter {
  const counter = new Counter({ name, help, labelNames });
  registry.register(counter);
  return counter;
}

export function createGauge(
  registry: MetricRegistry,
  name: string,
  help: string,
  labelNames?: string[],
): Gauge {
  const gauge = new Gauge({ name, help, labelNames });
  registry.register(gauge);
  return gauge;
}

export function createHistogram(
  registry: MetricRegistry,
  name: string,
  help: string,
  options?: { labelNames?: string[]; buckets?: number[] },
): Histogram {
  const histogram = new Histogram({ name, help, ...options });
  registry.register(histogram);
  return histogram;
}

// Re-export metric types for convenience
export { Counter, Gauge, Histogram };
export type { Metric, CollectableMetric, MetricSample };
