import { writeFileSync } from "node:fs";

export interface BenchmarkOptions {
  /** Number of warm-up iterations (not counted in results) */
  warmupIterations?: number;
  /** Number of measured iterations */
  iterations?: number;
  /** Whether to track memory usage */
  trackMemory?: boolean;
  /** Timeout in ms for each run (0 = no timeout) */
  timeout?: number;
}

export interface BenchmarkStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
  iterations: number;
  totalMs: number;
  memoryBefore?: number;
  memoryAfter?: number;
  memoryDelta?: number;
}

export interface BenchmarkResult {
  name: string;
  stats: BenchmarkStats;
  error?: string;
}

export interface ComparisonResult {
  baseline: BenchmarkResult;
  candidate: BenchmarkResult;
  /** Ratio: candidate.mean / baseline.mean. <1 means candidate is faster. */
  ratio: number;
  /** Percentage faster (positive) or slower (negative) */
  percentDiff: number;
  winner: "baseline" | "candidate" | "tie";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower] ?? 0;
  const frac = idx - lower;
  return (sorted[lower] ?? 0) * (1 - frac) + (sorted[upper] ?? 0) * frac;
}

function calcStats(samples: number[], memBefore?: number, memAfter?: number): BenchmarkStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;

  return {
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0,
    mean,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    stddev: Math.sqrt(variance),
    iterations: n,
    totalMs: sorted.reduce((s, v) => s + v, 0),
    memoryBefore: memBefore,
    memoryAfter: memAfter,
    memoryDelta: memBefore !== undefined && memAfter !== undefined
      ? memAfter - memBefore
      : undefined,
  };
}

function getHeapUsed(): number {
  return process.memoryUsage().heapUsed;
}

export class BenchmarkRunner {
  private results: BenchmarkResult[] = [];
  private defaultOptions: Required<BenchmarkOptions>;

  constructor(options: BenchmarkOptions = {}) {
    this.defaultOptions = {
      warmupIterations: options.warmupIterations ?? 3,
      iterations: options.iterations ?? 10,
      trackMemory: options.trackMemory ?? false,
      timeout: options.timeout ?? 0,
    };
  }

  /**
   * Run a synchronous benchmark function N times.
   */
  run(
    name: string,
    fn: () => void,
    options: BenchmarkOptions = {},
  ): BenchmarkResult {
    const opts = { ...this.defaultOptions, ...options };
    const samples: number[] = [];

    try {
      // Warm-up
      for (let i = 0; i < opts.warmupIterations; i++) {
        fn();
      }

      // Force GC if available
      if (global.gc) global.gc();

      const memBefore = opts.trackMemory ? getHeapUsed() : undefined;

      // Measured iterations
      for (let i = 0; i < opts.iterations; i++) {
        const start = performance.now();
        fn();
        const end = performance.now();
        samples.push(end - start);
      }

      const memAfter = opts.trackMemory ? getHeapUsed() : undefined;

      const result: BenchmarkResult = {
        name,
        stats: calcStats(samples, memBefore, memAfter),
      };
      this.results.push(result);
      return result;
    } catch (err) {
      const result: BenchmarkResult = {
        name,
        stats: calcStats(samples.length > 0 ? samples : [0]),
        error: (err as Error).message,
      };
      this.results.push(result);
      return result;
    }
  }

