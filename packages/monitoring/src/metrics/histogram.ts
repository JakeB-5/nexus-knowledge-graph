// Histogram metric: tracks distribution of observed values
import type { HistogramOptions, Labels, MetricFamily, MetricSample } from "../types.js";

// Default bucket boundaries (in seconds, suitable for latency)
const DEFAULT_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

function labelsToKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
}

function mergeLabels(labelNames: string[], provided: Labels): Labels {
  const merged: Labels = {};
  for (const name of labelNames) {
    merged[name] = provided[name] ?? "";
  }
  return merged;
}

interface HistogramEntry {
  count: number;
  sum: number;
  buckets: Map<number, number>; // upper bound → cumulative count
}

function createEntry(buckets: number[]): HistogramEntry {
  const bucketMap = new Map<number, number>();
  for (const b of buckets) {
    bucketMap.set(b, 0);
  }
  bucketMap.set(Infinity, 0); // +Inf bucket always present
  return { count: 0, sum: 0, buckets: bucketMap };
}

export class Histogram {
  private readonly name: string;
  private readonly help: string;
  private readonly labelNames: string[];
  private readonly buckets: number[];
  private readonly entries: Map<string, HistogramEntry> = new Map();

  constructor(options: HistogramOptions) {
    this.name = options.name;
    this.help = options.help;
    this.labelNames = options.labelNames ?? [];

    // Sort and deduplicate buckets, always include +Inf
    const raw = options.buckets ?? DEFAULT_BUCKETS;
    this.buckets = [...new Set(raw)].sort((a, b) => a - b).filter(isFinite);
  }

  /**
   * Observe a single value, placing it into appropriate buckets.
   */
  observe(value: number, labels: Labels = {}): void {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);

    let entry = this.entries.get(key);
    if (!entry) {
      entry = createEntry(this.buckets);
      this.entries.set(key, entry);
    }

    entry.count += 1;
    entry.sum += value;

    // Increment all buckets whose upper bound >= value
    for (const bound of this.buckets) {
      if (value <= bound) {
        entry.buckets.set(bound, (entry.buckets.get(bound) ?? 0) + 1);
      }
    }
    // Always increment +Inf
    entry.buckets.set(Infinity, (entry.buckets.get(Infinity) ?? 0) + 1);
  }

  /**
   * Get observation count for the given labels.
   */
  getCount(labels: Labels = {}): number {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    return this.entries.get(key)?.count ?? 0;
  }

  /**
   * Get sum of all observed values for the given labels.
   */
  getSum(labels: Labels = {}): number {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    return this.entries.get(key)?.sum ?? 0;
  }

  /**
   * Get average of observed values (sum / count).
   */
  getAverage(labels: Labels = {}): number {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    const entry = this.entries.get(key);
    if (!entry || entry.count === 0) return 0;
    return entry.sum / entry.count;
  }

  /**
   * Get count of observations in each bucket.
   * Returns a map of upper_bound → cumulative count.
   */
  getBucketCounts(labels: Labels = {}): Map<number, number> {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    const entry = this.entries.get(key);
    if (!entry) {
      const empty = new Map<number, number>();
      for (const b of this.buckets) empty.set(b, 0);
      empty.set(Infinity, 0);
      return empty;
    }
    return new Map(entry.buckets);
  }

  /**
   * Estimate a percentile value using linear interpolation over buckets.
   * p must be between 0 and 1 (e.g., 0.95 for p95).
   */
  getPercentile(p: number, labels: Labels = {}): number {
    if (p < 0 || p > 1) throw new RangeError(`Percentile must be in [0,1], got ${p}`);

    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    const entry = this.entries.get(key);
    if (!entry || entry.count === 0) return 0;

    const target = p * entry.count;
    const sortedBuckets = [...this.buckets, Infinity];
    let prev = 0;

    for (let i = 0; i < sortedBuckets.length; i++) {
      const bound = sortedBuckets[i]!;
      const cumCount = entry.buckets.get(bound) ?? 0;

      if (cumCount >= target) {
        if (i === 0) return bound === Infinity ? 0 : bound;
        const prevBound = sortedBuckets[i - 1]!;
        const prevCount = entry.buckets.get(prevBound) ?? 0;

        // Linear interpolation
        if (cumCount === prevCount) return prevBound === Infinity ? 0 : prevBound;
        const fraction = (target - prevCount) / (cumCount - prevCount);
        const lower = prevBound === Infinity ? 0 : prevBound;
        const upper = bound === Infinity ? lower * 2 || 1 : bound;
        return lower + fraction * (upper - lower);
      }
      prev = cumCount;
    }

    return prev;
  }

  /** Get p50 (median) */
  p50(labels: Labels = {}): number { return this.getPercentile(0.5, labels); }
  /** Get p90 */
  p90(labels: Labels = {}): number { return this.getPercentile(0.9, labels); }
  /** Get p95 */
  p95(labels: Labels = {}): number { return this.getPercentile(0.95, labels); }
  /** Get p99 */
  p99(labels: Labels = {}): number { return this.getPercentile(0.99, labels); }

  /**
   * Time a synchronous function and record its duration in seconds.
   */
  timeSync<T>(fn: () => T, labels: Labels = {}): T {
    const start = Date.now();
    try {
      return fn();
    } finally {
      this.observe((Date.now() - start) / 1000, labels);
    }
  }

  /**
   * Time an async function and record its duration in seconds.
   */
  async time<T>(fn: () => Promise<T>, labels: Labels = {}): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.observe((Date.now() - start) / 1000, labels);
    }
  }

  /**
   * Reset all histogram data.
   */
  reset(): void {
    this.entries.clear();
  }

  /**
   * Collect metric samples for registry export.
   */
  collect(): MetricFamily {
    const now = Date.now();
    const samples: MetricSample[] = [];

    const emitEntry = (labels: Labels, entry: HistogramEntry) => {
      // Emit bucket samples
      const sortedBounds = [...this.buckets, Infinity];
      for (const bound of sortedBounds) {
        const count = entry.buckets.get(bound) ?? 0;
        samples.push({
          name: `${this.name}_bucket`,
          type: "histogram",
          labels: { ...labels, le: bound === Infinity ? "+Inf" : String(bound) },
          value: count,
          timestamp: now,
        });
      }

      // Emit sum and count
      samples.push({
        name: `${this.name}_sum`,
        type: "histogram",
        labels,
        value: entry.sum,
        timestamp: now,
      });
      samples.push({
        name: `${this.name}_count`,
        type: "histogram",
        labels,
        value: entry.count,
        timestamp: now,
      });
    };

    if (this.entries.size === 0) {
      if (this.labelNames.length === 0) {
        emitEntry({}, createEntry(this.buckets));
      }
    } else {
      for (const [key, entry] of this.entries) {
        const labels = this.parseKey(key);
        emitEntry(labels, entry);
      }
    }

    return {
      name: this.name,
      help: this.help,
      type: "histogram",
      samples,
    };
  }

  getName(): string { return this.name; }
  getHelp(): string { return this.help; }
  getLabelNames(): string[] { return [...this.labelNames]; }
  getBuckets(): number[] { return [...this.buckets]; }

  private parseKey(key: string): Labels {
    if (!key) return {};
    const labels: Labels = {};
    const parts = key.split(",");
    for (const part of parts) {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) continue;
      const name = part.slice(0, eqIdx);
      const value = part.slice(eqIdx + 1).replace(/^"|"$/g, "");
      labels[name] = value;
    }
    return labels;
  }
}
