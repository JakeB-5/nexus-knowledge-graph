// In-memory transport - ring buffer storage for testing

import { LogLevel, type LogEntry, type LogTransport } from '../types.js';

export interface MemoryTransportOptions {
  name?: string;
  minLevel?: LogLevel;
  /** Maximum number of entries to keep (ring buffer). Default: 1000 */
  capacity?: number;
}

export interface StoredEntry {
  entry: LogEntry;
  formatted: string;
}

export class MemoryTransport implements LogTransport {
  readonly name: string;
  readonly minLevel: LogLevel;
  private readonly capacity: number;
  private readonly ring: StoredEntry[];
  private head = 0;
  private count = 0;

  constructor(options: MemoryTransportOptions = {}) {
    this.name = options.name ?? 'memory';
    this.minLevel = options.minLevel ?? LogLevel.Trace;
    this.capacity = options.capacity ?? 1000;
    this.ring = new Array<StoredEntry>(this.capacity);
  }

  write(entry: LogEntry, formatted: string): void {
    this.ring[this.head] = { entry, formatted };
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  // ── Query helpers ────────────────────────────────────────────────────────

  /** Returns all stored entries in insertion order */
  getAll(): StoredEntry[] {
    if (this.count < this.capacity) {
      return this.ring.slice(0, this.count) as StoredEntry[];
    }
    // Ring wrapped: oldest entry starts at `head`
    return [
      ...this.ring.slice(this.head),
      ...this.ring.slice(0, this.head),
    ] as StoredEntry[];
  }

  /** Returns entries at or above the given log level */
  getByLevel(level: LogLevel): StoredEntry[] {
    return this.getAll().filter((s) => s.entry.level >= level);
  }

  /** Returns entries matching the given exact level */
  getExactLevel(level: LogLevel): StoredEntry[] {
    return this.getAll().filter((s) => s.entry.level === level);
  }

  /** Returns entries whose message includes the given substring */
  search(substring: string): StoredEntry[] {
    const lower = substring.toLowerCase();
    return this.getAll().filter((s) =>
      s.entry.message.toLowerCase().includes(lower),
    );
  }

  /** How many entries are currently stored */
  get size(): number {
    return this.count;
  }

  /** Clear all stored entries */
  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
