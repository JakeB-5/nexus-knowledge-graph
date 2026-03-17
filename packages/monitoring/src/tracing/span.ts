// Span: represents a single unit of work in a distributed trace
import type {
  AttributeValue,
  SpanContext,
  SpanEvent,
  SpanKind,
  SpanLink,
  SpanStatusCode,
  TraceSpan,
} from "../types.js";

export interface SpanOptions {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  kind?: SpanKind;
  attributes?: Record<string, AttributeValue>;
  links?: SpanLink[];
  startTime?: number;
  resource?: Record<string, AttributeValue>;
}

export class Span {
  private readonly _traceId: string;
  private readonly _spanId: string;
  private readonly _parentSpanId: string | undefined;
  private readonly _name: string;
  private readonly _kind: SpanKind;
  private readonly _startTime: number;
  private _endTime: number | undefined;
  private _status: { code: SpanStatusCode; message?: string } = { code: "unset" };
  private readonly _attributes: Map<string, AttributeValue>;
  private readonly _events: SpanEvent[] = [];
  private readonly _links: SpanLink[];
  private readonly _resource: Record<string, AttributeValue>;
  private _ended = false;

  constructor(options: SpanOptions) {
    this._traceId = options.traceId;
    this._spanId = options.spanId;
    this._parentSpanId = options.parentSpanId;
    this._name = options.name;
    this._kind = options.kind ?? "internal";
    this._startTime = options.startTime ?? Date.now();
    this._attributes = new Map(Object.entries(options.attributes ?? {}));
    this._links = options.links ? [...options.links] : [];
    this._resource = options.resource ?? {};
  }

  // ─── Identification ───────────────────────────────────────────────────────

  get traceId(): string { return this._traceId; }
  get spanId(): string { return this._spanId; }
  get parentSpanId(): string | undefined { return this._parentSpanId; }
  get name(): string { return this._name; }
  get kind(): SpanKind { return this._kind; }
  get startTime(): number { return this._startTime; }
  get endTime(): number | undefined { return this._endTime; }
  get ended(): boolean { return this._ended; }

  get duration(): number | undefined {
    if (this._endTime === undefined) return undefined;
    return this._endTime - this._startTime;
  }

  get status(): { code: SpanStatusCode; message?: string } {
    return { ...this._status };
  }

  get spanContext(): SpanContext {
    return {
      traceId: this._traceId,
      spanId: this._spanId,
      traceFlags: 1, // sampled
    };
  }

  // ─── Attributes ───────────────────────────────────────────────────────────

  /**
   * Set a single attribute on this span.
   * Attributes set after the span has ended are silently ignored.
   */
  setAttribute(key: string, value: AttributeValue): this {
    if (!this._ended) {
      this._attributes.set(key, value);
    }
    return this;
  }

  /**
   * Set multiple attributes at once.
   */
  setAttributes(attributes: Record<string, AttributeValue>): this {
    if (!this._ended) {
      for (const [k, v] of Object.entries(attributes)) {
        this._attributes.set(k, v);
      }
    }
    return this;
  }

  /**
   * Get a specific attribute value.
   */
  getAttribute(key: string): AttributeValue | undefined {
    return this._attributes.get(key);
  }

  /**
   * Get all attributes as a plain object.
   */
  getAttributes(): Record<string, AttributeValue> {
    return Object.fromEntries(this._attributes);
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  /**
   * Add a named event to the span timeline.
   */
  addEvent(name: string, attributes?: Record<string, AttributeValue>, timestamp?: number): this {
    if (!this._ended) {
      this._events.push({
        name,
        timestamp: timestamp ?? Date.now(),
        attributes,
      });
    }
    return this;
  }

  /**
   * Record an exception as a span event with standard attributes.
   */
  recordException(error: Error, attributes?: Record<string, AttributeValue>): this {
    return this.addEvent("exception", {
      "exception.type": error.name,
      "exception.message": error.message,
      "exception.stacktrace": error.stack ?? "",
      ...attributes,
    });
  }

  getEvents(): SpanEvent[] {
    return [...this._events];
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  /**
   * Set the span status. Once set to "error" or "ok", it cannot be set back to "unset".
   */
  setStatus(code: SpanStatusCode, message?: string): this {
    if (!this._ended) {
      // ok and error override unset; error overrides ok
      if (
        this._status.code === "unset" ||
        (this._status.code === "ok" && code === "error")
      ) {
        this._status = { code, message };
      }
    }
    return this;
  }

  // ─── Links ────────────────────────────────────────────────────────────────

  /**
   * Add a link to another span (e.g. a causally related span in another trace).
   */
  addLink(link: SpanLink): this {
    if (!this._ended) {
      this._links.push(link);
    }
    return this;
  }

  getLinks(): SpanLink[] {
    return [...this._links];
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * End the span. Subsequent mutations are silently ignored.
   * Optionally override the end time.
   */
  end(endTime?: number): void {
    if (this._ended) return;
    this._endTime = endTime ?? Date.now();
    this._ended = true;
  }

  /**
   * End the span with an error status and optionally record the exception.
   */
  endWithError(error: Error, endTime?: number): void {
    this.recordException(error);
    this.setStatus("error", error.message);
    this.end(endTime);
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  /**
   * Serialize the span to the shared TraceSpan interface for export.
   */
  toJSON(): TraceSpan {
    return {
      traceId: this._traceId,
      spanId: this._spanId,
      parentSpanId: this._parentSpanId,
      name: this._name,
      kind: this._kind,
      startTime: this._startTime,
      endTime: this._endTime,
      duration: this.duration,
      status: { ...this._status },
      attributes: this.getAttributes(),
      events: this.getEvents(),
      links: this.getLinks(),
      resource: { ...this._resource },
    };
  }

  /**
   * Check if this span is the root span of a trace.
   */
  isRootSpan(): boolean {
    return this._parentSpanId === undefined;
  }

  /**
   * Check if this span is a child of another span.
   */
  isChildOf(parentSpanId: string): boolean {
    return this._parentSpanId === parentSpanId;
  }
}

/**
 * A no-op span that records nothing. Used when tracing is disabled or sampling drops a trace.
 */
export class NoOpSpan extends Span {
  constructor(traceId: string, spanId: string) {
    super({ name: "noop", traceId, spanId });
  }

  override setAttribute(_key: string, _value: AttributeValue): this { return this; }
  override setAttributes(_attributes: Record<string, AttributeValue>): this { return this; }
  override addEvent(_name: string): this { return this; }
  override recordException(_error: Error): this { return this; }
  override setStatus(_code: SpanStatusCode): this { return this; }
  override addLink(_link: SpanLink): this { return this; }
  override end(): void { /* no-op */ }
  override endWithError(): void { /* no-op */ }
}
