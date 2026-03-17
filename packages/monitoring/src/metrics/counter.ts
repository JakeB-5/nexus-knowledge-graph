// Counter metric: monotonically increasing value, never decreases
import type { CounterOptions, Labels, MetricFamily, MetricSample } from "../types.js";

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

export class Counter {
  private readonly name: string;
  private readonly help: string;
  private readonly labelNames: string[];
  private readonly values: Map<string, number> = new Map();

  constructor(options: CounterOptions) {
    this.name = options.name;
    this.help = options.help;
    this.labelNames = options.labelNames ?? [];
  }

  /**
   * Increment the counter by the given value (default 1).
   * Value must be non-negative.
   */
  increment(value: number = 1, labels: Labels = {}): void {
    if (value < 0) {
      throw new RangeError(`Counter increment value must be non-negative, got ${value}`);
    }

    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + value);
  }

  /**
   * Get current counter value for the given labels.
   */
  get(labels: Labels = {}): number {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    return this.values.get(key) ?? 0;
  }

  /**
   * Reset all counter values to zero.
   * Use sparingly — counters are intended to be monotonic.
   */
  reset(): void {
    this.values.clear();
  }

  /**
   * Reset the counter for specific labels to zero.
   */
  resetLabels(labels: Labels = {}): void {
    const resolvedLabels = mergeLabels(this.labelNames, labels);
    const key = labelsToKey(resolvedLabels);
    this.values.set(key, 0);
  }

  /**
   * Collect metric samples for registry export.
   */
  collect(): MetricFamily {
    const now = Date.now();
    const samples: MetricSample[] = [];

    if (this.values.size === 0) {
      // Emit a zero sample for no-label counters
      if (this.labelNames.length === 0) {
        samples.push({
          name: `${this.name}_total`,
          type: "counter",
          labels: {},
          value: 0,
          timestamp: now,
          help: this.help,
        });
      }
    } else {
      for (const [key, value] of this.values) {
        const labels = this.parseKey(key);
        samples.push({
          name: `${this.name}_total`,
          type: "counter",
          labels,
          value,
          timestamp: now,
          help: this.help,
        });
      }
    }

    return {
      name: this.name,
      help: this.help,
      type: "counter",
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

  /**
   * Returns all label-value pairs currently tracked.
   */
  getAllValues(): Map<Labels, number> {
    const result = new Map<Labels, number>();
    for (const [key, value] of this.values) {
      result.set(this.parseKey(key), value);
    }
    return result;
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
