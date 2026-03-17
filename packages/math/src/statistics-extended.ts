/**
 * Extended statistics: descriptive stats, regression, correlation, outliers, hypothesis testing.
 */

// --- Descriptive Statistics ---

export function mean(data: number[]): number {
  if (data.length === 0) throw new Error("Empty dataset");
  return data.reduce((a, b) => a + b, 0) / data.length;
}

export function median(data: number[]): number {
  if (data.length === 0) throw new Error("Empty dataset");
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

export function mode(data: number[]): number[] {
  if (data.length === 0) throw new Error("Empty dataset");
  const freq = new Map<number, number>();
  for (const v of data) freq.set(v, (freq.get(v) ?? 0) + 1);
  const maxFreq = Math.max(...freq.values());
  return [...freq.entries()].filter(([, f]) => f === maxFreq).map(([v]) => v).sort((a, b) => a - b);
}

export function variance(data: number[], sample = true): number {
  if (data.length < 2) throw new Error("Need at least 2 data points");
  const m = mean(data);
  const squaredDiffs = data.map((v) => (v - m) ** 2);
  const divisor = sample ? data.length - 1 : data.length;
  return squaredDiffs.reduce((a, b) => a + b, 0) / divisor;
}

export function stddev(data: number[], sample = true): number {
  return Math.sqrt(variance(data, sample));
}

export function skewness(data: number[]): number {
  if (data.length < 3) throw new Error("Need at least 3 data points for skewness");
  const m = mean(data);
  const s = stddev(data);
  if (s === 0) return 0;
  const n = data.length;
  const sum = data.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sum;
}

export function kurtosis(data: number[]): number {
  if (data.length < 4) throw new Error("Need at least 4 data points for kurtosis");
  const m = mean(data);
  const s = stddev(data);
  if (s === 0) return 0;
  const n = data.length;
  const sum = data.reduce((acc, v) => acc + ((v - m) / s) ** 4, 0);
  return (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * sum -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

export function percentile(data: number[], p: number): number {
  if (p < 0 || p > 100) throw new Error("Percentile must be in [0, 100]");
  const sorted = [...data].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function iqr(data: number[]): number {
  return percentile(data, 75) - percentile(data, 25);
}

export function range(data: number[]): number {
  if (data.length === 0) throw new Error("Empty dataset");
  return Math.max(...data) - Math.min(...data);
}

export function summary(data: number[]): {
  count: number; mean: number; median: number; stddev: number;
  min: number; max: number; q1: number; q3: number;
} {
  return {
    count: data.length,
    mean: mean(data),
    median: median(data),
    stddev: stddev(data),
    min: Math.min(...data),
    max: Math.max(...data),
    q1: percentile(data, 25),
    q3: percentile(data, 75),
  };
}

// --- Regression ---

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  predict: (x: number) => number;
}

export function linearRegression(x: number[], y: number[]): LinearRegressionResult {
  if (x.length !== y.length || x.length < 2) throw new Error("Need at least 2 data points");
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let ssxy = 0, ssxx = 0;
  for (let i = 0; i < n; i++) {
    ssxy += (x[i]! - mx) * (y[i]! - my);
    ssxx += (x[i]! - mx) ** 2;
  }
  const slope = ssxx === 0 ? 0 : ssxy / ssxx;
  const intercept = my - slope * mx;
  const predict = (xVal: number) => slope * xVal + intercept;

  const ssTotal = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => s + (v - predict(x[i]!)) ** 2, 0);
  const rSquared = ssTotal === 0 ? 1 : 1 - ssRes / ssTotal;

  return { slope, intercept, rSquared, predict };
}

export interface PolynomialRegressionResult {
  coefficients: number[];
  rSquared: number;
  predict: (x: number) => number;
}

/** Polynomial regression of given degree (2 or 3) using least squares */
export function polynomialRegression(
  x: number[],
  y: number[],
  degree: 2 | 3
): PolynomialRegressionResult {
  if (x.length !== y.length) throw new Error("x and y must have same length");
  const n = x.length;
  const terms = degree + 1;
  // Build normal equations via Vandermonde matrix
  const A: number[][] = Array.from({ length: terms }, (_, i) =>
    Array.from({ length: terms }, (__, j) =>
      x.reduce((s, v) => s + v ** (i + j), 0)
    )
  );
  const b: number[] = Array.from({ length: terms }, (_, i) =>
    x.reduce((s, v, k) => s + v ** i * y[k]!, 0)
  );

  // Solve via Gaussian elimination
  const coefficients = gaussianElimination(A, b);

  const predict = (xVal: number) =>
    coefficients.reduce((s, c, i) => s + c * xVal ** i, 0);

  const my = mean(y);
  const ssTotal = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => s + (v - predict(x[i]!)) ** 2, 0);
  const rSquared = ssTotal === 0 ? 1 : 1 - ssRes / ssTotal;

  return { coefficients, rSquared, predict };
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row]![col]!) > Math.abs(aug[maxRow]![col]!)) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow]!, aug[col]!];
    const pivot = aug[col]![col]!;
    if (Math.abs(pivot) < 1e-12) continue;
    for (let j = col; j <= n; j++) aug[col]![j]! /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row]![col]!;
      for (let j = col; j <= n; j++) aug[row]![j]! -= factor * aug[col]![j]!;
    }
  }
  return aug.map((row) => row[n]!);
}

// --- Correlation ---

export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) throw new Error("Need matching arrays with >= 2 points");
  const mx = mean(x), my = mean(y);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j]!.v === indexed[i]!.v) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[indexed[k]!.i] = avgRank;
    i = j;
  }
  return ranks;
}

