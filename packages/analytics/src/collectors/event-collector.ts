// EventCollector: buffered in-memory event collection with deduplication and sampling

export type EventType =
  | "node_view"
  | "node_create"
  | "node_edit"
  | "node_delete"
  | "node_share"
  | "search"
  | "search_click"
  | "login"
  | "logout"
  | "export"
  | "custom";

export interface CollectedEvent {
  id: string;
  type: EventType;
  timestamp: number;
  userId?: string;
  sessionId?: string;
  nodeId?: string;
  properties: Record<string, unknown>;
}

export type FlushHandler = (events: CollectedEvent[]) => void | Promise<void>;

export interface EventCollectorOptions {
  /** Max events in buffer before auto-flush (default: 1000) */
  bufferSize?: number;
  /** Flush interval in ms; 0 = manual only (default: 5000) */
  flushIntervalMs?: number;
  /** Deduplication window in ms (default: 500) */
  dedupeWindowMs?: number;
  /** Sampling rate [0..1] for high-volume events (default: 1.0 = keep all) */
  samplingRate?: number;
  /** Event types to apply sampling to (default: all) */
  sampledEventTypes?: EventType[];
  /** Handler called on flush */
  onFlush?: FlushHandler;
}

export class EventCollector {
  private buffer: CollectedEvent[] = [];
  private readonly bufferSize: number;
  private readonly dedupeWindowMs: number;
  private readonly samplingRate: number;
  private readonly sampledEventTypes: Set<EventType>;
  private readonly onFlush: FlushHandler | null;

  // Deduplication: key → last seen timestamp
  private recentEvents: Map<string, number> = new Map();

  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private _totalCollected = 0;
  private _totalDropped = 0;
  private _totalFlushed = 0;

  constructor(options: EventCollectorOptions = {}) {
    this.bufferSize = options.bufferSize ?? 1000;
    this.dedupeWindowMs = options.dedupeWindowMs ?? 500;
    this.samplingRate = Math.min(1, Math.max(0, options.samplingRate ?? 1.0));
    this.sampledEventTypes = new Set(options.sampledEventTypes ?? []);
    this.onFlush = options.onFlush ?? null;

    const intervalMs = options.flushIntervalMs ?? 5000;
    if (intervalMs > 0) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, intervalMs);
    }
  }

  // ─── Event collection ─────────────────────────────────────────────────────

  /** Collect a single event. Returns true if accepted, false if dropped. */
  collect(event: Omit<CollectedEvent, "id">): boolean {
    // Sampling: probabilistically drop events
    if (this.shouldSample(event.type)) {
      if (Math.random() > this.samplingRate) {
        this._totalDropped++;
        return false;
      }
    }

    // Deduplication: drop if identical event seen within dedupeWindow
    const dedupeKey = this.dedupeKey(event);
    const lastSeen = this.recentEvents.get(dedupeKey);
    if (lastSeen !== undefined && event.timestamp - lastSeen < this.dedupeWindowMs) {
      this._totalDropped++;
      return false;
    }
    this.recentEvents.set(dedupeKey, event.timestamp);

    // Prune old dedupe entries periodically
    if (this.recentEvents.size > 10_000) {
      this.pruneDedupeCache(event.timestamp);
    }

    const full: CollectedEvent = {
      ...event,
      id: generateId(),
    };

    this.buffer.push(full);
    this._totalCollected++;

    // Auto-flush when buffer is full
    if (this.buffer.length >= this.bufferSize) {
      void this.flush();
    }

    return true;
  }

  /** Collect multiple events at once */
  collectBatch(events: Array<Omit<CollectedEvent, "id">>): void {
    for (const e of events) this.collect(e);
  }

  // ─── Convenience methods ──────────────────────────────────────────────────

  nodeView(userId: string, nodeId: string, sessionId?: string, properties: Record<string, unknown> = {}): void {
    this.collect({
      type: "node_view",
      timestamp: Date.now(),
      userId,
      nodeId,
      sessionId,
      properties,
    });
  }

  nodeCreate(userId: string, nodeId: string, properties: Record<string, unknown> = {}): void {
    this.collect({
      type: "node_create",
      timestamp: Date.now(),
      userId,
      nodeId,
      properties,
    });
  }

  nodeEdit(userId: string, nodeId: string, properties: Record<string, unknown> = {}): void {
    this.collect({
      type: "node_edit",
      timestamp: Date.now(),
      userId,
      nodeId,
      properties,
    });
  }

  search(userId: string, query: string, resultCount: number, latencyMs: number, sessionId?: string): void {
    this.collect({
      type: "search",
      timestamp: Date.now(),
      userId,
      sessionId,
      properties: { query, resultCount, latencyMs },
    });
  }

  login(userId: string, sessionId?: string): void {
    this.collect({
      type: "login",
      timestamp: Date.now(),
      userId,
      sessionId,
      properties: {},
    });
  }

  // ─── Flushing ─────────────────────────────────────────────────────────────

  /**
   * Flush the current buffer.
   * Calls onFlush handler if provided, then clears the buffer.
   */
  async flush(): Promise<CollectedEvent[]> {
    if (this.buffer.length === 0) return [];

    const toFlush = [...this.buffer];
    this.buffer = [];
    this._totalFlushed += toFlush.length;

    if (this.onFlush) {
      await this.onFlush(toFlush);
    }

    return toFlush;
  }

  /** Flush synchronously and return events (does not call async handler) */
  flushSync(): CollectedEvent[] {
    const toFlush = [...this.buffer];
    this.buffer = [];
    this._totalFlushed += toFlush.length;
    return toFlush;
  }

  /** Stop the periodic flush timer */
  stop(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  get bufferLength(): number {
    return this.buffer.length;
  }

  get totalCollected(): number {
    return this._totalCollected;
  }

  get totalDropped(): number {
    return this._totalDropped;
  }

  get totalFlushed(): number {
    return this._totalFlushed;
  }

  /** Events currently in buffer (snapshot, not a live reference) */
  peek(): CollectedEvent[] {
    return [...this.buffer];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private shouldSample(type: EventType): boolean {
    if (this.samplingRate >= 1.0) return false;
    return this.sampledEventTypes.size === 0 || this.sampledEventTypes.has(type);
  }

  private dedupeKey(event: Omit<CollectedEvent, "id">): string {
    return `${event.type}|${event.userId ?? ""}|${event.nodeId ?? ""}|${event.sessionId ?? ""}`;
  }

  private pruneDedupeCache(now: number): void {
    for (const [key, ts] of this.recentEvents) {
      if (now - ts > this.dedupeWindowMs * 10) {
        this.recentEvents.delete(key);
      }
    }
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

let _idCounter = 0;

function generateId(): string {
  return `evt-${Date.now()}-${(++_idCounter).toString(36)}`;
}
