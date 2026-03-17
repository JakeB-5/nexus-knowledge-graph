// TimeSeries: circular buffer storage with aggregation, downsampling, and more

import type { MetricPoint, TimeSeriesData, AggregationType } from "./types.js";
import { mean, percentile } from "./statistics.js";

/** Circular buffer for memory-efficient time-series storage */
class CircularBuffer {
  private buffer: MetricPoint[];
  private head = 0; // points to oldest entry
  private tail = 0; // points to next write slot
  private _size = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(point: MetricPoint): void {
    this.buffer[this.tail] = point;
    this.tail = (this.tail + 1) % this.capacity;
    if (this._size < this.capacity) {
      this._size++;
    } else {
      // Overwrite oldest: advance head
      this.head = (this.head + 1) % this.capacity;
    }
  }

  get size(): number {
    return this._size;
  }

  /** Return all points in chronological order */
  toArray(): MetricPoint[] {
    const result: MetricPoint[] = [];
    for (let i = 0; i < this._size; i++) {
      const idx = (this.head + i) % this.capacity;
      const point = this.buffer[idx];
      if (point !== undefined) result.push(point);
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this._size = 0;
  }
}

/** Aggregate an array of numeric values using the given aggregation type */
function aggregate(values: number[], type: AggregationType): number {
  if (values.length === 0) return 0;

  switch (type) {
    case "sum":
      return values.reduce((s, v) => s + v, 0);
    case "avg":
      return mean(values);
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "count":
      return values.length;
    case "p50":
      return percentile(values, 50);
    case "p95":
      return percentile(values, 95);
    case "p99":
      return percentile(values, 99);
    default:
      return mean(values);
  }
}

export interface TimeSeriesOptions {
  /** Maximum number of data points stored (default: 10 000) */
  capacity?: number;
  /** Name of the metric for display purposes */
  name?: string;
}

export interface QueryOptions {
  startTime?: number;
  endTime?: number;
  aggregation?: AggregationType;
  /** Bucket width in milliseconds; if set, data is downsampled */
  intervalMs?: number;
  /** Label filters; only points matching ALL labels are returned */
  labels?: Record<string, string>;
}

export interface RateOptions {
  /** Window size in milliseconds (default: 60 000 = 1 minute) */
  windowMs?: number;
  /** "per_second" | "per_minute" (default: "per_second") */
  unit?: "per_second" | "per_minute";
}

export interface DownsampledPoint {
  timestamp: number;
  value: number;
  count: number;
}

export class TimeSeries {
  private buffer: CircularBuffer;
  readonly name: string;

  constructor(options: TimeSeriesOptions = {}) {
    this.buffer = new CircularBuffer(options.capacity ?? 10_000);
    this.name = options.name ?? "metric";
  }

  /** Add a single data point */
  add(point: MetricPoint): void {
    this.buffer.push(point);
  }

  /** Add multiple data points at once */
  addBatch(points: MetricPoint[]): void {
    for (const p of points) this.buffer.push(p);
  }

  /** Add a point with the current timestamp */
  record(value: number, labels?: Record<string, string>): void {
    this.buffer.push({ timestamp: Date.now(), value, labels });
  }

  /** Number of stored data points */
  get size(): number {
    return this.buffer.size;
  }

  /** Clear all stored data */
  clear(): void {
    this.buffer.clear();
  }

  /** Return all points matching optional time range and label filters */
  query(options: QueryOptions = {}): TimeSeriesData {
    const {
      startTime = 0,
      endTime = Infinity,
      labels,
      aggregation,
      intervalMs,
    } = options;

    const all = this.buffer.toArray();

    // Filter by time range and labels
    let filtered = all.filter(
      (p) => p.timestamp >= startTime && p.timestamp <= endTime
    );

    if (labels && Object.keys(labels).length > 0) {
      filtered = filtered.filter((p) => {
        if (!p.labels) return false;
        return Object.entries(labels).every(
          ([k, v]) => p.labels![k] === v
        );
      });
    }

    if (!intervalMs || !aggregation) {
      return filtered;
    }

    // Downsample into buckets
    return this.downsample(filtered, intervalMs, aggregation).map((dp) => ({
      timestamp: dp.timestamp,
      value: dp.value,
    }));
  }