export function spearmanCorrelation(x: number[], y: number[]): number {
  return pearsonCorrelation(rankArray(x), rankArray(y));
}

// --- Moving Averages ---

export function simpleMovingAverage(data: number[], window: number): number[] {
  if (window < 1) throw new Error("Window must be >= 1");
  const result: number[] = [];
  for (let i = window - 1; i < data.length; i++) {
    const slice = data.slice(i - window + 1, i + 1);
    result.push(mean(slice));
  }
  return result;
}

export function exponentialMovingAverage(data: number[], alpha: number): number[] {
  if (alpha <= 0 || alpha > 1) throw new Error("Alpha must be in (0, 1]");
  if (data.length === 0) return [];
  const result = [data[0]!];
  for (let i = 1; i < data.length; i++) {
    result.push(alpha * data[i]! + (1 - alpha) * result[i - 1]!);
  }
  return result;
}

export function weightedMovingAverage(data: number[], weights: number[]): number[] {
  const w = weights.length;
  if (w === 0) throw new Error("Weights cannot be empty");
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const result: number[] = [];
  for (let i = w - 1; i < data.length; i++) {
    let weighted = 0;
    for (let j = 0; j < w; j++) weighted += data[i - w + 1 + j]! * weights[j]!;
    result.push(weighted / totalWeight);
  }
  return result;
}

// --- Outlier Detection ---

export function iqrOutliers(data: number[]): { outliers: number[]; bounds: { lower: number; upper: number } } {
  const q1 = percentile(data, 25);
  const q3 = percentile(data, 75);
  const iqrVal = q3 - q1;
  const lower = q1 - 1.5 * iqrVal;
  const upper = q3 + 1.5 * iqrVal;
  return {
    outliers: data.filter((v) => v < lower || v > upper),
    bounds: { lower, upper },
  };
}

export function zScoreOutliers(data: number[], threshold = 3): { outliers: number[]; zScores: number[] } {
  const m = mean(data);
  const s = stddev(data);
  const zScores = data.map((v) => (s === 0 ? 0 : (v - m) / s));
  const outliers = data.filter((_, i) => Math.abs(zScores[i]!) > threshold);
  return { outliers, zScores };
}

// --- Confidence Interval ---

export function confidenceInterval(
  data: number[],
  confidence = 0.95
): { lower: number; upper: number; margin: number } {
  const n = data.length;
  const m = mean(data);
  const s = stddev(data);
  // Use z-score approximation (normal distribution)
  const zScores: Record<number, number> = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 };
  const z = zScores[confidence] ?? 1.96;
  const margin = z * (s / Math.sqrt(n));
  return { lower: m - margin, upper: m + margin, margin };
}

// --- Hypothesis Testing ---

/** One-sample t-test: test if population mean equals hypothesized value */
export function tTest(data: number[], hypothesizedMean: number): { tStat: number; degreesOfFreedom: number } {
  const n = data.length;
  const m = mean(data);
  const s = stddev(data);
  const tStat = (m - hypothesizedMean) / (s / Math.sqrt(n));
  return { tStat, degreesOfFreedom: n - 1 };
}

/** Chi-square goodness of fit test */
export function chiSquareTest(observed: number[], expected: number[]): { chiSquare: number; degreesOfFreedom: number } {
  if (observed.length !== expected.length) throw new Error("Arrays must have same length");
  const chiSquare = observed.reduce((s, o, i) => {
    const e = expected[i]!;
    if (e === 0) throw new Error("Expected value cannot be zero");
    return s + (o - e) ** 2 / e;
  }, 0);
  return { chiSquare, degreesOfFreedom: observed.length - 1 };
}

// --- Histogram Binning ---

export interface Bin {
  lower: number;
  upper: number;
  count: number;
  frequency: number;
}

export function histogramSturges(data: number[]): Bin[] {
  const bins = Math.ceil(1 + Math.log2(data.length));
  return histogramBins(data, bins);
}

export function histogramScott(data: number[]): Bin[] {
  const s = stddev(data);
  const binWidth = 3.5 * s / Math.cbrt(data.length);
  const r = range(data);
  const bins = Math.ceil(r / binWidth);
  return histogramBins(data, Math.max(1, bins));
}

export function histogramFreedmanDiaconis(data: number[]): Bin[] {
  const binWidth = 2 * iqr(data) / Math.cbrt(data.length);
  const r = range(data);
  const bins = binWidth === 0 ? 1 : Math.ceil(r / binWidth);
  return histogramBins(data, Math.max(1, bins));
}

function histogramBins(data: number[], numBins: number): Bin[] {
  if (data.length === 0) return [];
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const binWidth = (maxVal - minVal) / numBins;
  const bins: Bin[] = Array.from({ length: numBins }, (_, i) => ({
    lower: minVal + i * binWidth,
    upper: minVal + (i + 1) * binWidth,
    count: 0,
    frequency: 0,
  }));
  for (const v of data) {
    const idx = Math.min(Math.floor((v - minVal) / binWidth), numBins - 1);
    bins[idx]!.count++;
  }
  for (const bin of bins) {
    bin.frequency = bin.count / data.length;
  }
  return bins;
}

export function covariance(x: number[], y: number[], sample = true): number {
  if (x.length !== y.length || x.length < 2) throw new Error("Need matching arrays with >= 2 points");
  const mx = mean(x), my = mean(y);
  const sum = x.reduce((s, v, i) => s + (v - mx) * (y[i]! - my), 0);
  return sum / (sample ? x.length - 1 : x.length);
}
