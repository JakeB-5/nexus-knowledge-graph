// MetricCollector: Counter, Gauge, Histogram metric types with labels and time-series export

import { TimeSeries } from "../time-series.js";
import type { MetricPoint } from "../types.js";

export type MetricType = "counter" | "gauge" | "histogram";

export interface MetricLabels {
  [key: string]: string;
}

export interface MetricDescriptor {
  name: string;
  type: MetricType;
  description?: string;
  unit?: string;
}

export interface HistogramBuckets {
  /** Upper bounds for histogram buckets */
  boundaries: number[];
  /** Count of observations in each bucket (cumulative) */
  counts: number[];
  /** Total sum of observed values */
  sum: number;
  /** Total count of observations */
  count: number;
}

export interface MetricSnapshot {
  name: string;
  type: MetricType;
  timestamp: number;
  labels: MetricLabels;
  value: number;
  histogram?: HistogramBuckets;
}

// ─── Individual metric classes ────────────────────────────────────────────────

export class Counter {
  private _value = 0;
  readonly descriptor: MetricDescriptor;
  readonly labels: MetricLabels;

  constructor(descriptor: MetricDescriptor, labels: MetricLabels = {}) {
    this.descriptor = descriptor;
    this.labels = labels;
  }

  /** Increment the counter by delta (must be >= 0) */
  inc(delta = 1): void {
    if (delta < 0) throw new Error("Counter delta must be non-negative");
    this._value += delta;
  }

  get value(): number {
    return this._value;
  }

  reset(): void {
    this._value = 0;
  }

  snapshot(timestamp = Date.now()): MetricSnapshot {
    return {
      name: this.descriptor.name,
      type: "counter",
      timestamp,
      labels: this.labels,
      value: this._value,
    };
  }
}

export class Gauge {
  private _value = 0;
  readonly descriptor: MetricDescriptor;
  readonly labels: MetricLabels;

  constructor(descriptor: MetricDescriptor, labels: MetricLabels = {}) {
    this.descriptor = descriptor;
    this.labels = labels;
  }

  set(value: number): void {
    this._value = value;
  }

  inc(delta = 1): void {
    this._value += delta;
  }

  dec(delta = 1): void {
    this._value -= delta;
  }

  get value(): number {
    return this._value;
  }

  snapshot(timestamp = Date.now()): MetricSnapshot {
    return {
      name: this.descriptor.name,
      type: "gauge",
      timestamp,
      labels: this.labels,
      value: this._value,
    };
  }
}

export class Histogram {
  private readonly boundaries: number[];
  private counts: number[];
  private _sum = 0;
  private _count = 0;
  readonly descriptor: MetricDescriptor;
  readonly labels: MetricLabels;

  constructor(
    descriptor: MetricDescriptor,
    boundaries: number[],
    labels: MetricLabels = {}
  ) {
    this.descriptor = descriptor;
    // Sort boundaries ascending and deduplicate
    this.boundaries = [...new Set(boundaries)].sort((a, b) => a - b);
    // One bucket per boundary + 1 overflow bucket
    this.counts = new Array(this.boundaries.length + 1).fill(0) as number[];
    this.labels = labels;
  }

  /** Record a single observation */
  observe(value: number): void {
    this._sum += value;
    this._count++;

    // Find the first boundary >= value (cumulative histogram)
    let bucketIdx = this.boundaries.length; // overflow bucket
    for (let i = 0; i < this.boundaries.length; i++) {
      if (value <= (this.boundaries[i] ?? Infinity)) {
        bucketIdx = i;
        break;
      }
    }

    // Increment all buckets from bucketIdx onwards (cumulative)
    for (let i = bucketIdx; i < this.counts.length; i++) {
      this.counts[i] = (this.counts[i] ?? 0) + 1;
    }
  }

  get sum(): number {
    return this._sum;
  }

  get count(): number {
    return this._count;
  }

  get avg(): number {
    return this._count === 0 ? 0 : this._sum / this._count;
  }

  /** Estimate a percentile from the histogram buckets */
  estimatePercentile(p: number): number {
    if (this._count === 0) return 0;
    const target = (p / 100) * this._count;

    for (let i = 0; i < this.boundaries.length; i++) {
      const cumCount = this.counts[i] ?? 0;
      if (cumCount >= target) {
        // Interpolate within this bucket
        const prevCount = i > 0 ? (this.counts[i - 1] ?? 0) : 0;
        const prevBound = i > 0 ? (this.boundaries[i - 1] ?? 0) : 0;
        const bound = this.boundaries[i] ?? 0;

        const fraction =
          cumCount === prevCount
            ? 0
            : (target - prevCount) / (cumCount - prevCount);
        return prevBound + fraction * (bound - prevBound);
      }
    }

    // In overflow bucket — return last boundary
    return this.boundaries[this.boundaries.length - 1] ?? 0;
  }

  getBuckets(): HistogramBuckets {
    return {
      boundaries: [...this.boundaries],
      counts: [...this.counts],
      sum: this._sum,
      count: this._count,
    };
  }

  reset(): void {
    this.counts = new Array(this.boundaries.length + 1).fill(0) as number[];
    this._sum = 0;
    this._count = 0;
  }

