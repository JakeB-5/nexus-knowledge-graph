/**
 * Generic LRU Cache with TTL support and statistics.
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number | null; // null means no expiry
  key: string;
  prev: CacheEntry<V> | null;
  next: CacheEntry<V> | null;
}

export interface LRUCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

export interface LRUCacheOptions {
  maxSize: number;
  defaultTtlMs?: number; // default TTL in ms; undefined = no expiry
}

export class LRUCache<K = string, V = unknown> {
  private readonly map = new Map<string, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number | undefined;

  // Doubly linked list sentinels
  private readonly head: CacheEntry<V>; // most recently used
  private readonly tail: CacheEntry<V>; // least recently used

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: LRUCacheOptions) {
    if (options.maxSize < 1) throw new Error("maxSize must be >= 1");
    this.maxSize = options.maxSize;
    this.defaultTtlMs = options.defaultTtlMs;

    // Initialize sentinel nodes
    this.head = { value: undefined as unknown as V, expiresAt: null, key: "__head__", prev: null, next: null };
    this.tail = { value: undefined as unknown as V, expiresAt: null, key: "__tail__", prev: null, next: null };
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  private serializeKey(key: K): string {
    return typeof key === "string" ? key : JSON.stringify(key);
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    if (entry.expiresAt === null) return false;
    return Date.now() > entry.expiresAt;
  }

  private detach(entry: CacheEntry<V>): void {
    const prev = entry.prev!;
    const next = entry.next!;
    prev.next = next;
    next.prev = prev;
    entry.prev = null;
    entry.next = null;
  }

  private attachAfterHead(entry: CacheEntry<V>): void {
    entry.prev = this.head;
    entry.next = this.head.next;
    this.head.next!.prev = entry;
    this.head.next = entry;
  }

  private moveToFront(entry: CacheEntry<V>): void {
    this.detach(entry);
    this.attachAfterHead(entry);
  }

  private evictLRU(): void {
    const lru = this.tail.prev;
    if (!lru || lru === this.head) return;
    this.detach(lru);
    this.map.delete(lru.key);
    this.evictions++;
  }

  get(key: K): V | undefined {
    const sk = this.serializeKey(key);
    const entry = this.map.get(sk);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (this.isExpired(entry)) {
      this.detach(entry);
      this.map.delete(sk);
      this.misses++;
      return undefined;
    }
    this.moveToFront(entry);
    this.hits++;
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const sk = this.serializeKey(key);
    const existing = this.map.get(sk);
    const ttl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = ttl !== undefined ? Date.now() + ttl : null;

    if (existing) {
      existing.value = value;
      existing.expiresAt = expiresAt;
      this.moveToFront(existing);
      return;
    }

    if (this.map.size >= this.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry<V> = { value, expiresAt, key: sk, prev: null, next: null };
    this.map.set(sk, entry);
    this.attachAfterHead(entry);
  }

  delete(key: K): boolean {
    const sk = this.serializeKey(key);
    const entry = this.map.get(sk);
    if (!entry) return false;
    this.detach(entry);
    this.map.delete(sk);
    return true;
  }

  has(key: K): boolean {
    const sk = this.serializeKey(key);
    const entry = this.map.get(sk);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.detach(entry);
      this.map.delete(sk);
      return false;
    }
    return true;
  }

  clear(): void {
    this.map.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /** Purge all expired entries. Returns count removed. */
  purgeExpired(): number {
    let count = 0;
    for (const [sk, entry] of this.map) {
      if (this.isExpired(entry)) {
        this.detach(entry);
        this.map.delete(sk);
        count++;
      }
    }
    return count;
  }

  get size(): number {
    return this.map.size;
  }

  stats(): LRUCacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.map.size,
      maxSize: this.maxSize,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  /** Iterate over all non-expired entries (MRU → LRU order). */
  [Symbol.iterator](): Iterator<[K, V]> {
    const entries: [K, V][] = [];
    let node = this.head.next;
    while (node && node !== this.tail) {
      if (!this.isExpired(node)) {
        entries.push([node.key as unknown as K, node.value]);
      }
      node = node.next;
    }
    return entries[Symbol.iterator]();
  }
}
