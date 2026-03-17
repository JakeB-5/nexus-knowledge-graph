import { describe, it, expect } from "vitest";
import {
  mean, median, mode, variance, stddev, skewness, kurtosis,
  percentile, iqr, range, summary,
  linearRegression, polynomialRegression,
  pearsonCorrelation, spearmanCorrelation,
  simpleMovingAverage, exponentialMovingAverage, weightedMovingAverage,
  iqrOutliers, zScoreOutliers,
  confidenceInterval,
  tTest, chiSquareTest,
  histogramSturges, histogramScott, histogramFreedmanDiaconis,
  covariance,
} from "../statistics-extended.js";

describe("descriptive statistics", () => {
  const data = [2, 4, 4, 4, 5, 5, 7, 9];

  it("mean", () => {
    expect(mean(data)).toBeCloseTo(5);
  });

  it("median even length", () => {
    expect(median(data)).toBe(4.5);
  });

  it("median odd length", () => {
    expect(median([1, 3, 5])).toBe(3);
  });

  it("mode", () => {
    expect(mode(data)).toEqual([4]);
  });

  it("mode with multiple modes", () => {
    expect(mode([1, 1, 2, 2, 3])).toEqual([1, 2]);
  });

  it("variance (sample)", () => {
    // [2,4,4,4,5,5,7,9], mean=5, sum of sq diffs=32, / (8-1) ≈ 4.571
    expect(variance(data)).toBeCloseTo(4.571, 2);
  });

  it("variance (population)", () => {
    // sum of sq diffs=32, / 8 = 4
    expect(variance(data, false)).toBeCloseTo(4, 2);
  });

  it("stddev", () => {
    // sqrt(4.571) ≈ 2.138
    expect(stddev(data)).toBeCloseTo(2.138, 2);
  });

  it("skewness of symmetric data ≈ 0", () => {
    const sym = [1, 2, 3, 4, 5];
    expect(Math.abs(skewness(sym))).toBeLessThan(0.5);
  });

  it("kurtosis", () => {
    const large = Array.from({ length: 100 }, (_, i) => i);
    expect(typeof kurtosis(large)).toBe("number");
  });

  it("percentile", () => {
    const d = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(d, 50)).toBeCloseTo(5.5);
    expect(percentile(d, 0)).toBe(1);
    expect(percentile(d, 100)).toBe(10);
  });

  it("iqr", () => {
    const d = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(iqr(d)).toBeCloseTo(4.5);
  });

  it("range", () => {
    expect(range([1, 5, 3, 9, 2])).toBe(8);
  });

  it("summary returns all fields", () => {
    const s = summary(data);
    expect(s.count).toBe(8);
    expect(s.mean).toBeCloseTo(5);
    expect(typeof s.median).toBe("number");
    expect(typeof s.stddev).toBe("number");
    expect(typeof s.min).toBe("number");
    expect(typeof s.max).toBe("number");
    expect(typeof s.q1).toBe("number");
    expect(typeof s.q3).toBe("number");
  });
});

describe("linear regression", () => {
  it("fits a perfect linear relationship", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const { slope, intercept, rSquared, predict } = linearRegression(x, y);
    expect(slope).toBeCloseTo(2);
    expect(intercept).toBeCloseTo(0);
    expect(rSquared).toBeCloseTo(1);
    expect(predict(6)).toBeCloseTo(12);
  });

  it("rSquared less than 1 for noisy data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [1, 3, 2, 5, 4];
    const { rSquared } = linearRegression(x, y);
    expect(rSquared).toBeGreaterThan(0);
    expect(rSquared).toBeLessThan(1);
  });
});

describe("polynomial regression", () => {
  it("degree 2 fits quadratic data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = x.map((v) => v * v); // y = x^2
    const { predict, rSquared } = polynomialRegression(x, y, 2);
    expect(predict(3)).toBeCloseTo(9, 0);
    expect(rSquared).toBeGreaterThan(0.99);
  });
});

