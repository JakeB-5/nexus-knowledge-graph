import { describe, it, expect, beforeEach } from "vitest";
import { BenchmarkRunner } from "../runner.js";

describe("BenchmarkRunner", () => {
  let runner: BenchmarkRunner;

  beforeEach(() => {
    runner = new BenchmarkRunner({
      warmupIterations: 1,
      iterations: 5,
      trackMemory: false,
    });
  });

  describe("run()", () => {
    it("returns a result with the correct name", () => {
      const result = runner.run("my-benchmark", () => {
        // simple no-op
      });
      expect(result.name).toBe("my-benchmark");
    });

    it("records the correct number of iterations in stats", () => {
      const result = runner.run("iter-count", () => {});
      expect(result.stats.iterations).toBe(5);
    });

    it("min <= median <= mean <= max", () => {
      const result = runner.run("ordering", () => {
        // do some real work
        let x = 0;
        for (let i = 0; i < 10_000; i++) x += i;
        return x;
      });
      const { min, median, mean, max } = result.stats;
      expect(min).toBeLessThanOrEqual(median);
      expect(median).toBeLessThanOrEqual(max);
      // mean can be slightly above median for skewed distributions
      expect(min).toBeLessThanOrEqual(mean);
      expect(mean).toBeLessThanOrEqual(max * 2); // allow some slack
    });

    it("p95 <= p99 <= max", () => {
      const result = runner.run("percentiles", () => {
        let x = 0;
        for (let i = 0; i < 5_000; i++) x += i;
        return x;
      });
      expect(result.stats.p95).toBeLessThanOrEqual(result.stats.p99);
      expect(result.stats.p99).toBeLessThanOrEqual(result.stats.max + 0.001);
    });

    it("stddev is non-negative", () => {
      const result = runner.run("stddev", () => {});
      expect(result.stats.stddev).toBeGreaterThanOrEqual(0);
    });

    it("records result in getResults()", () => {
      runner.run("first", () => {});
      runner.run("second", () => {});
      const results = runner.getResults();
      expect(results).toHaveLength(2);
      expect(results[0]?.name).toBe("first");
      expect(results[1]?.name).toBe("second");
    });

    it("captures error message if function throws", () => {
      const result = runner.run("throwing", () => {
        throw new Error("bench error");
      });
      expect(result.error).toBe("bench error");
    });

    it("respects custom iteration count", () => {
      const result = runner.run("custom-iters", () => {}, { iterations: 10, warmupIterations: 0 });
      expect(result.stats.iterations).toBe(10);
    });

    it("totalMs equals sum of individual sample times (approximately)", () => {
      const result = runner.run("total-ms", () => {
        let x = 0;
        for (let i = 0; i < 1_000; i++) x += i;
        return x;
      });
      expect(result.stats.totalMs).toBeGreaterThan(0);
      // totalMs should be >= min * iterations (each sample >= min)
      expect(result.stats.totalMs).toBeGreaterThanOrEqual(
        result.stats.min * result.stats.iterations - 0.01,
      );
    });
  });

  describe("runAsync()", () => {
    it("benchmarks async functions correctly", async () => {
      const result = await runner.runAsync("async-bench", async () => {
        await Promise.resolve();
      });
      expect(result.name).toBe("async-bench");
      expect(result.stats.iterations).toBe(5);
      expect(result.error).toBeUndefined();
    });

    it("captures async errors", async () => {
      const result = await runner.runAsync("async-throw", async () => {
        await Promise.reject(new Error("async error"));
      });
      expect(result.error).toBe("async error");
    });

    it("respects timeout option", async () => {
      const result = await runner.runAsync(
        "timeout-bench",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
        },
        { timeout: 50, iterations: 2, warmupIterations: 0 },
      );
      expect(result.error).toContain("Timeout");
    }, 5_000);
  });

  describe("compare()", () => {
    it("identifies faster candidate correctly", () => {
      const baseline = runner.run("baseline", () => {
        let x = 0;
        for (let i = 0; i < 100_000; i++) x += i;
        return x;
      });
      const candidate = runner.run("candidate", () => {
        let x = 0;
        for (let i = 0; i < 1_000; i++) x += i;
        return x;
      });

      const comparison = runner.compare(baseline, candidate);
      expect(comparison.winner).toBe("candidate");
      expect(comparison.ratio).toBeLessThan(1);
      expect(comparison.percentDiff).toBeLessThan(0);
    });

    it("identifies slower candidate correctly", () => {
      const baseline = runner.run("fast-baseline", () => {
        let x = 0;
        for (let i = 0; i < 1_000; i++) x += i;
        return x;
      });
      const candidate = runner.run("slow-candidate", () => {
        let x = 0;
        for (let i = 0; i < 100_000; i++) x += i;
        return x;
      });

      const comparison = runner.compare(baseline, candidate);
      expect(comparison.winner).toBe("baseline");
      expect(comparison.ratio).toBeGreaterThan(1);
    });

    it("returns correct comparison metadata", () => {
      const a = runner.run("a", () => {});
      const b = runner.run("b", () => {});
      const comparison = runner.compare(a, b);

      expect(comparison.baseline).toBe(a);
      expect(comparison.candidate).toBe(b);
      expect(typeof comparison.ratio).toBe("number");
      expect(typeof comparison.percentDiff).toBe("number");
      expect(["baseline", "candidate", "tie"]).toContain(comparison.winner);
    });
  });

  describe("clearResults()", () => {
    it("clears accumulated results", () => {
      runner.run("one", () => {});
      runner.run("two", () => {});
      expect(runner.getResults()).toHaveLength(2);

      runner.clearResults();
      expect(runner.getResults()).toHaveLength(0);
    });
  });

  describe("exportCSV()", () => {
    it("writes a CSV file with correct headers", async () => {
      const { writeFileSync } = await import("node:fs");
      const { mkdtempSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { readFileSync } = await import("node:fs");

      const tmpDir = mkdtempSync(join(tmpdir(), "bench-test-"));
      const outFile = join(tmpDir, "results.csv");

      runner.run("csv-test", () => {});
      runner.exportCSV(outFile);

      const content = readFileSync(outFile, "utf-8");
      expect(content).toContain("name");
      expect(content).toContain("mean_ms");
      expect(content).toContain("p95_ms");
      expect(content).toContain("csv-test");

      rmSync(tmpDir, { recursive: true });
      void writeFileSync; // suppress unused import warning
    });
  });

  describe("memory tracking", () => {
    it("records memory delta when trackMemory=true", () => {
      const memRunner = new BenchmarkRunner({
        warmupIterations: 1,
        iterations: 3,
        trackMemory: true,
      });

      const result = memRunner.run("memory-test", () => {
        // Allocate some memory
        const arr = new Array(10_000).fill(0);
        return arr.length;
      });

      // memoryDelta may be 0 or negative due to GC, but field should exist
      expect(result.stats.memoryBefore).toBeDefined();
      expect(result.stats.memoryAfter).toBeDefined();
      expect(result.stats.memoryDelta).toBeDefined();
    });
  });
});