  /**
   * Run an async benchmark function N times.
   */
  async runAsync(
    name: string,
    fn: () => Promise<void>,
    options: BenchmarkOptions = {},
  ): Promise<BenchmarkResult> {
    const opts = { ...this.defaultOptions, ...options };
    const samples: number[] = [];

    try {
      // Warm-up
      for (let i = 0; i < opts.warmupIterations; i++) {
        await fn();
      }

      if (global.gc) global.gc();
      const memBefore = opts.trackMemory ? getHeapUsed() : undefined;

      for (let i = 0; i < opts.iterations; i++) {
        const start = performance.now();
        if (opts.timeout > 0) {
          await Promise.race([
            fn(),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), opts.timeout),
            ),
          ]);
        } else {
          await fn();
        }
        const end = performance.now();
        samples.push(end - start);
      }

      const memAfter = opts.trackMemory ? getHeapUsed() : undefined;

      const result: BenchmarkResult = {
        name,
        stats: calcStats(samples, memBefore, memAfter),
      };
      this.results.push(result);
      return result;
    } catch (err) {
      const result: BenchmarkResult = {
        name,
        stats: calcStats(samples.length > 0 ? samples : [0]),
        error: (err as Error).message,
      };
      this.results.push(result);
      return result;
    }
  }

  /**
   * Compare two implementations and return the winner.
   */
  compare(baseline: BenchmarkResult, candidate: BenchmarkResult): ComparisonResult {
    const ratio = candidate.stats.mean / baseline.stats.mean;
    const percentDiff = ((candidate.stats.mean - baseline.stats.mean) / baseline.stats.mean) * 100;
    const THRESHOLD = 0.02; // 2% threshold for "tie"

    let winner: "baseline" | "candidate" | "tie";
    if (Math.abs(percentDiff) < THRESHOLD * 100) winner = "tie";
    else if (candidate.stats.mean < baseline.stats.mean) winner = "candidate";
    else winner = "baseline";

    return { baseline, candidate, ratio, percentDiff, winner };
  }

  /**
   * Print formatted results to stdout.
   */
  printResults(results?: BenchmarkResult[]): void {
    const toShow = results ?? this.results;
    if (toShow.length === 0) {
      console.log("No benchmark results to display.");
      return;
    }

    console.log("\n" + "═".repeat(80));
    console.log("BENCHMARK RESULTS");
    console.log("═".repeat(80));

    const header = [
      "Name".padEnd(30),
      "Mean".padStart(10),
      "Min".padStart(10),
      "Max".padStart(10),
      "p95".padStart(10),
      "p99".padStart(10),
      "StdDev".padStart(10),
    ].join(" ");
    console.log(header);
    console.log("─".repeat(80));

    for (const result of toShow) {
      if (result.error) {
        console.log(`${"ERROR: " + result.name} → ${result.error}`);
        continue;
      }
      const s = result.stats;
      const row = [
        result.name.slice(0, 30).padEnd(30),
        `${s.mean.toFixed(3)}ms`.padStart(10),
        `${s.min.toFixed(3)}ms`.padStart(10),
        `${s.max.toFixed(3)}ms`.padStart(10),
        `${s.p95.toFixed(3)}ms`.padStart(10),
        `${s.p99.toFixed(3)}ms`.padStart(10),
        `${s.stddev.toFixed(3)}ms`.padStart(10),
      ].join(" ");
      console.log(row);

      if (s.memoryDelta !== undefined) {
        const kb = (s.memoryDelta / 1024).toFixed(1);
        console.log(" ".repeat(30) + `  memory delta: ${kb} KB`);
      }
    }

    console.log("═".repeat(80) + "\n");
  }

  /**
   * Print a side-by-side comparison.
   */
  printComparison(comparison: ComparisonResult): void {
    const { baseline, candidate, ratio, percentDiff, winner } = comparison;
    console.log("\n" + "═".repeat(60));
    console.log("COMPARISON");
    console.log("═".repeat(60));
    console.log(`  Baseline:  ${baseline.name}`);
    console.log(`    Mean: ${baseline.stats.mean.toFixed(3)}ms`);
    console.log(`  Candidate: ${candidate.name}`);
    console.log(`    Mean: ${candidate.stats.mean.toFixed(3)}ms`);
    console.log("─".repeat(60));
    console.log(`  Ratio:     ${ratio.toFixed(3)}x`);
    const sign = percentDiff >= 0 ? "+" : "";
    console.log(`  Diff:      ${sign}${percentDiff.toFixed(1)}%`);
    const winnerLabel =
      winner === "tie"
        ? "TIE"
        : winner === "candidate"
        ? `CANDIDATE (${Math.abs(percentDiff).toFixed(1)}% faster)`
        : `BASELINE (${Math.abs(percentDiff).toFixed(1)}% faster)`;
    console.log(`  Winner:    ${winnerLabel}`);
    console.log("═".repeat(60) + "\n");
  }

  /**
   * Export all results as CSV.
   */
  exportCSV(filePath: string, results?: BenchmarkResult[]): void {
    const toExport = results ?? this.results;
    const headers = ["name", "mean_ms", "min_ms", "max_ms", "median_ms", "p95_ms", "p99_ms", "stddev_ms", "iterations", "memory_delta_kb", "error"];
    const rows = toExport.map((r) => {
      const s = r.stats;
      return [
        r.name,
        s.mean.toFixed(4),
        s.min.toFixed(4),
        s.max.toFixed(4),
        s.median.toFixed(4),
        s.p95.toFixed(4),
        s.p99.toFixed(4),
        s.stddev.toFixed(4),
        String(s.iterations),
        s.memoryDelta !== undefined ? (s.memoryDelta / 1024).toFixed(1) : "",
        r.error ?? "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    writeFileSync(filePath, csv, "utf-8");
    console.log(`Results exported to ${filePath}`);
  }

  getResults(): BenchmarkResult[] {
    return this.results;
  }

  clearResults(): void {
    this.results = [];
  }
}
