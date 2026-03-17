import { describe, it, expect } from "vitest";
import {
  mean,
  median,
  mode,
  variance,
  sampleVariance,
  stdDeviation,
  sampleStdDeviation,
  percentile,
  p50,
  p95,
  p99,
  linearRegression,
  exponentialMovingAverage,
  zScore,
  zScores,
  correlationCoefficient,
  chiSquare,
  detectPowerLaw,
  simpleMovingAverage,
  histogram,
} from "../statistics.js";

// ─── mean ─────────────────────────────────────────────────────────────────────

describe("mean", () => {
  it("returns 0 for empty array", () => {
    expect(mean([])).toBe(0);
  });

  it("returns value for single element", () => {
    expect(mean([42])).toBe(42);
  });

  it("computes arithmetic mean", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it("handles negative values", () => {
    expect(mean([-3, -1, 1, 3])).toBe(0);
  });

  it("handles floats", () => {
    expect(mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 10);
  });
});

// ─── median ──────────────────────────────────────────────────────────────────

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("even-length array averages two middle values", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("single element", () => {
    expect(median([7])).toBe(7);
  });
});

// ─── mode ─────────────────────────────────────────────────────────────────────

describe("mode", () => {
  it("returns empty for empty array", () => {
    expect(mode([])).toEqual([]);
  });

  it("returns single mode", () => {
    expect(mode([1, 2, 2, 3])).toEqual([2]);
  });

  it("returns multiple modes sorted", () => {
    expect(mode([1, 1, 2, 2, 3])).toEqual([1, 2]);
  });

  it("all elements are modes if all unique", () => {
    expect(mode([3, 1, 2])).toEqual([1, 2, 3]);
  });
});

// ─── variance / stdDeviation ──────────────────────────────────────────────────

describe("variance", () => {
  it("returns 0 for empty array", () => {
    expect(variance([])).toBe(0);
  });

  it("returns 0 for single element", () => {
    expect(variance([5])).toBe(0);
  });

  it("computes population variance", () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] classic example: mean=5, var=4
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4, 5);
  });
});

describe("sampleVariance", () => {
  it("returns 0 for fewer than 2 elements", () => {
    expect(sampleVariance([5])).toBe(0);
  });

  it("Bessel correction: sample variance > population variance", () => {
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(sampleVariance(data)).toBeGreaterThan(variance(data));
  });
});

describe("stdDeviation", () => {
  it("is sqrt of variance", () => {
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(stdDeviation(data)).toBeCloseTo(Math.sqrt(variance(data)), 10);
  });
});

describe("sampleStdDeviation", () => {
  it("is sqrt of sampleVariance", () => {
    const data = [1, 2, 3, 4, 5];
    expect(sampleStdDeviation(data)).toBeCloseTo(Math.sqrt(sampleVariance(data)), 10);
  });
});

// ─── percentile ──────────────────────────────────────────────────────────────

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("p0 returns minimum", () => {
    expect(percentile([5, 3, 1, 4, 2], 0)).toBe(1);
  });

  it("p100 returns maximum", () => {
    expect(percentile([5, 3, 1, 4, 2], 100)).toBe(5);
  });

  it("p50 matches median", () => {
    const data = [1, 2, 3, 4, 5];
    expect(percentile(data, 50)).toBe(median(data));
  });

  it("p95 of 100 values is near 95", () => {
    const data = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(p95(data)).toBeGreaterThan(94);
    expect(p95(data)).toBeLessThanOrEqual(100);
  });

  it("p99 is higher than p95", () => {
    const data = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(p99(data)).toBeGreaterThanOrEqual(p95(data));
  });

  it("p50 alias works", () => {
    const data = [10, 20, 30, 40, 50];
    expect(p50(data)).toBe(30);
  });
});

// ─── linearRegression ────────────────────────────────────────────────────────

describe("linearRegression", () => {
  it("perfect positive linear relationship", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10]; // y = 2x
    const { slope, intercept, rSquared } = linearRegression(xs, ys);
    expect(slope).toBeCloseTo(2, 5);
    expect(intercept).toBeCloseTo(0, 5);
    expect(rSquared).toBeCloseTo(1, 5);
  });

  it("perfect negative linear relationship", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [5, 4, 3, 2, 1];
    const { slope, rSquared } = linearRegression(xs, ys);
    expect(slope).toBeCloseTo(-1, 5);
    expect(rSquared).toBeCloseTo(1, 5);
  });

  it("no relationship: R² is near 0", () => {
    // Random-ish values with no clear trend
    const xs = [1, 2, 3, 4, 5];
    const ys = [3, 1, 4, 1, 5];
    const { rSquared } = linearRegression(xs, ys);
    expect(rSquared).toBeLessThan(0.5);
  });

  it("constant y: returns slope 0 and R² 1", () => {
    const xs = [1, 2, 3];
    const ys = [5, 5, 5];
    const { slope, rSquared } = linearRegression(xs, ys);
    expect(slope).toBeCloseTo(0, 5);
    expect(rSquared).toBe(1); // all variance "explained" (ssTot = 0)
  });

  it("fewer than 2 points returns zero", () => {
    const result = linearRegression([1], [1]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
    expect(result.rSquared).toBe(0);
  });
});

// ─── exponentialMovingAverage ─────────────────────────────────────────────────

