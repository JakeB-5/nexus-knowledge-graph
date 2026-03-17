import { describe, it, expect, beforeEach } from "vitest";
import { Counter } from "../metrics/counter.js";
import { Gauge } from "../metrics/gauge.js";
import { Histogram } from "../metrics/histogram.js";
import { MetricRegistry, createCounter, createGauge, createHistogram } from "../metrics/registry.js";

// ─── Counter tests ────────────────────────────────────────────────────────────

describe("Counter", () => {
  let counter: Counter;

  beforeEach(() => {
    counter = new Counter({ name: "test_counter", help: "A test counter" });
  });

  it("starts at zero", () => {
    expect(counter.get()).toBe(0);
  });

  it("increments by 1 by default", () => {
    counter.increment();
    expect(counter.get()).toBe(1);
  });

  it("increments by specified value", () => {
    counter.increment(5);
    expect(counter.get()).toBe(5);
  });

  it("accumulates increments", () => {
    counter.increment(3);
    counter.increment(7);
    expect(counter.get()).toBe(10);
  });

  it("throws on negative increment", () => {
    expect(() => counter.increment(-1)).toThrow(RangeError);
  });

  it("allows zero increment", () => {
    counter.increment(0);
    expect(counter.get()).toBe(0);
  });

  it("resets to zero", () => {
    counter.increment(10);
    counter.reset();
    expect(counter.get()).toBe(0);
  });

  it("supports labels", () => {
    const labeled = new Counter({
      name: "http_requests",
      help: "HTTP requests",
      labelNames: ["method", "status"],
    });

    labeled.increment(1, { method: "GET", status: "200" });
    labeled.increment(2, { method: "POST", status: "201" });
    labeled.increment(1, { method: "GET", status: "200" });

    expect(labeled.get({ method: "GET", status: "200" })).toBe(2);
    expect(labeled.get({ method: "POST", status: "201" })).toBe(2);
    expect(labeled.get({ method: "GET", status: "404" })).toBe(0);
  });

  it("resets specific label combination", () => {
    const labeled = new Counter({
      name: "labeled_counter",
      help: "Labeled",
      labelNames: ["env"],
    });
    labeled.increment(5, { env: "prod" });
    labeled.increment(3, { env: "dev" });
    labeled.resetLabels({ env: "prod" });
    expect(labeled.get({ env: "prod" })).toBe(0);
    expect(labeled.get({ env: "dev" })).toBe(3);
  });

  it("collects metric family with total suffix", () => {
    counter.increment(42);
    const family = counter.collect();
    expect(family.name).toBe("test_counter");
    expect(family.type).toBe("counter");
    expect(family.samples).toHaveLength(1);
    expect(family.samples[0]?.name).toBe("test_counter_total");
    expect(family.samples[0]?.value).toBe(42);
  });

  it("exposes name, help, and labelNames", () => {
    const c = new Counter({ name: "foo", help: "bar", labelNames: ["x"] });
    expect(c.getName()).toBe("foo");
    expect(c.getHelp()).toBe("bar");
    expect(c.getLabelNames()).toEqual(["x"]);
  });
});

// ─── Gauge tests ──────────────────────────────────────────────────────────────

describe("Gauge", () => {
  let gauge: Gauge;

  beforeEach(() => {
    gauge = new Gauge({ name: "test_gauge", help: "A test gauge" });
  });

  it("starts at zero", () => {
    expect(gauge.get()).toBe(0);
  });

  it("set to absolute value", () => {
    gauge.set(42);
    expect(gauge.get()).toBe(42);
  });

  it("can go below zero", () => {
    gauge.set(-10);
    expect(gauge.get()).toBe(-10);
  });

  it("increments", () => {
    gauge.set(10);
    gauge.increment(5);
    expect(gauge.get()).toBe(15);
  });

  it("decrements", () => {
    gauge.set(10);
    gauge.decrement(3);
    expect(gauge.get()).toBe(7);
  });

  it("default increment is 1", () => {
    gauge.increment();
    expect(gauge.get()).toBe(1);
  });

  it("default decrement is 1", () => {
    gauge.set(5);
    gauge.decrement();
    expect(gauge.get()).toBe(4);
  });

  it("resets", () => {
    gauge.set(99);
    gauge.reset();
    expect(gauge.get()).toBe(0);
  });

  it("tracks min and max when enabled", () => {
    const g = new Gauge({ name: "mm_gauge", help: "MinMax", trackMinMax: true });
    g.set(10);
    g.set(5);
    g.set(20);
    expect(g.getMin()).toBe(5);
    expect(g.getMax()).toBe(20);
  });

  it("setToElapsedTime sets positive value", async () => {
    const start = Date.now() - 100;
    gauge.setToElapsedTime(start);
    expect(gauge.get()).toBeGreaterThanOrEqual(100);
  });

  it("times an async function", async () => {
    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    await gauge.time(() => delay(10));
    expect(gauge.get()).toBeGreaterThanOrEqual(10);
  });

  it("supports labels", () => {
    const g = new Gauge({ name: "cpu", help: "CPU", labelNames: ["core"] });
    g.set(0.5, { core: "0" });
    g.set(0.9, { core: "1" });
    expect(g.get({ core: "0" })).toBe(0.5);
    expect(g.get({ core: "1" })).toBe(0.9);
  });

  it("collects metric family", () => {
    gauge.set(7);
    const family = gauge.collect();
    expect(family.type).toBe("gauge");
    expect(family.samples[0]?.value).toBe(7);
  });
});