describe("correlation", () => {
  it("pearson correlation of identical arrays is 1", () => {
    const x = [1, 2, 3, 4, 5];
    expect(pearsonCorrelation(x, x)).toBeCloseTo(1);
  });

  it("pearson correlation of perfect inverse is -1", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [5, 4, 3, 2, 1];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(-1);
  });

  it("spearman correlation of identical arrays is 1", () => {
    const x = [3, 1, 4, 1, 5, 9, 2, 6];
    expect(spearmanCorrelation(x, x)).toBeCloseTo(1);
  });

  it("covariance of same array is variance", () => {
    const x = [1, 2, 3, 4, 5];
    expect(covariance(x, x)).toBeCloseTo(variance(x));
  });
});

describe("moving averages", () => {
  const data = [1, 2, 3, 4, 5, 6, 7];

  it("simple moving average window=3", () => {
    const sma = simpleMovingAverage(data, 3);
    expect(sma[0]).toBeCloseTo(2);
    expect(sma[1]).toBeCloseTo(3);
    expect(sma.length).toBe(data.length - 2);
  });

  it("exponential moving average", () => {
    const ema = exponentialMovingAverage(data, 0.5);
    expect(ema.length).toBe(data.length);
    expect(ema[0]).toBe(1);
  });

  it("weighted moving average", () => {
    const wma = weightedMovingAverage(data, [1, 2, 3]);
    expect(wma.length).toBe(data.length - 2);
    // (1*1 + 2*2 + 3*3) / 6 = 14/6 ≈ 2.33
    expect(wma[0]).toBeCloseTo(14 / 6);
  });
});

describe("outlier detection", () => {
  it("IQR outliers finds extreme values", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    const { outliers } = iqrOutliers(data);
    expect(outliers).toContain(100);
  });

  it("IQR outliers returns bounds", () => {
    const data = [1, 2, 3, 4, 5];
    const { bounds } = iqrOutliers(data);
    expect(typeof bounds.lower).toBe("number");
    expect(typeof bounds.upper).toBe("number");
  });

  it("Z-score outliers finds extreme values", () => {
    // Need enough data so z-score threshold=3 can identify 1000 as outlier
    const data = [10, 12, 11, 13, 10, 12, 11, 13, 12, 10, 11, 13, 12, 11, 1000];
    const { outliers } = zScoreOutliers(data, 2);
    expect(outliers).toContain(1000);
  });

  it("Z-score returns z-scores array", () => {
    const data = [1, 2, 3, 4, 5];
    const { zScores } = zScoreOutliers(data);
    expect(zScores.length).toBe(data.length);
  });
});

describe("confidence interval", () => {
  it("returns lower and upper bounds", () => {
    const data = Array.from({ length: 100 }, (_, i) => i + 1);
    const ci = confidenceInterval(data, 0.95);
    expect(ci.lower).toBeLessThan(ci.upper);
    expect(ci.margin).toBeGreaterThan(0);
  });
});

describe("hypothesis testing", () => {
  it("t-test returns tStat and df", () => {
    const data = [1, 2, 3, 4, 5];
    const { tStat, degreesOfFreedom } = tTest(data, 3);
    expect(degreesOfFreedom).toBe(4);
    expect(Math.abs(tStat)).toBeLessThan(2); // mean=3, same as hypothesis
  });

  it("t-test detects deviation from mean", () => {
    const data = [10, 12, 11, 13, 12];
    const { tStat } = tTest(data, 0);
    expect(Math.abs(tStat)).toBeGreaterThan(10);
  });

  it("chi-square test", () => {
    const observed = [10, 20, 30];
    const expected = [15, 20, 25];
    const { chiSquare, degreesOfFreedom } = chiSquareTest(observed, expected);
    expect(chiSquare).toBeGreaterThan(0);
    expect(degreesOfFreedom).toBe(2);
  });
});

describe("histogram binning", () => {
  const data = Array.from({ length: 100 }, (_, i) => i);

  it("Sturges rule returns bins", () => {
    const bins = histogramSturges(data);
    expect(bins.length).toBeGreaterThan(0);
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(100);
  });

  it("Scott rule returns bins", () => {
    const bins = histogramScott(data);
    expect(bins.length).toBeGreaterThan(0);
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(100);
  });

  it("Freedman-Diaconis rule returns bins", () => {
    const bins = histogramFreedmanDiaconis(data);
    expect(bins.length).toBeGreaterThan(0);
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(100);
  });

  it("bins have correct frequency", () => {
    const bins = histogramSturges(data);
    for (const bin of bins) {
      expect(bin.frequency).toBeCloseTo(bin.count / 100);
    }
  });
});
