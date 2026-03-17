// Mock implementations for common infrastructure dependencies

// ── Call recorder ──────────────────────────────────────────────────────────

interface RecordedCall<A extends unknown[], R> {
  args: A;
  result: R | undefined;
  error: unknown;
  calledAt: Date;
}

export class CallRecorder<A extends unknown[] = unknown[], R = unknown> {
  private _calls: RecordedCall<A, R>[] = [];

  record(args: A, result?: R, error?: unknown): void {
    this._calls.push({ args, result, error, calledAt: new Date() });
  }

  get calls(): RecordedCall<A, R>[] {
    return [...this._calls];
  }

  get callCount(): number {
    return this._calls.length;
  }

  lastCall(): RecordedCall<A, R> | undefined {
    return this._calls[this._calls.length - 1];
  }

  calledWith(...args: A): boolean {
    return this._calls.some((c) => JSON.stringify(c.args) === JSON.stringify(args));
  }

  reset(): void {
    this._calls = [];
  }
}

// ── MockDB ─────────────────────────────────────────────────────────────────

export class MockDB {
  private tables: Map<string, Map<string, unknown>> = new Map();
  readonly recorder = new CallRecorder<[string, ...unknown[]], unknown>();

  private getTable(name: string): Map<string, unknown> {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  async insert<T extends { id: string }>(table: string, record: T): Promise<T> {
    this.recorder.record(['insert', table, record]);
    this.getTable(table).set(record.id, record);
    return record;
  }

  async findById<T>(table: string, id: string): Promise<T | null> {
    this.recorder.record(['findById', table, id]);
    return (this.getTable(table).get(id) as T) ?? null;
  }

  async findAll<T>(table: string): Promise<T[]> {
    this.recorder.record(['findAll', table]);
    return Array.from(this.getTable(table).values()) as T[];
  }

  async update<T extends { id: string }>(table: string, record: T): Promise<T> {
    this.recorder.record(['update', table, record]);
    if (!this.getTable(table).has(record.id)) {
      throw new Error(`Record ${record.id} not found in ${table}`);
    }
    this.getTable(table).set(record.id, record);
    return record;
  }

  async delete(table: string, id: string): Promise<boolean> {
    this.recorder.record(['delete', table, id]);
    return this.getTable(table).delete(id);
  }

  async count(table: string): Promise<number> {
    this.recorder.record(['count', table]);
    return this.getTable(table).size;
  }

  clear(table?: string): void {
    if (table) {
      this.tables.get(table)?.clear();
    } else {
      this.tables.clear();
    }
    this.recorder.reset();
  }
}

// ── MockSearchEngine ───────────────────────────────────────────────────────

export interface SearchResult<T> {
  item: T;
  score: number;
}

export class MockSearchEngine<T extends { id: string }> {
  private index: Map<string, T> = new Map();
  readonly recorder = new CallRecorder<[string, ...unknown[]], unknown>();
  private searchDelay = 0;

  index_document(doc: T): void {
    this.index.set(doc.id, doc);
  }

  async search(query: string, _options?: { limit?: number; threshold?: number }): Promise<SearchResult<T>[]> {
    this.recorder.record(['search', query]);
    if (this.searchDelay > 0) {
      await new Promise((r) => setTimeout(r, this.searchDelay));
    }

    const lowerQuery = query.toLowerCase();
    const results: SearchResult<T>[] = [];

    this.index.forEach((doc) => {
      const text = JSON.stringify(doc).toLowerCase();
      if (text.includes(lowerQuery)) {
        results.push({ item: doc, score: Math.random() });
      }
    });

    return results.sort((a, b) => b.score - a.score);
  }

  remove(id: string): void {
    this.index.delete(id);
  }

  clear(): void {
    this.index.clear();
    this.recorder.reset();
  }

  setSearchDelay(ms: number): void {
    this.searchDelay = ms;
  }
}

// ── MockWebSocket ──────────────────────────────────────────────────────────

type WsListener = (data: unknown) => void;

export class MockWebSocket {
  private listeners: Map<string, WsListener[]> = new Map();
  readonly sent: unknown[] = [];
  connected = true;
  readonly recorder = new CallRecorder();

  on(event: string, listener: WsListener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(listener);
  }

  off(event: string, listener: WsListener): void {
    const listeners = this.listeners.get(event) ?? [];
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  }

  send(data: unknown): void {
    this.recorder.record(['send', data]);
    this.sent.push(data);
  }

  /** Simulate receiving a message from the server. */
  receive(event: string, data: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(data);
    }
  }

  close(): void {
    this.connected = false;
    this.receive('close', { code: 1000, reason: 'Normal closure' });
  }

  reset(): void {
    this.sent.length = 0;
    this.listeners.clear();
    this.recorder.reset();
    this.connected = true;
  }
}

// ── MockEventBus ───────────────────────────────────────────────────────────

type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

export class MockEventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  readonly emitted: Array<{ event: string; payload: unknown; emittedAt: Date }> = [];

  on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler as EventHandler);
    return () => this.off(event, handler as EventHandler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event) ?? [];
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  async emit<T>(event: string, payload: T): Promise<void> {
    this.emitted.push({ event, payload, emittedAt: new Date() });
    const handlers = this.handlers.get(event) ?? [];
    await Promise.all(handlers.map((h) => h(payload)));
  }

  wasEmitted(event: string): boolean {
    return this.emitted.some((e) => e.event === event);
  }

  emittedWith<T>(event: string, payload: T): boolean {
    return this.emitted.some(
      (e) => e.event === event && JSON.stringify(e.payload) === JSON.stringify(payload)
    );
  }

  reset(): void {
    this.emitted.length = 0;
    this.handlers.clear();
  }
}

// ── MockStorageProvider ────────────────────────────────────────────────────

export class MockStorageProvider {
  private storage: Map<string, Buffer> = new Map();
  readonly recorder = new CallRecorder<[string, ...unknown[]], unknown>();

  async put(key: string, data: Buffer | string): Promise<void> {
    this.recorder.record(['put', key]);
    this.storage.set(key, typeof data === 'string' ? Buffer.from(data) : data);
  }

  async get(key: string): Promise<Buffer | null> {
    this.recorder.record(['get', key]);
    return this.storage.get(key) ?? null;
  }

  async delete(key: string): Promise<boolean> {
    this.recorder.record(['delete', key]);
    return this.storage.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async list(prefix = ''): Promise<string[]> {
    this.recorder.record(['list', prefix]);
    return Array.from(this.storage.keys()).filter((k) => k.startsWith(prefix));
  }

  clear(): void {
    this.storage.clear();
    this.recorder.reset();
  }

  size(): number {
    return this.storage.size;
  }
}
