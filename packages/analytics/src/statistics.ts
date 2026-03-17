// Statistical utility functions for analytics

/** Sort numbers ascending (returns new array) */
function sortedAsc(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Arithmetic mean */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Median (50th percentile) */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = sortedAsc(values);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

/** Mode – returns all values that appear most frequently */
export function mode(values: number[]): number[] {
  if (values.length === 0) return [];
  const freq = new Map<number, number>();
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  let maxFreq = 0;
  for (const count of freq.values()) {
    if (count > maxFreq) maxFreq = count;
  }
  const modes: number[] = [];
  for (const [v, count] of freq.entries()) {
    if (count === maxFreq) modes.push(v);
  }
  return modes.sort((a, b) => a - b);
}

/** Population variance */
export function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
}

/** Sample variance (Bessel's correction) */
export function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

/** Population standard deviation */
export function stdDeviation(values: number[]): number {
  return Math.sqrt(variance(values));
}

/** Sample standard deviation */
export function sampleStdDeviation(values: number[]): number {
  return Math.sqrt(sampleVariance(values));
}

/**
 * Percentile using linear interpolation (same as numpy's default).
 * p: 0–100
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (p <= 0) return sortedAsc(values)[0] ?? 0;
  if (p >= 100) return sortedAsc(values)[values.length - 1] ?? 0;

  const sorted = sortedAsc(values);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  const lowerVal = sorted[lower] ?? 0;
  const upperVal = sorted[upper] ?? 0;
  return lowerVal + fraction * (upperVal - lowerVal);
}

export function p50(values: number[]): number {
  return percentile(values, 50);
}

export function p95(values: number[]): number {
  return percentile(values, 95);
}

export function p99(values: number[]): number {
  return percentile(values, 99);
}

/**
 * Simple linear regression: y = slope * x + intercept
 * Returns slope, intercept, and R-squared.
 */
export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

export function linearRegression(
  xs: number[],
  ys: number[]
): LinearRegressionResult {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

  const xSlice = xs.slice(0, n);
  const ySlice = ys.slice(0, n);

  const xMean = mean(xSlice);
  const yMean = mean(ySlice);

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xSlice[i] ?? 0) - xMean;
    const dy = (ySlice[i] ?? 0) - yMean;
    sxy += dx * dy;
    sxx += dx * dx;
  }

  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = yMean - slope * xMean;

  // R-squared
  const ssTot = ySlice.reduce((sum, y) => sum + (y - yMean) ** 2, 0);
  if (ssTot === 0) return { slope, intercept, rSquared: 1 };

  const ssRes = ySlice.reduce((sum, y, i) => {
    const predicted = slope * (xSlice[i] ?? 0) + intercept;
    return sum + (y - predicted) ** 2;
  }, 0);

  const rSquared = 1 - ssRes / ssTot;
  return { slope, intercept, rSquared };
}

/**
 * Exponential moving average (EMA).
 * alpha: smoothing factor [0..1]. Higher = more weight on recent values.
 */
export function exponentialMovingAverage(
  values: number[],
  alpha: number
): number[] {
  if (values.length === 0) return [];
  const result: number[] = [values[0] ?? 0];
  for (let i = 1; i < values.length; i++) {
    const prev = result[i - 1] ?? 0;
    const curr = values[i] ?? 0;
    result.push(alpha * curr + (1 - alpha) * prev);
  }
  return result;
}

/**
 * Z-score for a single value given a population mean and std deviation.
 */
export function zScore(value: number, mu: number, sigma: number): number {
  if (sigma === 0) return 0;
  return (value - mu) / sigma;
}

/**
 * Z-scores for an array of values.
 */
export function zScores(values: number[]): number[] {
  if (values.length === 0) return [];
  const m = mean(values);
  const s = stdDeviation(values);
  return values.map((v) => zScore(v, m, s));
}

/**
 * Pearson correlation coefficient between two arrays.
 * Returns [-1, 1]. Returns 0 if either array has zero variance.
 */
