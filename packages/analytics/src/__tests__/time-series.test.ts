import { describe, it, expect, beforeEach } from "vitest";
import { TimeSeries } from "../time-series.js";
import type { MetricPoint } from "../types.js";

function pts(pairs: Array<[number, number]>): MetricPoint[] {
  return pairs.map(([timestamp, value]) => ({ timestamp, value }));
}

describe("TimeSeries", () => {
  let ts: TimeSeries;

  beforeEach(() => {
    ts = new TimeSeries({ name: "test", capacity: 100 });
  });

  // ─── Basic add/query ────────────────────────────────────────────────────

  it("starts empty", () => {
    expect(ts.size).toBe(0);
    expect(ts.getAll()).toEqual([]);
  });

  it("adds a single point", () => {
    ts.add({ timestamp: 1000, value: 42 });
    expect(ts.size).toBe(1);
    expect(ts.getAll()[0]?.value).toBe(42);
  });

  it("adds a batch of points", () => {
    ts.addBatch(pts([[1000, 1], [2000, 2], [3000, 3]]));
    expect(ts.size).toBe(3);
  });

  it("returns points in chronological order after batch", () => {
    ts.addBatch(pts([[3000, 3], [1000, 1], [2000, 2]]));
    // CircularBuffer preserves insertion order, not sorted
    const all = ts.getAll();
    expect(all).toHaveLength(3);
  });

  // ─── Circular buffer eviction ───────────────────────────────────────────

  it("evicts oldest when capacity exceeded", () => {
    const small = new TimeSeries({ capacity: 5 });
    for (let i = 0; i < 8; i++) {
      small.add({ timestamp: i * 1000, value: i });
    }
    expect(small.size).toBe(5);
    const all = small.getAll();
    // Oldest 3 evicted, values 3..7 remain
    expect(all[0]?.value).toBe(3);
    expect(all[4]?.value).toBe(7);
  });

  // ─── Query filtering ────────────────────────────────────────────────────

  it("filters by time range", () => {
    ts.addBatch(pts([[1000, 10], [2000, 20], [3000, 30], [4000, 40]]));
    const result = ts.query({ startTime: 2000, endTime: 3000 });
    expect(result).toHaveLength(2);
    expect(result[0]?.value).toBe(20);
    expect(result[1]?.value).toBe(30);
  });

  it("filters by labels", () => {
    ts.add({ timestamp: 1000, value: 1, labels: { region: "us" } });
    ts.add({ timestamp: 2000, value: 2, labels: { region: "eu" } });
    ts.add({ timestamp: 3000, value: 3, labels: { region: "us" } });

    const usPoints = ts.query({ labels: { region: "us" } });
    expect(usPoints).toHaveLength(2);
    expect(usPoints.every((p) => p.labels?.["region"] === "us")).toBe(true);
  });

  // ─── Aggregation ────────────────────────────────────────────────────────

  it("aggregates sum correctly", () => {
    ts.addBatch(pts([[1000, 10], [2000, 20], [3000, 30]]));
    const sum = ts.aggregateRange("sum");
    expect(sum).toBe(60);
  });

  it("aggregates avg correctly", () => {
    ts.addBatch(pts([[1000, 10], [2000, 20], [3000, 30]]));
    const avg = ts.aggregateRange("avg");
    expect(avg).toBeCloseTo(20, 5);
  });

  it("aggregates min/max correctly", () => {
    ts.addBatch(pts([[1000, 5], [2000, 15], [3000, 10]]));
    expect(ts.aggregateRange("min")).toBe(5);
    expect(ts.aggregateRange("max")).toBe(15);
  });

  it("aggregates count correctly", () => {
    ts.addBatch(pts([[1000, 1], [2000, 2], [3000, 3]]));
    expect(ts.aggregateRange("count")).toBe(3);
  });

  it("computes p50 percentile", () => {
    ts.addBatch(pts([[1000, 1], [2000, 2], [3000, 3], [4000, 4], [5000, 5]]));
    expect(ts.aggregateRange("p50")).toBe(3);
  });

  it("computes p95 percentile", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    ts.addBatch(values.map((v) => ({ timestamp: v * 1000, value: v })));
    const p95 = ts.aggregateRange("p95");
    expect(p95).toBeGreaterThan(90);
    expect(p95).toBeLessThanOrEqual(100);
  });

  // ─── Downsampling ───────────────────────────────────────────────────────

  it("downsamples into time buckets", () => {
    ts.addBatch(pts([
      [0, 10], [500, 20],       // bucket 0
      [1000, 30], [1500, 40],   // bucket 1000
      [2000, 50], [2500, 60],   // bucket 2000
    ]));
    const downsampled = ts.downsample(ts.getAll(), 1000, "avg");
    expect(downsampled).toHaveLength(3);
    expect(downsampled[0]?.value).toBe(15); // (10+20)/2
    expect(downsampled[1]?.value).toBe(35); // (30+40)/2
    expect(downsampled[2]?.value).toBe(55); // (50+60)/2
  });

  it("downsamples with sum aggregation", () => {
    ts.addBatch(pts([[0, 10], [500, 20], [1000, 30]]));
    const result = ts.downsample(ts.getAll(), 1000, "sum");
    expect(result[0]?.value).toBe(30);
    expect(result[1]?.value).toBe(30);
  });

  // ─── Rolling window ─────────────────────────────────────────────────────

  it("computes rolling window average", () => {
    ts.addBatch(pts([[0, 1], [1000, 3], [2000, 5], [3000, 7], [4000, 9]]));
    const rolling = ts.rollingWindow(2000, "avg");
    // At t=0: only [1] → avg 1
    expect(rolling[0]?.value).toBe(1);
    // At t=2000: [1, 3, 5] all within window [0..2000] → avg 3
    expect(rolling[2]?.value).toBeCloseTo(3, 5);
  });

  it("computes rolling window sum", () => {
    ts.addBatch(pts([[0, 10], [1000, 20], [2000, 30]]));
    const rolling = ts.rollingWindow(1500, "sum");
    // At t=1000: points at 0 and 1000 → sum 30
    expect(rolling[1]?.value).toBe(30);
  });

  // ─── Gap filling ────────────────────────────────────────────────────────

  it("fills gaps with interpolated values", () => {
    ts.addBatch(pts([[0, 0], [3000, 3]]));
    const filled = ts.fillGaps(1000, 10);
    // Should insert interpolated points at ~1000 and ~2000
    expect(filled.length).toBeGreaterThan(2);
    // Values should be monotonically increasing
    for (let i = 1; i < filled.length; i++) {
      expect((filled[i]?.value ?? 0)).toBeGreaterThanOrEqual((filled[i - 1]?.value ?? 0));
    }
  });

  it("does not fill gaps larger than maxGap", () => {
    ts.addBatch(pts([[0, 0], [100000, 100]]));
    const filled = ts.fillGaps(1000, 5); // max gap = 5000ms, actual = 100000ms
    expect(filled).toHaveLength(2);
  });

  // ─── Rate calculation ───────────────────────────────────────────────────

  it("computes rate of change", () => {
    // Counter increasing by 100 per second (1000ms apart)
    ts.addBatch(pts([[0, 0], [1000, 100], [2000, 200], [3000, 300]]));
    const rates = ts.rate({ windowMs: 2000, unit: "per_second" });
    expect(rates.length).toBeGreaterThan(0);
    // Rate should be ~100 per second
    expect(rates[rates.length - 1]?.value).toBeCloseTo(100, 0);
  });

  // ─── Summary ────────────────────────────────────────────────────────────

  it("returns correct summary statistics", () => {
    ts.addBatch(pts([[1000, 1], [2000, 2], [3000, 3], [4000, 4], [5000, 5]]));
    const s = ts.summary();
    expect(s.count).toBe(5);
    expect(s.sum).toBe(15);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.avg).toBe(3);
    expect(s.p50).toBe(3);
  });

  it("returns zero summary for empty series", () => {
    const s = ts.summary();
    expect(s.count).toBe(0);
    expect(s.sum).toBe(0);
  });

  // ─── Latest ─────────────────────────────────────────────────────────────

  it("returns latest n points", () => {
    ts.addBatch(pts([[1000, 1], [2000, 2], [3000, 3], [4000, 4], [5000, 5]]));
    const latest = ts.latest(3);
    expect(latest).toHaveLength(3);
    expect(latest[2]?.value).toBe(5);
  });

  // ─── Clear ──────────────────────────────────────────────────────────────

  it("clears all data", () => {
    ts.addBatch(pts([[1000, 1], [2000, 2]]));
    ts.clear();
    expect(ts.size).toBe(0);
  });
});
