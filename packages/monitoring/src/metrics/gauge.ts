// Gauge metric: can go up and down, represents current state
import type { GaugeOptions, Labels, MetricFamily, MetricSample } from "../types.js";

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

interface GaugeEntry {
  value: number;
  min: number;
  max: number;
}

export class Gauge {
  private readonly name: string;
  private readonly help: string;
  private readonly labelNames: string[];
  private readonly trackMinMax: boolean;
  private readonly entries: Map<string, GaugeEntry> = new Map();

  constructor(options: GaugeOptions) {
    this.name = options.name;
    this.help = options.help;
    this.labelNames = options.labelNames ?? [];
    this.trackMinMax = options.trackMinMax ?? false;
  }

  /**
   * Set the gauge to an absolute value.
   */
  set(value: number, labels: Labels = {}): void {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    const existing = this.entries.get(key);

    if (existing) {
      existing.value = value;
      if (this.trackMinMax) {
        if (value < existing.min) existing.min = value;
        if (value > existing.max) existing.max = value;
      }
    } else {
      this.entries.set(key, { value, min: value, max: value });
    }
  }

  /**
   * Increment the gauge by delta (default 1).
   */
  increment(delta: number = 1, labels: Labels = {}): void {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    const existing = this.entries.get(key);

    if (existing) {
      existing.value += delta;
      if (this.trackMinMax) {
        if (existing.value < existing.min) existing.min = existing.value;
        if (existing.value > existing.max) existing.max = existing.value;
      }
    } else {
      this.entries.set(key, { value: delta, min: delta, max: delta });
    }
  }

  /**
   * Decrement the gauge by delta (default 1).
   */
  decrement(delta: number = 1, labels: Labels = {}): void {
    this.increment(-delta, labels);
  }

  /**
   * Get current gauge value.
   */
  get(labels: Labels = {}): number {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    return this.entries.get(key)?.value ?? 0;
  }

  /**
   * Get minimum observed value (requires trackMinMax: true).
   */
  getMin(labels: Labels = {}): number {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    return this.entries.get(key)?.min ?? 0;
  }

  /**
   * Get maximum observed value (requires trackMinMax: true).
   */
  getMax(labels: Labels = {}): number {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    return this.entries.get(key)?.max ?? 0;
  }

  /**
   * Set gauge to the elapsed time (milliseconds) since startTime.
   * Useful for tracking duration of operations.
   */
  setToElapsedTime(startTime: number, labels: Labels = {}): void {
    const elapsed = Date.now() - startTime;
    this.set(elapsed, labels);
  }

  /**
   * Set gauge to current Unix timestamp in seconds.
   */
  setToCurrentTime(labels: Labels = {}): void {
    this.set(Date.now() / 1000, labels);
  }

  /**
   * Execute a function and set the gauge to its execution duration.
   * Returns the function's result.
   */
  async time<T>(fn: () => Promise<T>, labels: Labels = {}): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.setToElapsedTime(start, labels);
    }
  }

  /**
   * Reset all gauge values.
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

    if (this.entries.size === 0) {
      if (this.labelNames.length === 0) {
        samples.push({
          name: this.name,
          type: "gauge",
          labels: {},
          value: 0,
          timestamp: now,
          help: this.help,
        });
      }
    } else {
      for (const [key, entry] of this.entries) {
        const labels = this.parseKey(key);
        samples.push({
          name: this.name,
          type: "gauge",
          labels,
          value: entry.value,
          timestamp: now,
          help: this.help,
        });

        if (this.trackMinMax) {
          samples.push({
            name: `${this.name}_min`,
            type: "gauge",
            labels,
            value: entry.min,
            timestamp: now,
          });
          samples.push({
            name: `${this.name}_max`,
            type: "gauge",
            labels,
            value: entry.max,
            timestamp: now,
          });
        }
      }
    }

    return {
      name: this.name,
      help: this.help,
      type: "gauge",
      samples,
    };
  }

  getName(): string {
    return this.name;
  }

  getHelp(): string {
    return this.help;
  }

  getLabelNames(): string[] {
    return [...this.labelNames];
  }

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