export function correlationCoefficient(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;

  const xSlice = xs.slice(0, n);
  const ySlice = ys.slice(0, n);

  const xMean = mean(xSlice);
  const yMean = mean(ySlice);

  let numerator = 0;
  let xSumSq = 0;
  let ySumSq = 0;

  for (let i = 0; i < n; i++) {
    const dx = (xSlice[i] ?? 0) - xMean;
    const dy = (ySlice[i] ?? 0) - yMean;
    numerator += dx * dy;
    xSumSq += dx * dx;
    ySumSq += dy * dy;
  }

  const denominator = Math.sqrt(xSumSq * ySumSq);
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Chi-square statistic for two frequency distributions.
 * observed and expected must be same length.
 * Returns chi-square value (lower = more similar distributions).
 */
export function chiSquare(observed: number[], expected: number[]): number {
  const n = Math.min(observed.length, expected.length);
  let chi2 = 0;
  for (let i = 0; i < n; i++) {
    const obs = observed[i] ?? 0;
    const exp = expected[i] ?? 0;
    if (exp > 0) {
      chi2 += (obs - exp) ** 2 / exp;
    }
  }
  return chi2;
}

/**
 * Power-law detection via log-log linear regression.
 * A true power law has a high R² in log-log space.
 * Returns { isPowerLaw, exponent, rSquared }.
 * Input: array of (x, y) pairs (e.g., degree → frequency).
 */
export interface PowerLawResult {
  isPowerLaw: boolean;
  exponent: number;
  rSquared: number;
}

export function detectPowerLaw(
  data: Array<{ x: number; y: number }>,
  threshold = 0.85
): PowerLawResult {
  // Filter to positive values only for log transform
  const filtered = data.filter((d) => d.x > 0 && d.y > 0);
  if (filtered.length < 3) {
    return { isPowerLaw: false, exponent: 0, rSquared: 0 };
  }

  const logXs = filtered.map((d) => Math.log(d.x));
  const logYs = filtered.map((d) => Math.log(d.y));

  const { slope, rSquared } = linearRegression(logXs, logYs);
  // In power law y ~ x^alpha, log(y) = alpha * log(x) + c
  return {
    isPowerLaw: rSquared >= threshold,
    exponent: slope,
    rSquared,
  };
}

/**
 * Simple moving average over a window of size k.
 */
export function simpleMovingAverage(values: number[], k: number): number[] {
  if (k <= 0 || values.length === 0) return [];
  const result: number[] = [];
  let windowSum = 0;

  for (let i = 0; i < values.length; i++) {
    windowSum += values[i] ?? 0;
    if (i >= k) {
      windowSum -= values[i - k] ?? 0;
    }
    if (i >= k - 1) {
      result.push(windowSum / k);
    }
  }
  return result;
}

/**
 * Histogram: bucket values into `bins` equal-width bins.
 */
export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  frequency: number; // relative frequency [0..1]
}

export function histogram(values: number[], bins: number): HistogramBin[] {
  if (values.length === 0 || bins <= 0) return [];
  const sorted = sortedAsc(values);
  const minVal = sorted[0] ?? 0;
  const maxVal = sorted[sorted.length - 1] ?? 0;

  if (minVal === maxVal) {
    return [{ min: minVal, max: maxVal, count: values.length, frequency: 1 }];
  }

  const binWidth = (maxVal - minVal) / bins;
  const result: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({
    min: minVal + i * binWidth,
    max: minVal + (i + 1) * binWidth,
    count: 0,
    frequency: 0,
  }));

  for (const v of values) {
    let binIdx = Math.floor((v - minVal) / binWidth);
    // Last value falls in last bin
    if (binIdx >= bins) binIdx = bins - 1;
    const bin = result[binIdx];
    if (bin) bin.count++;
  }

  for (const bin of result) {
    bin.frequency = bin.count / values.length;
  }

  return result;
}
