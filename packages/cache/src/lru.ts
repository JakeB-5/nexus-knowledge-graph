// LRU Cache - doubly linked list + hash map for O(1) get/set/delete
// Supports per-entry TTL, max size eviction, and statistics

import type { CacheProvider, CacheStats, SerializedCache, SerializedEntry } from './types.js';

interface Node<K, V> {
  key: K;
  value: V;
  expiresAt: number | null; // null = no expiry
  prev: Node<K, V> | null;
  next: Node<K, V> | null;
}

function makeNode<K, V>(key: K, value: V, expiresAt: number | null): Node<K, V> {
  return { key, value, expiresAt, prev: null, next: null };
}

export interface LRUCacheOptions {
  maxSize: number;
  /** Default TTL in ms for all entries (can be overridden per entry). Undefined = no expiry. */
  defaultTtl?: number;
}

export class LRUCache<K = string, V = unknown> implements CacheProvider<K, V> {
  private readonly map = new Map<K, Node<K, V>>();
  private readonly maxSize: number;
  private readonly defaultTtl: number | undefined;

  // Sentinel nodes for doubly-linked list (head = most recent, tail = least recent)
  private readonly head: Node<K, V>;
  private readonly tail: Node<K, V>;

  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private _expirations = 0;

  constructor(options: LRUCacheOptions) {
    if (options.maxSize <= 0) throw new RangeError('maxSize must be > 0');
    this.maxSize = options.maxSize;
    this.defaultTtl = options.defaultTtl;

    // Sentinel nodes (key/value are never accessed)
    this.head = makeNode<K, V>(undefined as unknown as K, undefined as unknown as V, null);
    this.tail = makeNode<K, V>(undefined as unknown as K, undefined as unknown as V, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  // ── CacheProvider interface ───────────────────────────────────────────────

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) {
      this._misses++;
      return undefined;
    }

    // Check TTL
    if (this.isExpired(node)) {
      this.removeNode(node);
      this.map.delete(key);
      this._expirations++;
      this._misses++;
      return undefined;
    }

    // Move to front (most recently used)
    this.detach(node);
    this.insertAfterHead(node);
    this._hits++;
    return node.value;
  }

  set(key: K, value: V, ttl?: number): void {
    const effectiveTtl = ttl ?? this.defaultTtl;
    const expiresAt = effectiveTtl !== undefined ? Date.now() + effectiveTtl : null;

    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      existing.expiresAt = expiresAt;
      this.detach(existing);
      this.insertAfterHead(existing);
      return;
    }

    // Evict least recently used if at capacity
    if (this.map.size >= this.maxSize) {
      this.evictLRU();
    }

    const node = makeNode(key, value, expiresAt);
    this.map.set(key, node);
    this.insertAfterHead(node);
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.map.delete(key);
    return true;
  }

  has(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    if (this.isExpired(node)) {
      this.removeNode(node);
      this.map.delete(key);
      this._expirations++;
      return false;
    }
    return true;
  }

  clear(): void {
    this.map.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get size(): number {
    return this.map.size;
  }

  // ── Statistics ────────────────────────────────────────────────────────────

  get stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      expirations: this._expirations,
      size: this.map.size,
      hitRate: total === 0 ? 0 : this._hits / total,
    };
  }

  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
    this._expirations = 0;
  }

  // ── Iteration ─────────────────────────────────────────────────────────────

  /** Iterates entries from most-recently-used to least-recently-used */
  *entries(): IterableIterator<[K, V]> {
    let node = this.head.next;
    while (node !== null && node !== this.tail) {
      if (!this.isExpired(node)) {
        yield [node.key, node.value];
      }
      node = node.next;
    }
  }

  keys(): K[] {
    return Array.from(this.entries()).map(([k]) => k);
  }

  values(): V[] {
    return Array.from(this.entries()).map(([, v]) => v);
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  serialize(): SerializedCache<K, V> {
    const entries: Array<[K, SerializedEntry<V>]> = [];
    for (const [key, node] of this.map) {
      if (!this.isExpired(node)) {
        entries.push([key, { value: node.value, expiresAt: node.expiresAt }]);
      }
    }
    return { entries, timestamp: Date.now() };
  }

  static deserialize<K, V>(
    data: SerializedCache<K, V>,
    options: LRUCacheOptions,
  ): LRUCache<K, V> {
    const cache = new LRUCache<K, V>(options);
    const now = Date.now();
    for (const [key, entry] of data.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) continue; // skip already-expired
      const remainingTtl = entry.expiresAt !== null ? entry.expiresAt - now : undefined;
      cache.set(key, entry.value, remainingTtl);
    }
    return cache;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private isExpired(node: Node<K, V>): boolean {
    return node.expiresAt !== null && Date.now() > node.expiresAt;
  }

  private detach(node: Node<K, V>): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    node.prev = null;
    node.next = null;
  }

  private insertAfterHead(node: Node<K, V>): void {
    node.next = this.head.next;
    node.prev = this.head;
    if (this.head.next) this.head.next.prev = node;
    this.head.next = node;
  }

  private removeNode(node: Node<K, V>): void {
    this.detach(node);
  }

  private evictLRU(): void {
    const lru = this.tail.prev;
    if (!lru || lru === this.head) return;
    this.removeNode(lru);
    this.map.delete(lru.key);
    this._evictions++;
  }
}
