import { describe, it, expect, beforeEach, vi } from "vitest";
import { Span, NoOpSpan } from "../tracing/span.js";
import { TraceContext } from "../tracing/context.js";
import { Tracer, generateTraceId, generateSpanId } from "../tracing/tracer.js";
import {
  ConsoleExporter,
  InMemoryExporter,
  JSONExporter,
  BatchExporter,
} from "../tracing/exporter.js";
import { ExportResultCode } from "../types.js";

// ─── Span tests ───────────────────────────────────────────────────────────────

describe("Span", () => {
  let span: Span;

  beforeEach(() => {
    span = new Span({
      name: "test.operation",
      traceId: "aaaa" + "0".repeat(28),
      spanId: "bbbb" + "0".repeat(12),
    });
  });

  it("has correct initial state", () => {
    expect(span.name).toBe("test.operation");
    expect(span.status.code).toBe("unset");
    expect(span.ended).toBe(false);
    expect(span.endTime).toBeUndefined();
    expect(span.duration).toBeUndefined();
  });

  it("identifies as root span when no parent", () => {
    expect(span.isRootSpan()).toBe(true);
  });

  it("identifies as child span when parent set", () => {
    const child = new Span({
      name: "child",
      traceId: span.traceId,
      spanId: "cccc" + "0".repeat(12),
      parentSpanId: span.spanId,
    });
    expect(child.isRootSpan()).toBe(false);
    expect(child.isChildOf(span.spanId)).toBe(true);
  });

  it("sets and gets attributes", () => {
    span.setAttribute("http.method", "GET");
    span.setAttribute("http.status_code", 200);
    expect(span.getAttribute("http.method")).toBe("GET");
    expect(span.getAttribute("http.status_code")).toBe(200);
  });

  it("sets multiple attributes at once", () => {
    span.setAttributes({ "db.type": "postgres", "db.rows": 42 });
    expect(span.getAttribute("db.type")).toBe("postgres");
    expect(span.getAttribute("db.rows")).toBe(42);
  });

  it("adds events with timestamps", () => {
    span.addEvent("cache.miss", { key: "user:123" });
    const events = span.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("cache.miss");
    expect(events[0]?.attributes?.["key"]).toBe("user:123");
    expect(events[0]?.timestamp).toBeGreaterThan(0);
  });

  it("records exceptions as events", () => {
    const error = new Error("Something broke");
    span.recordException(error);
    const events = span.getEvents();
    expect(events[0]?.name).toBe("exception");
    expect(events[0]?.attributes?.["exception.message"]).toBe("Something broke");
    expect(events[0]?.attributes?.["exception.type"]).toBe("Error");
  });

  it("sets status to ok", () => {
    span.setStatus("ok");
    expect(span.status.code).toBe("ok");
  });

  it("sets status to error with message", () => {
    span.setStatus("error", "DB connection failed");
    expect(span.status.code).toBe("error");
    expect(span.status.message).toBe("DB connection failed");
  });

  it("error status cannot be overridden by ok", () => {
    span.setStatus("error");
    span.setStatus("ok");
    expect(span.status.code).toBe("error");
  });

  it("ends with duration calculation", () => {
    const now = Date.now();
    span.end(now + 100);
    expect(span.ended).toBe(true);
    expect(span.duration).toBeGreaterThanOrEqual(0);
  });

  it("ignores mutations after end", () => {
    span.end();
    span.setAttribute("late", "value");
    span.addEvent("late.event");
    expect(span.getAttribute("late")).toBeUndefined();
    expect(span.getEvents()).toHaveLength(0);
  });

  it("endWithError sets error status and records exception", () => {
    const error = new Error("Fatal");
    span.endWithError(error);
    expect(span.status.code).toBe("error");
    expect(span.status.message).toBe("Fatal");
    const events = span.getEvents();
    expect(events.some(e => e.name === "exception")).toBe(true);
  });

  it("serializes to JSON", () => {
    span.setAttribute("key", "value");
    span.end();
    const json = span.toJSON();

    expect(json.name).toBe("test.operation");
    expect(json.traceId).toBeTruthy();
    expect(json.spanId).toBeTruthy();
    expect(json.attributes["key"]).toBe("value");
    expect(json.endTime).toBeDefined();
    expect(json.duration).toBeDefined();
  });

  it("adds links to other spans", () => {
    const ctx = { traceId: "x".repeat(32), spanId: "y".repeat(16), traceFlags: 1 };
    span.addLink({ context: ctx, attributes: { "link.type": "follows_from" } });
    expect(span.getLinks()).toHaveLength(1);
  });
});

describe("NoOpSpan", () => {
  it("silently ignores all mutations", () => {
    const noop = new NoOpSpan("a".repeat(32), "b".repeat(16));
    noop.setAttribute("key", "value");
    noop.addEvent("test");
    noop.setStatus("error");
    noop.end();
    // No errors thrown, nothing recorded
    expect(noop.getAttribute("key")).toBeUndefined();
  });
});