// ─── Histogram tests ──────────────────────────────────────────────────────────

describe("Histogram", () => {
  let hist: Histogram;

  beforeEach(() => {
    hist = new Histogram({
      name: "test_hist",
      help: "A test histogram",
      buckets: [1, 5, 10, 50, 100],
    });
  });

  it("starts with count=0 and sum=0", () => {
    expect(hist.getCount()).toBe(0);
    expect(hist.getSum()).toBe(0);
  });

  it("observes values and updates count and sum", () => {
    hist.observe(3);
    hist.observe(7);
    expect(hist.getCount()).toBe(2);
    expect(hist.getSum()).toBe(10);
  });

  it("calculates average", () => {
    hist.observe(4);
    hist.observe(6);
    expect(hist.getAverage()).toBe(5);
  });

  it("returns zero average with no observations", () => {
    expect(hist.getAverage()).toBe(0);
  });

  it("bucket counts are cumulative", () => {
    hist.observe(3);  // falls in <=5, <=10, <=50, <=100, +Inf
    hist.observe(6);  // falls in <=10, <=50, <=100, +Inf
    hist.observe(20); // falls in <=50, <=100, +Inf

    const buckets = hist.getBucketCounts();
    expect(buckets.get(1)).toBe(0);
    expect(buckets.get(5)).toBe(1);  // only 3 <= 5
    expect(buckets.get(10)).toBe(2); // 3 and 6 <= 10
    expect(buckets.get(50)).toBe(3); // all <= 50
    expect(buckets.get(100)).toBe(3);
    expect(buckets.get(Infinity)).toBe(3);
  });

  it("calculates percentiles", () => {
    for (let i = 1; i <= 100; i++) {
      hist.observe(i);
    }
    expect(hist.p50()).toBeGreaterThan(0);
    expect(hist.p90()).toBeGreaterThan(hist.p50());
    expect(hist.p99()).toBeGreaterThan(hist.p90());
  });

  it("uses default buckets when none specified", () => {
    const h = new Histogram({ name: "default_hist", help: "Default" });
    expect(h.getBuckets().length).toBeGreaterThan(0);
  });

  it("resets all data", () => {
    hist.observe(5);
    hist.reset();
    expect(hist.getCount()).toBe(0);
    expect(hist.getSum()).toBe(0);
  });

  it("times a synchronous function in seconds", () => {
    const result = hist.timeSync(() => {
      let n = 0;
      for (let i = 0; i < 1000; i++) n += i;
      return n;
    });
    expect(result).toBe(499500);
    expect(hist.getCount()).toBe(1);
    expect(hist.getSum()).toBeGreaterThanOrEqual(0);
  });

  it("times an async function", async () => {
    await hist.time(async () => {
      await new Promise<void>(r => setTimeout(r, 5));
    });
    expect(hist.getCount()).toBe(1);
  });

  it("collects prometheus-compatible samples", () => {
    hist.observe(3);
    hist.observe(7);
    const family = hist.collect();
    expect(family.type).toBe("histogram");

    const bucketSamples = family.samples.filter(s => s.name.endsWith("_bucket"));
    const sumSample = family.samples.find(s => s.name.endsWith("_sum"));
    const countSample = family.samples.find(s => s.name.endsWith("_count"));

    expect(bucketSamples.length).toBeGreaterThan(0);
    expect(sumSample?.value).toBe(10);
    expect(countSample?.value).toBe(2);

    // +Inf bucket always present
    const infBucket = bucketSamples.find(s => s.labels["le"] === "+Inf");
    expect(infBucket?.value).toBe(2);
  });

  it("supports labels", () => {
    const h = new Histogram({ name: "req_dur", help: "Duration", labelNames: ["route"] });
    h.observe(0.1, { route: "/api/health" });
    h.observe(0.5, { route: "/api/nodes" });
    expect(h.getCount({ route: "/api/health" })).toBe(1);
    expect(h.getCount({ route: "/api/nodes" })).toBe(1);
  });
});

