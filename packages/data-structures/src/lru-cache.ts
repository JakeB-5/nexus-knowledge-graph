// LRU Cache node for doubly linked list
class LRUNode<K, V> {
  key: K;
  value: V;
  expiresAt: number | null; // timestamp ms, null = no expiry
  prev: LRUNode<K, V> | null = null;
  next: LRUNode<K, V> | null = null;

  constructor(key: K, value: V, ttl?: number) {
    this.key = key;
    this.value = value;
    this.expiresAt = ttl !== undefined ? Date.now() + ttl : null;
  }

  isExpired(): boolean {
    return this.expiresAt !== null && Date.now() > this.expiresAt;
  }
}

export class LRUCache<K, V> {
  private readonly capacity: number;
  private readonly map: Map<K, LRUNode<K, V>>;
  private readonly head: LRUNode<K, V>; // sentinel MRU end
  private readonly tail: LRUNode<K, V>; // sentinel LRU end
  private readonly onEvict?: (key: K, value: V) => void;

  constructor(options: {
    capacity: number;
    onEvict?: (key: K, value: V) => void;
  }) {
    this.capacity = options.capacity;
    this.onEvict = options.onEvict;
    this.map = new Map();
    // Sentinels simplify edge cases
    this.head = new LRUNode<K, V>(null as unknown as K, null as unknown as V);
    this.tail = new LRUNode<K, V>(null as unknown as K, null as unknown as V);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  // Get value and promote to MRU - O(1)
  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    if (node.isExpired()) {
      this.removeNode(node);
      this.map.delete(key);
      this.onEvict?.(key, node.value);
      return undefined;
    }
    this.moveToFront(node);
    return node.value;
  }

  // Peek without promoting - O(1)
  peek(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    if (node.isExpired()) {
      this.removeNode(node);
      this.map.delete(key);
      this.onEvict?.(key, node.value);
      return undefined;
    }
    return node.value;
  }

  // Set key-value with optional TTL in ms - O(1)
  set(key: K, value: V, ttl?: number): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      existing.expiresAt = ttl !== undefined ? Date.now() + ttl : null;
      this.moveToFront(existing);
      return;
    }

    const node = new LRUNode(key, value, ttl);
    this.map.set(key, node);
    this.addToFront(node);

    if (this.map.size > this.capacity) {
      this.evictLRU();
    }
  }

  // Delete key - O(1)
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
    if (node.isExpired()) {
      this.removeNode(node);
      this.map.delete(key);
      return false;
    }
    return true;
  }

  get size(): number {
    return this.map.size;
  }

  // Iterate from MRU to LRU
  *entries(): Generator<[K, V]> {
    let node = this.head.next;
    while (node !== null && node !== this.tail) {
      if (!node.isExpired()) {
        yield [node.key, node.value];
      }
      node = node.next;
    }
  }

  *keys(): Generator<K> {
    for (const [k] of this.entries()) yield k;
  }

  *values(): Generator<V> {
    for (const [, v] of this.entries()) yield v;
  }

  // Evict all expired entries
  purgeExpired(): number {
    let count = 0;
    for (const [key, node] of this.map) {
      if (node.isExpired()) {
        this.removeNode(node);
        this.map.delete(key);
        this.onEvict?.(key, node.value);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.map.clear();
  }

  private addToFront(node: LRUNode<K, V>): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }

  private removeNode(node: LRUNode<K, V>): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  private moveToFront(node: LRUNode<K, V>): void {
    this.removeNode(node);
    this.addToFront(node);
  }

  private evictLRU(): void {
    const lru = this.tail.prev!;
    if (lru === this.head) return;
    this.removeNode(lru);
    this.map.delete(lru.key);
    this.onEvict?.(lru.key, lru.value);
  }
}