// ─── TraceContext tests ───────────────────────────────────────────────────────

describe("TraceContext", () => {
  it("returns null when no active span", () => {
    expect(TraceContext.getCurrentSpan()).toBeNull();
  });

  it("propagates span via runWithSpan", () => {
    const span = new Span({ name: "ctx.test", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    let captured: Span | null = null;

    TraceContext.runWithSpan(span, () => {
      captured = TraceContext.getCurrentSpan();
    });

    expect(captured).toBe(span);
    expect(TraceContext.getCurrentSpan()).toBeNull(); // restored after
  });

  it("propagates span via runWithSpanAsync", async () => {
    const span = new Span({ name: "async.ctx", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    let captured: Span | null = null;

    await TraceContext.runWithSpanAsync(span, async () => {
      await new Promise<void>(r => setTimeout(r, 1));
      captured = TraceContext.getCurrentSpan();
    });

    expect(captured).toBe(span);
  });

  it("injects W3C traceparent header", () => {
    const span = new Span({ name: "inject", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    TraceContext.runWithSpan(span, () => {
      const headers = TraceContext.inject();
      expect(headers.traceparent).toBeDefined();
      expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });
  });

  it("extracts W3C traceparent header", () => {
    const traceId = "a".repeat(32);
    const spanId = "b".repeat(16);
    const ctx = TraceContext.extract({ traceparent: `00-${traceId}-${spanId}-01` });
    expect(ctx).not.toBeNull();
    expect(ctx?.traceId).toBe(traceId);
    expect(ctx?.spanId).toBe(spanId);
    expect(ctx?.traceFlags).toBe(1);
    expect(ctx?.isRemote).toBe(true);
  });

  it("returns null for malformed traceparent", () => {
    expect(TraceContext.extract({ traceparent: "invalid" })).toBeNull();
    expect(TraceContext.extract({})).toBeNull();
  });

  it("supports baggage propagation", () => {
    const span = new Span({ name: "baggage", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    TraceContext.runWithSpan(span, () => {
      TraceContext.setBaggage("user_id", "42");
      expect(TraceContext.getBaggage("user_id")).toBe("42");
      expect(TraceContext.getAllBaggage()).toEqual({ user_id: "42" });
    });
  });

  it("isActive returns false outside context", () => {
    expect(TraceContext.isActive()).toBe(false);
  });

  it("isActive returns true inside context", () => {
    const span = new Span({ name: "active", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    TraceContext.runWithSpan(span, () => {
      expect(TraceContext.isActive()).toBe(true);
    });
  });
});

// ─── Tracer tests ─────────────────────────────────────────────────────────────

describe("Tracer", () => {
  let exporter: InMemoryExporter;
  let tracer: Tracer;

  beforeEach(() => {
    exporter = new InMemoryExporter();
    tracer = new Tracer({ serviceName: "test-service", exporters: [exporter] });
  });

  it("generates valid trace IDs", () => {
    const id = generateTraceId();
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("generates valid span IDs", () => {
    const id = generateSpanId();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("starts and ends spans", () => {
    const span = tracer.startSpan({ name: "op" });
    expect(span.ended).toBe(false);
    tracer.endSpan(span);
    expect(span.ended).toBe(true);
    expect(exporter.size).toBe(1);
  });

  it("starts root span with new trace ID", () => {
    const span = tracer.startRootSpan({ name: "root" });
    expect(span.isRootSpan()).toBe(true);
    tracer.endSpan(span);
  });

  it("creates child span inheriting traceId", () => {
    const parent = tracer.startSpan({ name: "parent" });
    const child = tracer.startSpan({ name: "child", parent });
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    tracer.endSpan(child);
    tracer.endSpan(parent);
    expect(exporter.size).toBe(2);
  });

  it("trace() automatically ends span on success", () => {
    const result = tracer.trace("sync.op", (span) => {
      span.setAttribute("key", "value");
      return 42;
    });
    expect(result).toBe(42);
    expect(exporter.size).toBe(1);
    expect(exporter.getSpans()[0]?.status.code).toBe("ok");
  });

  it("trace() automatically ends span with error on throw", () => {
    expect(() => {
      tracer.trace("failing.op", () => {
        throw new Error("Oops");
      });
    }).toThrow("Oops");
    expect(exporter.size).toBe(1);
    expect(exporter.getSpans()[0]?.status.code).toBe("error");
  });

  it("traceAsync() works with async functions", async () => {
    const result = await tracer.traceAsync("async.op", async () => {
      await new Promise<void>(r => setTimeout(r, 1));
      return "done";
    });
    expect(result).toBe("done");
    expect(exporter.size).toBe(1);
  });

  it("traceAsync() records error on rejection", async () => {
    await expect(
      tracer.traceAsync("failing.async", async () => {
        throw new Error("Async failure");
      }),
    ).rejects.toThrow("Async failure");
    expect(exporter.getSpans()[0]?.status.code).toBe("error");
  });

  it("getActiveSpans returns in-flight spans", () => {
    const s1 = tracer.startSpan({ name: "s1" });
    const s2 = tracer.startSpan({ name: "s2" });
    expect(tracer.getActiveSpanCount()).toBe(2);
    tracer.endSpan(s1);
    expect(tracer.getActiveSpanCount()).toBe(1);
    tracer.endSpan(s2);
  });

  it("flush and shutdown call exporter methods", async () => {
    await tracer.flush();
    await tracer.shutdown();
    // No errors thrown
  });
});

// ─── Exporter tests ───────────────────────────────────────────────────────────

describe("InMemoryExporter", () => {
  it("stores exported spans", () => {
    const exporter = new InMemoryExporter();
    const span = new Span({ name: "test", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    span.end();
    const result = exporter.export([span.toJSON()]);
    expect(result.code).toBe(ExportResultCode.Success);
    expect(exporter.size).toBe(1);
  });

  it("filters by status code", () => {
    const exporter = new InMemoryExporter({ filter: { statusCodes: ["error"] } });
    const ok = new Span({ name: "ok", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    ok.setStatus("ok");
    ok.end();
    const err = new Span({ name: "err", traceId: "a".repeat(32), spanId: "c".repeat(16) });
    err.setStatus("error");
    err.end();

    exporter.export([ok.toJSON(), err.toJSON()]);
    expect(exporter.size).toBe(1);
    expect(exporter.getSpans()[0]?.name).toBe("err");
  });

  it("gets spans by name", () => {
    const exporter = new InMemoryExporter();
    const s1 = new Span({ name: "alpha", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    s1.end();
    const s2 = new Span({ name: "beta", traceId: "a".repeat(32), spanId: "c".repeat(16) });
    s2.end();
    exporter.export([s1.toJSON(), s2.toJSON()]);
    expect(exporter.getSpansByName("alpha")).toHaveLength(1);
  });

  it("clears spans", () => {
    const exporter = new InMemoryExporter();
    const s = new Span({ name: "s", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    s.end();
    exporter.export([s.toJSON()]);
    exporter.clear();
    expect(exporter.size).toBe(0);
  });

  it("respects maxSize by dropping oldest", () => {
    const exporter = new InMemoryExporter({ maxSize: 2 });
    for (let i = 0; i < 5; i++) {
      const s = new Span({ name: `s${i}`, traceId: "a".repeat(32), spanId: `${i}`.padStart(16, "0") });
      s.end();
      exporter.export([s.toJSON()]);
    }
    expect(exporter.size).toBe(2);
  });
});

describe("ConsoleExporter", () => {
  it("exports without throwing", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exporter = new ConsoleExporter();
    const span = new Span({ name: "console.test", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    span.setAttribute("key", "val");
    span.end();
    const result = exporter.export([span.toJSON()]);
    expect(result.code).toBe(ExportResultCode.Success);
    consoleSpy.mockRestore();
  });
});

describe("JSONExporter", () => {
  it("calls onBatch with JSON string", () => {
    const batches: string[] = [];
    const exporter = new JSONExporter({ onBatch: json => { batches.push(json); } });
    const span = new Span({ name: "json.test", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    span.end();
    exporter.export([span.toJSON()]);
    expect(batches).toHaveLength(1);
    const parsed = JSON.parse(batches[0]!) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
  });
});

describe("BatchExporter", () => {
  it("buffers spans and flushes on flush()", async () => {
    const inner = new InMemoryExporter();
    const batch = new BatchExporter({
      delegate: inner,
      maxBatchSize: 100,
      scheduledDelayMs: 60_000, // long delay — won't auto-flush in test
    });

    const span = new Span({ name: "batched", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    span.end();
    batch.export([span.toJSON()]);
    expect(inner.size).toBe(0); // not flushed yet

    await batch.flush();
    expect(inner.size).toBe(1);
  });

  it("auto-flushes when maxBatchSize is reached", async () => {
    const inner = new InMemoryExporter();
    const batch = new BatchExporter({
      delegate: inner,
      maxBatchSize: 3,
      scheduledDelayMs: 60_000,
    });

    for (let i = 0; i < 3; i++) {
      const s = new Span({ name: `s${i}`, traceId: "a".repeat(32), spanId: `${i}`.padStart(16, "0") });
      s.end();
      batch.export([s.toJSON()]);
    }

    // Give microtasks a chance to run
    await new Promise<void>(r => setTimeout(r, 10));
    expect(inner.size).toBeGreaterThanOrEqual(3);
  });
});
