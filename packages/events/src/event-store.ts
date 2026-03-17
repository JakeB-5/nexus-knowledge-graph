// InMemoryEventStore: append-only event log with query, stream, snapshot, and compaction

import type {
  Event,
  EventStore,
  EventQuery,
  EventPage,
  Snapshot,
} from "./types.js";

function matchesQuery(event: Event, query: EventQuery): boolean {
  if (query.types && query.types.length > 0) {
    if (!query.types.includes(event.type)) return false;
  }
  if (query.source && event.source !== query.source) return false;
  if (query.aggregateId && event.aggregateId !== query.aggregateId) return false;
  if (query.aggregateType && event.aggregateType !== query.aggregateType) return false;
  if (query.fromSequence !== undefined && (event.sequence ?? 0) < query.fromSequence) {
    return false;
  }
  if (query.toSequence !== undefined && (event.sequence ?? 0) > query.toSequence) {
    return false;
  }
  if (query.fromTimestamp && event.timestamp < query.fromTimestamp) return false;
  if (query.toTimestamp && event.timestamp > query.toTimestamp) return false;
  return true;
}

export interface InMemoryEventStoreOptions {
  /** Maximum events before compaction is triggered automatically */
  maxEvents?: number;
}

export class InMemoryEventStore implements EventStore {
  private events: Event[] = [];
  private sequence = 0;
  private snapshots: Map<string, Snapshot> = new Map();
  private readonly maxEvents: number;

  constructor(options: InMemoryEventStoreOptions = {}) {
    this.maxEvents = options.maxEvents ?? Infinity;
  }

  // ─── Core append ────────────────────────────────────────────────────────────

  async append<TPayload>(
    event: Omit<Event<TPayload>, "sequence">
  ): Promise<Event<TPayload>> {
    const seq = ++this.sequence;
    const stored: Event<TPayload> = {
      ...event,
      sequence: seq,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.events.push(stored as unknown as Event);

    if (this.events.length > this.maxEvents) {
      await this.compact();
    }

    return stored;
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  async query<TPayload>(query: EventQuery): Promise<EventPage<TPayload>> {
    let filtered = this.events.filter((e) => matchesQuery(e, query));

    // Cursor-based pagination: cursor is a sequence number string
    if (query.cursor) {
      const afterSeq = parseInt(query.cursor, 10);
      filtered = filtered.filter((e) => (e.sequence ?? 0) > afterSeq);
    }

    const limit = query.limit ?? filtered.length;
    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor =
      hasMore && page.length > 0
        ? String(page[page.length - 1]!.sequence)
        : undefined;

    return {
      events: page as unknown as Event<TPayload>[],
      nextCursor,
      hasMore,
    };
  }

  // ─── Stream ─────────────────────────────────────────────────────────────────

  async stream<TPayload>(
    query: EventQuery,
    handler: (event: Event<TPayload>) => void | Promise<void>
  ): Promise<void> {
    let cursor = query.cursor;
    const batchSize = query.limit ?? 50;

    while (true) {
      const page = await this.query<TPayload>({ ...query, cursor, limit: batchSize });
      for (const event of page.events) {
        const result = handler(event);
        if (result instanceof Promise) await result;
      }
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
  }

  // ─── Aggregation ────────────────────────────────────────────────────────────

  async aggregate<TState>(
    aggregateId: string,
    reducer: (state: TState, event: Event) => TState,
    initialState: TState
  ): Promise<TState> {
    // Load from snapshot if available
    const snapshotKey = aggregateId;
    const snapshot = this.snapshots.get(snapshotKey);

    let state: TState;
    let fromSequence: number | undefined;

    if (snapshot) {
      state = snapshot.state as TState;
      fromSequence = snapshot.version + 1;
    } else {
      state = initialState;
    }

    const page = await this.query({
      aggregateId,
      fromSequence,
    });

    for (const event of page.events) {
      state = reducer(state, event as Event);
    }

    return state;
  }

  // ─── Snapshots ──────────────────────────────────────────────────────────────

  saveSnapshot<TState>(snapshot: Snapshot<TState>): void {
    const key = snapshot.aggregateId;
    this.snapshots.set(key, snapshot as Snapshot);
  }

  getSnapshot<TState>(aggregateId: string): Snapshot<TState> | undefined {
    return this.snapshots.get(aggregateId) as Snapshot<TState> | undefined;
  }

  // ─── Replay ─────────────────────────────────────────────────────────────────

  async replay<TState>(
    query: EventQuery,
    reducer: (state: TState, event: Event) => TState,
    initialState: TState
  ): Promise<TState> {
    let state = initialState;
    await this.stream(query, (event) => {
      state = reducer(state, event as Event);
    });
    return state;
  }

  // ─── Compaction ─────────────────────────────────────────────────────────────

  /** Compact: for each aggregate that has a snapshot, drop events older than the snapshot version */
  async compact(): Promise<number> {
    const before = this.events.length;
    const compacted: Event[] = [];

    for (const event of this.events) {
      const aggId = event.aggregateId;
      if (!aggId) {
        compacted.push(event);
        continue;
      }
      const snapshot = this.snapshots.get(aggId);
      if (!snapshot) {
        compacted.push(event);
        continue;
      }
      // Keep only events newer than the snapshot version
      if ((event.aggregateVersion ?? 0) > snapshot.version) {
        compacted.push(event);
      }
    }

    this.events = compacted;
    return before - this.events.length;
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  async getLatestSequence(): Promise<number> {
    return this.sequence;
  }

  async count(query?: EventQuery): Promise<number> {
    if (!query) return this.events.length;
    return this.events.filter((e) => matchesQuery(e, query)).length;
  }

  /** Get all events for an aggregate sorted by version */
  async getAggregateEvents(aggregateId: string): Promise<Event[]> {
    const page = await this.query({ aggregateId });
    return page.events.sort(
      (a, b) => (a.aggregateVersion ?? 0) - (b.aggregateVersion ?? 0)
    );
  }

  /** Clear all events (useful for testing) */
  clear(): void {
    this.events = [];
    this.snapshots.clear();
    this.sequence = 0;
  }

  /** Return all events (read-only copy) */
  getAllEvents(): Event[] {
    return [...this.events];
  }
}