  /** Downsample data into fixed-width time buckets */
  downsample(
    data: MetricPoint[],
    intervalMs: number,
    aggregation: AggregationType = "avg"
  ): DownsampledPoint[] {
    if (data.length === 0 || intervalMs <= 0) return [];

    const buckets = new Map<number, number[]>();

    for (const p of data) {
      const bucket = Math.floor(p.timestamp / intervalMs) * intervalMs;
      const existing = buckets.get(bucket);
      if (existing) {
        existing.push(p.value);
      } else {
        buckets.set(bucket, [p.value]);
      }
    }

    const result: DownsampledPoint[] = [];
    for (const [ts, values] of buckets) {
      result.push({
        timestamp: ts,
        value: aggregate(values, aggregation),
        count: values.length,
      });
    }

    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Aggregate all points in a given time range into a single value */
  aggregateRange(
    aggregation: AggregationType,
    startTime = 0,
    endTime = Infinity
  ): number {
    const points = this.query({ startTime, endTime });
    return aggregate(
      points.map((p) => p.value),
      aggregation
    );
  }

  /**
   * Rolling window calculation: for each point, aggregate the window of points
   * that fall within [point.timestamp - windowMs, point.timestamp].
   */
  rollingWindow(
    windowMs: number,
    aggregation: AggregationType = "avg",
    options: { startTime?: number; endTime?: number } = {}
  ): TimeSeriesData {
    const points = this.query(options);
    if (points.length === 0) return [];

    const result: MetricPoint[] = [];

    for (let i = 0; i < points.length; i++) {
      const current = points[i]!;
      const windowStart = current.timestamp - windowMs;
      // Collect points in window using a backwards scan
      const windowValues: number[] = [];
      for (let j = i; j >= 0; j--) {
        const p = points[j]!;
        if (p.timestamp < windowStart) break;
        windowValues.push(p.value);
      }
      result.push({
        timestamp: current.timestamp,
        value: aggregate(windowValues, aggregation),
        labels: current.labels,
      });
    }

    return result;
  }

  /**
   * Calculate the rate of change per unit time.
   * For each point, compute (value_delta / time_delta) normalized to the unit.
   */
  rate(options: RateOptions = {}): TimeSeriesData {
    const { windowMs = 60_000, unit = "per_second" } = options;
    const divisor = unit === "per_second" ? 1000 : 60_000;

    const points = this.buffer.toArray();
    if (points.length < 2) return [];

    const result: MetricPoint[] = [];

    for (let i = 1; i < points.length; i++) {
      const curr = points[i]!;
      const windowStart = curr.timestamp - windowMs;

      // Find last point before window start for delta calculation
      let baseIdx = i - 1;
      while (baseIdx > 0 && (points[baseIdx]?.timestamp ?? 0) > windowStart) {
        baseIdx--;
      }
      const base = points[baseIdx]!;

      const timeDeltaMs = curr.timestamp - base.timestamp;
      if (timeDeltaMs <= 0) continue;

      const valueDelta = curr.value - base.value;
      const rateValue = (valueDelta / timeDeltaMs) * divisor;

      result.push({ timestamp: curr.timestamp, value: rateValue });
    }

    return result;
  }

  /**
   * Fill gaps in time series data using linear interpolation.
   * expectedIntervalMs: expected time between consecutive points.
   * maxGapMultiplier: only fill gaps smaller than this multiple of expectedIntervalMs.
   */
  fillGaps(
    expectedIntervalMs: number,
    maxGapMultiplier = 5,
    options: { startTime?: number; endTime?: number } = {}
  ): TimeSeriesData {
    const points = this.query(options);
    if (points.length < 2) return points;

    const maxGapMs = expectedIntervalMs * maxGapMultiplier;
    const result: MetricPoint[] = [points[0]!];

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!;
      const curr = points[i]!;
      const gapMs = curr.timestamp - prev.timestamp;

      // Interpolate if gap is larger than expected but within maxGap
      if (gapMs > expectedIntervalMs && gapMs <= maxGapMs) {
        const steps = Math.round(gapMs / expectedIntervalMs);
        for (let s = 1; s < steps; s++) {
          const frac = s / steps;
          const ts = prev.timestamp + frac * gapMs;
          const val = prev.value + frac * (curr.value - prev.value);
          result.push({ timestamp: ts, value: val });
        }
      }

      result.push(curr);
    }

    return result;
  }

  /** Get the latest n data points */
  latest(n: number): TimeSeriesData {
    const all = this.buffer.toArray();
    return all.slice(Math.max(0, all.length - n));
  }

  /** Get all raw data points */
  getAll(): TimeSeriesData {
    return this.buffer.toArray();
  }

  /** Summary statistics for a time range */
  summary(
    startTime = 0,
    endTime = Infinity
  ): {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const points = this.query({ startTime, endTime });
    const values = points.map((p) => p.value);

    if (values.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    return {
      count: values.length,
      sum: aggregate(values, "sum"),
      min: aggregate(values, "min"),
      max: aggregate(values, "max"),
      avg: aggregate(values, "avg"),
      p50: aggregate(values, "p50"),
      p95: aggregate(values, "p95"),
      p99: aggregate(values, "p99"),
    };
  }
}