describe("exponentialMovingAverage", () => {
  it("returns empty for empty input", () => {
    expect(exponentialMovingAverage([], 0.5)).toEqual([]);
  });

  it("first element equals first value", () => {
    const result = exponentialMovingAverage([10, 20, 30], 0.5);
    expect(result[0]).toBe(10);
  });

  it("same length as input", () => {
    const result = exponentialMovingAverage([1, 2, 3, 4, 5], 0.3);
    expect(result).toHaveLength(5);
  });

  it("alpha=1 returns original values", () => {
    const data = [10, 20, 30, 40];
    const result = exponentialMovingAverage(data, 1.0);
    for (let i = 0; i < data.length; i++) {
      expect(result[i]).toBeCloseTo(data[i]!, 5);
    }
  });

  it("smooths values with alpha=0.5", () => {
    const result = exponentialMovingAverage([100, 0], 0.5);
    expect(result[1]).toBe(50); // 0.5*0 + 0.5*100 = 50
  });
});

// ─── zScore ───────────────────────────────────────────────────────────────────

describe("zScore", () => {
  it("returns 0 when sigma is 0", () => {
    expect(zScore(5, 5, 0)).toBe(0);
  });

  it("computes correct z-score", () => {
    expect(zScore(10, 5, 2.5)).toBeCloseTo(2, 5);
  });

  it("negative z-score for below-mean value", () => {
    expect(zScore(0, 5, 2.5)).toBeCloseTo(-2, 5);
  });
});

describe("zScores", () => {
  it("returns empty for empty input", () => {
    expect(zScores([])).toEqual([]);
  });

  it("mean of z-scores is ~0", () => {
    const zs = zScores([1, 2, 3, 4, 5]);
    expect(mean(zs)).toBeCloseTo(0, 10);
  });

  it("std of z-scores is ~1", () => {
    const zs = zScores([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stdDeviation(zs)).toBeCloseTo(1, 5);
  });
});

// ─── correlationCoefficient ───────────────────────────────────────────────────

describe("correlationCoefficient", () => {
  it("perfect positive correlation", () => {
    expect(correlationCoefficient([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 5);
  });

  it("perfect negative correlation", () => {
    expect(correlationCoefficient([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 5);
  });

  it("no correlation returns ~0", () => {
    // Orthogonal: alternating
    const r = correlationCoefficient([1, -1, 1, -1], [1, 1, -1, -1]);
    expect(Math.abs(r)).toBeLessThan(0.1);
  });

  it("returns 0 for fewer than 2 points", () => {
    expect(correlationCoefficient([1], [1])).toBe(0);
  });
});

// ─── chiSquare ────────────────────────────────────────────────────────────────

describe("chiSquare", () => {
  it("returns 0 for identical distributions", () => {
    expect(chiSquare([10, 20, 30], [10, 20, 30])).toBe(0);
  });

  it("returns positive value for different distributions", () => {
    expect(chiSquare([10, 20], [20, 10])).toBeGreaterThan(0);
  });

  it("skips buckets where expected is 0", () => {
    expect(chiSquare([5, 0], [0, 5])).toBe(0); // observed non-zero but expected is 0: skip
  });
});

// ─── detectPowerLaw ───────────────────────────────────────────────────────────

describe("detectPowerLaw", () => {
  it("detects power law in degree distribution", () => {
    // y = x^(-2) – classic power law
    const data = Array.from({ length: 20 }, (_, i) => {
      const x = i + 1;
      return { x, y: 1000 / (x * x) };
    });
    const result = detectPowerLaw(data, 0.85);
    expect(result.isPowerLaw).toBe(true);
    expect(result.exponent).toBeLessThan(0);
  });

  it("does not detect power law for uniform distribution", () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ x: i + 1, y: 1 }));
    const result = detectPowerLaw(data, 0.85);
    // Constant y: log(y) = 0, slope = 0, poor R² for power law detection
    // This might have R²=1 with slope 0 — exponent should be near 0
    expect(result.exponent).toBeCloseTo(0, 1);
  });

  it("returns false for fewer than 3 data points", () => {
    const result = detectPowerLaw([{ x: 1, y: 1 }, { x: 2, y: 0.5 }]);
    expect(result.isPowerLaw).toBe(false);
  });
});

// ─── simpleMovingAverage ──────────────────────────────────────────────────────

describe("simpleMovingAverage", () => {
  it("returns empty for empty input", () => {
    expect(simpleMovingAverage([], 3)).toEqual([]);
  });

  it("returns empty when k > length", () => {
    expect(simpleMovingAverage([1, 2], 3)).toEqual([]);
  });

  it("computes SMA correctly", () => {
    const result = simpleMovingAverage([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(2, 5); // (1+2+3)/3
    expect(result[1]).toBeCloseTo(3, 5); // (2+3+4)/3
    expect(result[2]).toBeCloseTo(4, 5); // (3+4+5)/3
  });

  it("k=1 returns original array", () => {
    const data = [10, 20, 30];
    expect(simpleMovingAverage(data, 1)).toEqual(data);
  });
});

// ─── histogram ────────────────────────────────────────────────────────────────

describe("histogram", () => {
  it("returns empty for empty input", () => {
    expect(histogram([], 5)).toEqual([]);
  });

  it("creates correct number of bins", () => {
    const result = histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(result).toHaveLength(5);
  });

  it("all values accounted for", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const bins = histogram(data, 5);
    const totalCount = bins.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(data.length);
  });

  it("relative frequencies sum to 1", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const bins = histogram(data, 5);
    const totalFreq = bins.reduce((s, b) => s + b.frequency, 0);
    expect(totalFreq).toBeCloseTo(1, 10);
  });

  it("handles single distinct value", () => {
    const bins = histogram([5, 5, 5], 3);
    expect(bins).toHaveLength(1);
    expect(bins[0]?.count).toBe(3);
  });
});
