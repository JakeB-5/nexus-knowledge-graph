// SpanExporter implementations: console, in-memory, JSON, and batch
import type { ExportResult, ExportResultCode as _ExportResultCode, TraceSpan } from "../types.js";
import { ExportResultCode } from "../types.js";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface SpanExporter {
  /** Export a batch of spans. */
  export(spans: TraceSpan[]): ExportResult;
  /** Flush any buffered spans. */
  flush?(): Promise<void>;
  /** Shut down gracefully. */
  shutdown?(): Promise<void>;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export interface ExportFilter {
  /** Only export spans with status matching these codes */
  statusCodes?: Array<"unset" | "ok" | "error">;
  /** Only export spans with duration >= minDurationMs */
  minDurationMs?: number;
  /** Only export spans with duration <= maxDurationMs */
  maxDurationMs?: number;
  /** Only export spans whose name matches this pattern */
  namePattern?: RegExp;
}

function matchesFilter(span: TraceSpan, filter: ExportFilter): boolean {
  if (filter.statusCodes && !filter.statusCodes.includes(span.status.code)) {
    return false;
  }
  if (filter.minDurationMs !== undefined && (span.duration ?? 0) < filter.minDurationMs) {
    return false;
  }
  if (filter.maxDurationMs !== undefined && (span.duration ?? Infinity) > filter.maxDurationMs) {
    return false;
  }
  if (filter.namePattern && !filter.namePattern.test(span.name)) {
    return false;
  }
  return true;
}

// ─── ConsoleExporter ─────────────────────────────────────────────────────────

export interface ConsoleExporterOptions {
  filter?: ExportFilter;
  /** Whether to include attributes in output (default: true) */
  showAttributes?: boolean;
  /** Whether to include events in output (default: true) */
  showEvents?: boolean;
  /** Prefix for log lines */
  prefix?: string;
}

export class ConsoleExporter implements SpanExporter {
  private readonly options: Required<Omit<ConsoleExporterOptions, "filter">> & { filter?: ExportFilter };

  constructor(options: ConsoleExporterOptions = {}) {
    this.options = {
      showAttributes: options.showAttributes ?? true,
      showEvents: options.showEvents ?? true,
      prefix: options.prefix ?? "[Trace]",
      filter: options.filter,
    };
  }

  export(spans: TraceSpan[]): ExportResult {
    try {
      const filtered = this.options.filter
        ? spans.filter(s => matchesFilter(s, this.options.filter!))
        : spans;

      for (const span of filtered) {
        this.printSpan(span);
      }
      return { code: ExportResultCode.Success };
    } catch (error) {
      return { code: ExportResultCode.Failed, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  private printSpan(span: TraceSpan): void {
    const { prefix } = this.options;
    const duration = span.duration != null ? `${span.duration}ms` : "in-flight";
    const status = span.status.code;
    const parent = span.parentSpanId ? `← ${span.parentSpanId.slice(0, 8)}` : "root";

    console.log(`${prefix} ${span.name} [${status}] ${duration} | trace=${span.traceId.slice(0, 8)} span=${span.spanId.slice(0, 8)} ${parent}`);

    if (this.options.showAttributes && Object.keys(span.attributes).length > 0) {
      console.log(`${prefix}   attributes:`, span.attributes);
    }

    if (this.options.showEvents && span.events.length > 0) {
      for (const event of span.events) {
        console.log(`${prefix}   event: ${event.name} @${event.timestamp}`, event.attributes ?? "");
      }
    }

    if (span.status.message) {
      console.log(`${prefix}   status message: ${span.status.message}`);
    }
  }

  async flush(): Promise<void> { /* no buffering */ }
  async shutdown(): Promise<void> { /* no-op */ }
}

// ─── InMemoryExporter ─────────────────────────────────────────────────────────

export interface InMemoryExporterOptions {
  filter?: ExportFilter;
  /** Maximum spans to retain (oldest are dropped when full) */
  maxSize?: number;
}

export class InMemoryExporter implements SpanExporter {
  private readonly spans: TraceSpan[] = [];
  private readonly filter?: ExportFilter;
  private readonly maxSize: number;

  constructor(options: InMemoryExporterOptions = {}) {
    this.filter = options.filter;
    this.maxSize = options.maxSize ?? 10_000;
  }

  export(spans: TraceSpan[]): ExportResult {
    try {
      const filtered = this.filter
        ? spans.filter(s => matchesFilter(s, this.filter!))
        : spans;

      for (const span of filtered) {
        if (this.spans.length >= this.maxSize) {
          this.spans.shift(); // drop oldest
        }
        this.spans.push(span);
      }
      return { code: ExportResultCode.Success };
    } catch (error) {
      return { code: ExportResultCode.Failed, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  /** Get all retained spans */
  getSpans(): TraceSpan[] {
    return [...this.spans];
  }

  /** Get spans matching a filter */
  getSpansWhere(predicate: (span: TraceSpan) => boolean): TraceSpan[] {
    return this.spans.filter(predicate);
  }

  /** Get all spans belonging to a specific trace */
  getTrace(traceId: string): TraceSpan[] {
    return this.spans.filter(s => s.traceId === traceId);
  }

  /** Get spans for a specific operation name */
  getSpansByName(name: string): TraceSpan[] {
    return this.spans.filter(s => s.name === name);
  }

  /** Clear all retained spans */
  clear(): void {
    this.spans.length = 0;
  }

  get size(): number {
    return this.spans.length;
  }

  async flush(): Promise<void> { /* no buffering */ }
  async shutdown(): Promise<void> { this.clear(); }
}

// ─── JSONExporter ─────────────────────────────────────────────────────────────

export interface JSONExporterOptions {
  filter?: ExportFilter;
  /** Called with each JSON-serialized batch */
  onBatch: (json: string) => void | Promise<void>;
  /** Whether to pretty-print JSON (default: false) */
  pretty?: boolean;
}

export class JSONExporter implements SpanExporter {
  private readonly filter?: ExportFilter;
  private readonly onBatch: (json: string) => void | Promise<void>;
  private readonly pretty: boolean;

  constructor(options: JSONExporterOptions) {
    this.filter = options.filter;
    this.onBatch = options.onBatch;
    this.pretty = options.pretty ?? false;
  }

  export(spans: TraceSpan[]): ExportResult {
    try {
      const filtered = this.filter
        ? spans.filter(s => matchesFilter(s, this.filter!))
        : spans;

      if (filtered.length === 0) return { code: ExportResultCode.Success };

      const json = this.pretty
        ? JSON.stringify(filtered, null, 2)
        : JSON.stringify(filtered);

      const result = this.onBatch(json);
      if (result instanceof Promise) {
        result.catch(() => { /* fire-and-forget errors are swallowed */ });
      }
      return { code: ExportResultCode.Success };
    } catch (error) {
      return { code: ExportResultCode.Failed, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  async flush(): Promise<void> { /* no buffering */ }
  async shutdown(): Promise<void> { /* no-op */ }
}

// ─── BatchExporter ────────────────────────────────────────────────────────────

export interface BatchExporterOptions {
  /** Delegate exporter that receives batches */
  delegate: SpanExporter;
  filter?: ExportFilter;
  /** Maximum number of spans to buffer before flushing (default: 512) */
  maxBatchSize?: number;
  /** Maximum time (ms) to wait before flushing (default: 5000) */
  scheduledDelayMs?: number;
  /** Maximum queue size before dropping oldest (default: 2048) */
  maxQueueSize?: number;
}

export class BatchExporter implements SpanExporter {
  private readonly delegate: SpanExporter;
  private readonly filter?: ExportFilter;
  private readonly maxBatchSize: number;
  private readonly scheduledDelayMs: number;
  private readonly maxQueueSize: number;
  private readonly queue: TraceSpan[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdownRequested = false;

  constructor(options: BatchExporterOptions) {
    this.delegate = options.delegate;
    this.filter = options.filter;
    this.maxBatchSize = options.maxBatchSize ?? 512;
    this.scheduledDelayMs = options.scheduledDelayMs ?? 5_000;
    this.maxQueueSize = options.maxQueueSize ?? 2_048;
  }

  export(spans: TraceSpan[]): ExportResult {
    if (this.shutdownRequested) {
      return { code: ExportResultCode.Failed, error: new Error("Exporter is shut down") };
    }

    const filtered = this.filter
      ? spans.filter(s => matchesFilter(s, this.filter!))
      : spans;

    for (const span of filtered) {
      if (this.queue.length >= this.maxQueueSize) {
        this.queue.shift(); // drop oldest
      }
      this.queue.push(span);
    }

    if (this.queue.length >= this.maxBatchSize) {
      void this.doFlush();
    } else {
      this.scheduleFlush();
    }

    return { code: ExportResultCode.Success };
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.doFlush();
    }, this.scheduledDelayMs);
  }

  private async doFlush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.maxBatchSize);
    this.delegate.export(batch);
    if (this.delegate.flush) {
      await this.delegate.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Flush everything in the queue in batches
    while (this.queue.length > 0) {
      await this.doFlush();
    }
  }

  async shutdown(): Promise<void> {
    this.shutdownRequested = true;
    await this.flush();
    await this.delegate.shutdown?.();
  }

  get queueSize(): number {
    return this.queue.length;
  }
}
