/**
 * InMemoryAuditStore - in-memory implementation of AuditStore
 */

import type {
  AuditAction,
  AuditAggregation,
  AuditEntry,
  AuditQuery,
  AuditQueryResult,
  AuditStore,
} from "./types.js";

export interface InMemoryAuditStoreOptions {
  /** Maximum number of entries before rotation */
  maxSize?: number;
  /** When maxSize is exceeded, remove oldest N entries */
  rotateBy?: number;
}

export class InMemoryAuditStore implements AuditStore {
  private entries: AuditEntry[] = [];
  private readonly maxSize: number;
  private readonly rotateBy: number;

  constructor(options: InMemoryAuditStoreOptions = {}) {
    this.maxSize = options.maxSize ?? 10_000;
    this.rotateBy = options.rotateBy ?? 1_000;
  }

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);

    // Rotate if over limit
    if (this.entries.length > this.maxSize) {
      this.entries.splice(0, this.rotateBy);
    }
  }

  async query(query: AuditQuery): Promise<AuditQueryResult> {
    let filtered = this.applyFilters(this.entries, query);

    // Sort by timestamp descending
    filtered = filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply cursor (offset-based using entry id)
    let startIndex = 0;
    if (query.cursor) {
      const cursorIndex = filtered.findIndex((e) => e.id === query.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const limit = query.limit ?? 50;
    const page = filtered.slice(startIndex, startIndex + limit);
    const nextEntry = filtered[startIndex + limit];

    return {
      entries: page,
      nextCursor: nextEntry?.id,
      total: filtered.length,
    };
  }

  async aggregate(query: Omit<AuditQuery, "limit" | "cursor">): Promise<AuditAggregation> {
    const filtered = this.applyFilters(this.entries, query);

    const eventsPerDay: Record<string, number> = {};
    const eventsPerUser: Record<string, number> = {};
    const eventsPerAction: Record<string, number> = {};

    for (const entry of filtered) {
      // Per day (YYYY-MM-DD)
      const day = entry.timestamp.toISOString().slice(0, 10);
      eventsPerDay[day] = (eventsPerDay[day] ?? 0) + 1;

      // Per user
      const userId = entry.actor.id;
      eventsPerUser[userId] = (eventsPerUser[userId] ?? 0) + 1;

      // Per action
      const action = entry.action;
      eventsPerAction[action] = (eventsPerAction[action] ?? 0) + 1;
    }

    return { eventsPerDay, eventsPerUser, eventsPerAction };
  }

  async export(format: "json" | "csv", query?: AuditQuery): Promise<string> {
    const effectiveQuery: AuditQuery = query ?? {};
    // Remove pagination for export
    const { limit: _limit, cursor: _cursor, ...restQuery } = effectiveQuery;
    const filtered = this.applyFilters(this.entries, restQuery).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    if (format === "json") {
      return JSON.stringify(
        filtered.map((e) => this.serializeEntry(e)),
        null,
        2
      );
    }

    // CSV
    const headers = [
      "id",
      "action",
      "actorId",
      "actorName",
      "actorType",
      "resourceType",
      "resourceId",
      "resourceName",
      "timestamp",
      "outcome",
      "ip",
      "userAgent",
      "requestId",
      "sessionId",
      "errorMessage",
    ];

    const rows = filtered.map((e) =>
      [
        e.id,
        e.action,
        e.actor.id,
        e.actor.name ?? "",
        e.actor.type,
        e.resource.type,
        e.resource.id,
        e.resource.name ?? "",
        e.timestamp.toISOString(),
        e.outcome,
        e.ip ?? "",
        e.userAgent ?? "",
        e.requestId ?? "",
        e.sessionId ?? "",
        e.errorMessage ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );

    return [headers.join(","), ...rows].join("\n");
  }

  async compact(olderThan: Date): Promise<number> {
    const before = this.entries.length;

    // Group old entries by actor+action+day and create summary entries
    const old = this.entries.filter((e) => e.timestamp < olderThan);
    const recent = this.entries.filter((e) => e.timestamp >= olderThan);

    // Summarize old entries by actor+action+day
    const summaries = new Map<string, { count: number; first: AuditEntry; last: AuditEntry }>();

    for (const entry of old) {
      const day = entry.timestamp.toISOString().slice(0, 10);
      const key = `${entry.actor.id}:${entry.action}:${day}`;
      const existing = summaries.get(key);

      if (!existing) {
        summaries.set(key, { count: 1, first: entry, last: entry });
      } else {
        existing.count++;
        if (entry.timestamp < existing.first.timestamp) existing.first = entry;
        if (entry.timestamp > existing.last.timestamp) existing.last = entry;
      }
    }

    // Convert summaries back to entries
    const compacted: AuditEntry[] = [];
    for (const [, summary] of summaries) {
      compacted.push({
        ...summary.first,
        metadata: {
          ...summary.first.metadata,
          _compacted: true,
          _eventCount: summary.count,
          _periodStart: summary.first.timestamp.toISOString(),
          _periodEnd: summary.last.timestamp.toISOString(),
        },
      });
    }

    this.entries = [...compacted, ...recent];
    return before - this.entries.length;
  }

  async size(): Promise<number> {
    return this.entries.length;
  }

  /** Return all entries (for testing) */
  getAll(): AuditEntry[] {
    return [...this.entries];
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.entries = [];
  }

  private applyFilters(
    entries: AuditEntry[],
    query: Omit<AuditQuery, "limit" | "cursor">
  ): AuditEntry[] {
    return entries.filter((e) => {
      if (query.actorId && e.actor.id !== query.actorId) return false;
      if (query.actorType && e.actor.type !== query.actorType) return false;
      if (query.action) {
        const actions = Array.isArray(query.action) ? query.action : [query.action];
        if (!(actions as AuditAction[]).includes(e.action)) return false;
      }
      if (query.resourceType && e.resource.type !== query.resourceType) return false;
      if (query.resourceId && e.resource.id !== query.resourceId) return false;
      if (query.startTime && e.timestamp < query.startTime) return false;
      if (query.endTime && e.timestamp > query.endTime) return false;
      if (query.outcome && e.outcome !== query.outcome) return false;
      if (query.requestId && e.requestId !== query.requestId) return false;
      if (query.sessionId && e.sessionId !== query.sessionId) return false;
      return true;
    });
  }

  private serializeEntry(entry: AuditEntry): Record<string, unknown> {
    return {
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    };
  }
}