// ─── MetricRegistry tests ─────────────────────────────────────────────────────

describe("MetricRegistry", () => {
  let registry: MetricRegistry;

  beforeEach(() => {
    MetricRegistry.resetInstance();
    registry = MetricRegistry.getInstance();
  });

  it("is a singleton", () => {
    const a = MetricRegistry.getInstance();
    const b = MetricRegistry.getInstance();
    expect(a).toBe(b);
  });

  it("registers and retrieves metrics", () => {
    const counter = new Counter({ name: "my_counter", help: "test" });
    registry.register(counter);
    expect(registry.get("my_counter")).toBe(counter);
  });

  it("throws on duplicate registration", () => {
    const c = new Counter({ name: "dup", help: "test" });
    registry.register(c);
    expect(() => registry.register(new Counter({ name: "dup", help: "test" }))).toThrow();
  });

  it("registerOrReplace overwrites", () => {
    const c1 = new Counter({ name: "x", help: "first" });
    const c2 = new Counter({ name: "x", help: "second" });
    registry.register(c1);
    registry.registerOrReplace(c2);
    expect(registry.get("x")).toBe(c2);
  });

  it("has() checks existence", () => {
    registry.register(new Counter({ name: "exists", help: "test" }));
    expect(registry.has("exists")).toBe(true);
    expect(registry.has("missing")).toBe(false);
  });

  it("unregister removes metric", () => {
    registry.register(new Counter({ name: "to_remove", help: "test" }));
    expect(registry.unregister("to_remove")).toBe(true);
    expect(registry.has("to_remove")).toBe(false);
  });

  it("collects all metrics", () => {
    registry.register(new Counter({ name: "c1", help: "c1" }));
    registry.register(new Gauge({ name: "g1", help: "g1" }));
    const families = registry.collect();
    expect(families).toHaveLength(2);
  });

  it("exports prometheus format", () => {
    const counter = new Counter({ name: "prom_test", help: "Prometheus test" });
    counter.increment(3);
    registry.register(counter);

    const output = registry.exportPrometheus();
    expect(output).toContain("# HELP prom_test");
    expect(output).toContain("# TYPE prom_test counter");
    expect(output).toContain("prom_test_total");
    expect(output).toContain("3");
  });

  it("exports JSON format", () => {
    const gauge = new Gauge({ name: "json_gauge", help: "JSON gauge" });
    gauge.set(42);
    registry.register(gauge);

    const json = registry.exportJSON();
    expect(json.metrics).toHaveLength(1);
    expect(json.metrics[0]?.name).toBe("json_gauge");
    expect(json.metrics[0]?.type).toBe("gauge");
    expect(json.timestamp).toBeGreaterThan(0);
  });

  it("creates metric families for grouping", () => {
    registry.register(new Counter({ name: "req_count", help: "count" }));
    registry.register(new Gauge({ name: "req_active", help: "active" }));
    registry.createFamily("requests", ["req_count", "req_active"]);

    const familyMetrics = registry.getFamily("requests");
    expect(familyMetrics).toHaveLength(2);
  });

  it("clears all metrics", () => {
    registry.register(new Counter({ name: "temp", help: "temp" }));
    registry.clear();
    expect(registry.getNames()).toHaveLength(0);
  });

  it("factory functions register and return metrics", () => {
    const c = createCounter(registry, "factory_counter", "Factory counter");
    const g = createGauge(registry, "factory_gauge", "Factory gauge");
    const h = createHistogram(registry, "factory_hist", "Factory histogram");

    expect(registry.has("factory_counter")).toBe(true);
    expect(registry.has("factory_gauge")).toBe(true);
    expect(registry.has("factory_hist")).toBe(true);

    c.increment(5);
    g.set(3.14);
    h.observe(0.1);

    expect(c.get()).toBe(5);
    expect(g.get()).toBe(3.14);
    expect(h.getCount()).toBe(1);
  });

  it("exportSummary returns flat key-value map", () => {
    const c = new Counter({ name: "summary_c", help: "test" });
    c.increment(7);
    registry.register(c);

    const summary = registry.exportSummary();
    expect(typeof summary).toBe("object");
    const keys = Object.keys(summary);
    expect(keys.some(k => k.includes("summary_c"))).toBe(true);
  });
});
