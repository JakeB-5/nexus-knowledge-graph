// Tracer: OpenTelemetry-inspired tracing with span lifecycle management
import type { AttributeValue, SpanKind, SpanLink, TraceSpan } from "../types.js";
import { Span, type SpanOptions } from "./span.js";
import { TraceContext } from "./context.js";
import type { SpanExporter } from "./exporter.js";

function generateId(bytes: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < bytes * 2; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

/** Generate a 128-bit (32 hex chars) trace ID */
export function generateTraceId(): string {
  return generateId(16);
}

/** Generate a 64-bit (16 hex chars) span ID */
export function generateSpanId(): string {
  return generateId(8);
}

export interface StartSpanOptions {
  name: string;
  kind?: SpanKind;
  attributes?: Record<string, AttributeValue>;
  links?: SpanLink[];
  startTime?: number;
  /** Explicit parent span context. Defaults to the current active span in context. */
  parent?: Span | null;
}

export interface TracerOptions {
  /** Service name to attach as a resource attribute */
  serviceName?: string;
  /** Service version */
  serviceVersion?: string;
  /** Additional resource attributes */
  resource?: Record<string, AttributeValue>;
  /** Span exporters to send completed spans to */
  exporters?: SpanExporter[];
  /** Sampling rate 0–1 (default 1 = 100%) */
  sampleRate?: number;
}

export class Tracer {
  private readonly serviceName: string;
  private readonly serviceVersion: string;
  private readonly resource: Record<string, AttributeValue>;
  private readonly exporters: SpanExporter[];
  private readonly sampleRate: number;
  private readonly activeSpans: Map<string, Span> = new Map();

  constructor(options: TracerOptions = {}) {
    this.serviceName = options.serviceName ?? "nexus";
    this.serviceVersion = options.serviceVersion ?? "0.1.0";
    this.resource = {
      "service.name": this.serviceName,
      "service.version": this.serviceVersion,
      "telemetry.sdk.name": "@nexus/monitoring",
      "telemetry.sdk.language": "nodejs",
      ...options.resource,
    };
    this.exporters = options.exporters ?? [];
    this.sampleRate = options.sampleRate ?? 1;
  }

  // ─── Span creation ────────────────────────────────────────────────────────

  /**
   * Start a new span. If no parent is provided, uses the current active span
   * from the async context. If neither exist, starts a root span.
   */
  startSpan(options: StartSpanOptions): Span {
    // Sampling decision
    if (this.sampleRate < 1 && Math.random() > this.sampleRate) {
      // Return a no-op span — import NoOpSpan lazily to avoid circular ref
      const { NoOpSpan } = require("./span.js") as { NoOpSpan: typeof import("./span.js").NoOpSpan };
      return new NoOpSpan(generateTraceId(), generateSpanId());
    }

    const parentSpan = options.parent !== undefined
      ? options.parent
      : TraceContext.getCurrentSpan();

    const traceId = parentSpan?.traceId ?? generateTraceId();
    const spanId = generateSpanId();
    const parentSpanId = parentSpan?.spanId;

    const spanOptions: SpanOptions = {
      name: options.name,
      traceId,
      spanId,
      parentSpanId,
      kind: options.kind ?? "internal",
      attributes: options.attributes,
      links: options.links,
      startTime: options.startTime ?? Date.now(),
      resource: this.resource,
    };

    const span = new Span(spanOptions);
    this.activeSpans.set(spanId, span);
    return span;
  }

  /**
   * Start a root span (no parent, new trace).
   */
  startRootSpan(options: Omit<StartSpanOptions, "parent">): Span {
    return this.startSpan({ ...options, parent: null });
  }

  /**
   * End a span, remove from active set, and export it.
   */
  endSpan(span: Span, endTime?: number): void {
    if (!span.ended) {
      span.end(endTime);
    }
    this.activeSpans.delete(span.spanId);
    this.exportSpan(span);
  }

  /**
   * End a span with an error.
   */
  endSpanWithError(span: Span, error: Error): void {
    span.endWithError(error);
    this.activeSpans.delete(span.spanId);
    this.exportSpan(span);
  }

  // ─── High-level instrumentation ───────────────────────────────────────────

  /**
   * Run a synchronous function within a span. The span is automatically
   * ended when the function returns or throws.
   */
  trace<T>(
    name: string,
    fn: (span: Span) => T,
    options?: Omit<StartSpanOptions, "name">,
  ): T {
    const span = this.startSpan({ name, ...options });
    return TraceContext.runWithSpan(span, () => {
      try {
        const result = fn(span);
        span.setStatus("ok");
        this.endSpan(span);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.endSpanWithError(span, error);
        throw err;
      }
    });
  }

  /**
   * Run an async function within a span. The span is automatically
   * ended when the promise resolves or rejects.
   */
  async traceAsync<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: Omit<StartSpanOptions, "name">,
  ): Promise<T> {
    const span = this.startSpan({ name, ...options });
    return TraceContext.runWithSpanAsync(span, async () => {
      try {
        const result = await fn(span);
        span.setStatus("ok");
        this.endSpan(span);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.endSpanWithError(span, error);
        throw err;
      }
    });
  }

  /**
   * Wrap a function so it automatically creates a span every time it is called.
   */
  instrument<Args extends unknown[], R>(
    name: string,
    fn: (...args: Args) => R,
    options?: Omit<StartSpanOptions, "name">,
  ): (...args: Args) => R {
    return (...args: Args): R => {
      return this.trace(name, () => fn(...args), options);
    };
  }

  /**
   * Wrap an async function so it automatically creates a span every time it is called.
   */
  instrumentAsync<Args extends unknown[], R>(
    name: string,
    fn: (...args: Args) => Promise<R>,
    options?: Omit<StartSpanOptions, "name">,
  ): (...args: Args) => Promise<R> {
    return async (...args: Args): Promise<R> => {
      return this.traceAsync(name, () => fn(...args), options);
    };
  }

  // ─── Context helpers ──────────────────────────────────────────────────────

  /**
   * Get the currently active span in this async context.
   */
  getCurrentSpan(): Span | null {
    return TraceContext.getCurrentSpan();
  }

  /**
   * Get the current trace ID, if any.
   */
  getCurrentTraceId(): string | null {
    return TraceContext.getCurrentSpan()?.traceId ?? null;
  }

  // ─── Span retrieval ───────────────────────────────────────────────────────

  /**
   * Get an in-flight span by its span ID.
   */
  getActiveSpan(spanId: string): Span | undefined {
    return this.activeSpans.get(spanId);
  }

  /**
   * Get all currently active (not yet ended) spans.
   */
  getActiveSpans(): Span[] {
    return [...this.activeSpans.values()];
  }

  getActiveSpanCount(): number {
    return this.activeSpans.size;
  }

  // ─── Exporter management ─────────────────────────────────────────────────

  addExporter(exporter: SpanExporter): void {
    this.exporters.push(exporter);
  }

  removeExporter(exporter: SpanExporter): void {
    const idx = this.exporters.indexOf(exporter);
    if (idx !== -1) this.exporters.splice(idx, 1);
  }

  private exportSpan(span: Span): void {
    if (this.exporters.length === 0) return;
    const traceSpan: TraceSpan = span.toJSON();
    for (const exporter of this.exporters) {
      try {
        exporter.export([traceSpan]);
      } catch {
        // Exporter errors must not bubble up and break application code
      }
    }
  }

  /**
   * Flush all exporters (send any buffered spans).
   */
  async flush(): Promise<void> {
    await Promise.all(
      this.exporters.map(e => e.flush?.() ?? Promise.resolve()),
    );
  }

  /**
   * Shut down all exporters gracefully.
   */
  async shutdown(): Promise<void> {
    await this.flush();
    await Promise.all(
      this.exporters.map(e => e.shutdown?.() ?? Promise.resolve()),
    );
    this.exporters.length = 0;
  }

  // ─── ID generation ────────────────────────────────────────────────────────

  static generateTraceId(): string { return generateTraceId(); }
  static generateSpanId(): string { return generateSpanId(); }
}