  snapshot(timestamp = Date.now()): MetricSnapshot {
    return {
      name: this.descriptor.name,
      type: "histogram",
      timestamp,
      labels: this.labels,
      value: this.avg,
      histogram: this.getBuckets(),
    };
  }
}

// ─── MetricCollector ──────────────────────────────────────────────────────────

export interface MetricCollectorOptions {
  /** Snapshot interval in ms (0 = manual only; default: 10 000) */
  snapshotIntervalMs?: number;
  /** Max snapshots per metric stored in history (default: 1440 = 24h at 1min) */
  maxHistory?: number;
}

export class MetricCollector {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();

  /** Historical snapshots per metric name */
  private history: Map<string, MetricSnapshot[]> = new Map();
  private readonly maxHistory: number;

  private snapshotTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: MetricCollectorOptions = {}) {
    this.maxHistory = options.maxHistory ?? 1440;
    const intervalMs = options.snapshotIntervalMs ?? 10_000;

    if (intervalMs > 0) {
      this.snapshotTimer = setInterval(() => {
        this.takeSnapshot();
      }, intervalMs);
    }
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  registerCounter(
    name: string,
    labels: MetricLabels = {},
    descriptor?: Partial<MetricDescriptor>
  ): Counter {
    const key = metricKey(name, labels);
    let counter = this.counters.get(key);
    if (!counter) {
      counter = new Counter(
        { name, type: "counter", ...descriptor },
        labels
      );
      this.counters.set(key, counter);
    }
    return counter;
  }

  registerGauge(
    name: string,
    labels: MetricLabels = {},
    descriptor?: Partial<MetricDescriptor>
  ): Gauge {
    const key = metricKey(name, labels);
    let gauge = this.gauges.get(key);
    if (!gauge) {
      gauge = new Gauge(
        { name, type: "gauge", ...descriptor },
        labels
      );
      this.gauges.set(key, gauge);
    }
    return gauge;
  }

  registerHistogram(
    name: string,
    boundaries: number[],
    labels: MetricLabels = {},
    descriptor?: Partial<MetricDescriptor>
  ): Histogram {
    const key = metricKey(name, labels);
    let hist = this.histograms.get(key);
    if (!hist) {
      hist = new Histogram(
        { name, type: "histogram", ...descriptor },
        boundaries,
        labels
      );
      this.histograms.set(key, hist);
    }
    return hist;
  }

  // ─── Convenience helpers ──────────────────────────────────────────────────

  increment(name: string, delta = 1, labels: MetricLabels = {}): void {
    this.registerCounter(name, labels).inc(delta);
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    this.registerGauge(name, labels).set(value);
  }

  observeHistogram(
    name: string,
    value: number,
    boundaries: number[],
    labels: MetricLabels = {}
  ): void {
    this.registerHistogram(name, boundaries, labels).observe(value);
  }

  // ─── Snapshotting ─────────────────────────────────────────────────────────

  /** Take a snapshot of all metrics and store in history */
  takeSnapshot(timestamp = Date.now()): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];

    for (const counter of this.counters.values()) {
      snapshots.push(counter.snapshot(timestamp));
    }
    for (const gauge of this.gauges.values()) {
      snapshots.push(gauge.snapshot(timestamp));
    }
    for (const hist of this.histograms.values()) {
      snapshots.push(hist.snapshot(timestamp));
    }

    // Store in history
    for (const snap of snapshots) {
      const hist = this.history.get(snap.name) ?? [];
      hist.push(snap);
      if (hist.length > this.maxHistory) {
        hist.splice(0, hist.length - this.maxHistory);
      }
      this.history.set(snap.name, hist);
    }

    return snapshots;
  }

  /** Export a metric's history as a TimeSeries */
  exportToTimeSeries(metricName: string): TimeSeries {
    const ts = new TimeSeries({ name: metricName });
    const snapshots = this.history.get(metricName) ?? [];

    const points: MetricPoint[] = snapshots.map((s) => ({
      timestamp: s.timestamp,
      value: s.value,
      labels: s.labels,
    }));

    ts.addBatch(points);
    return ts;
  }

  /** Get all current snapshots (not stored in history) */
  currentSnapshot(timestamp = Date.now()): MetricSnapshot[] {
    return this.takeSnapshot(timestamp);
  }

  /** Get snapshot history for a metric */
  getHistory(metricName: string): MetricSnapshot[] {
    return [...(this.history.get(metricName) ?? [])];
  }

  /** All registered metric names */
  metricNames(): string[] {
    const names = new Set<string>();
    for (const c of this.counters.values()) names.add(c.descriptor.name);
    for (const g of this.gauges.values()) names.add(g.descriptor.name);
    for (const h of this.histograms.values()) names.add(h.descriptor.name);
    return [...names];
  }

  /** Stop the periodic snapshot timer */
  stop(): void {
    if (this.snapshotTimer !== null) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  reset(): void {
    for (const c of this.counters.values()) c.reset();
    for (const h of this.histograms.values()) h.reset();
    this.history.clear();
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function metricKey(name: string, labels: MetricLabels): string {
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return labelStr ? `${name}{${labelStr}}` : name;
}
