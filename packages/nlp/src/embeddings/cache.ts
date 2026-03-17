/**
 * LRU cache for computed embeddings.
 * Keys are content-hash based; supports serialization and cache statistics.
 */

// ---------------------------------------------------------------------------
// Simple content hash (FNV-1a 32-bit)
// ---------------------------------------------------------------------------

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (Math.imul(hash, 0x01000193) >>> 0);
  }
  return hash.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// LRU node
// ---------------------------------------------------------------------------

interface LRUNode {
  key: string;
  value: number[];
  prev: LRUNode | null;
  next: LRUNode | null;
}

// ---------------------------------------------------------------------------
// LRU Cache internals
// ---------------------------------------------------------------------------

class LRUList {
  head: LRUNode | null = null; // most recently used
  tail: LRUNode | null = null; // least recently used

  prepend(node: LRUNode): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  moveToFront(node: LRUNode): void {
    if (node === this.head) return;
    this.remove(node);
    this.prepend(node);
  }

  removeTail(): LRUNode | null {
    if (!this.tail) return null;
    const node = this.tail;
    this.remove(node);
    return node;
  }

  remove(node: LRUNode): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }
}

// ---------------------------------------------------------------------------
// EmbeddingCache
// ---------------------------------------------------------------------------

export interface CacheStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

export interface SerializedCache {
  version: number;
  entries: Array<{ key: string; value: number[] }>;
}

export class EmbeddingCache {
  private readonly capacity: number;
  private readonly map = new Map<string, LRUNode>();
  private readonly list = new LRUList();

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(capacity = 1000) {
    if (capacity < 1) throw new Error("Cache capacity must be >= 1");
    this.capacity = capacity;
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  /**
   * Look up a cached embedding by content.
   * Returns undefined on cache miss.
   */
  get(text: string): number[] | undefined {
    const key = this.hashKey(text);
    const node = this.map.get(key);
    if (!node) {
      this.misses++;
      return undefined;
    }
    this.list.moveToFront(node);
    this.hits++;
    return node.value;
  }

  /**
   * Store an embedding in the cache.
   */
  set(text: string, embedding: number[]): void {
    const key = this.hashKey(text);

    if (this.map.has(key)) {
      const node = this.map.get(key)!;
      node.value = embedding;
      this.list.moveToFront(node);
      return;
    }

    if (this.map.size >= this.capacity) {
      const evicted = this.list.removeTail();
      if (evicted) {
        this.map.delete(evicted.key);
        this.evictions++;
      }
    }

    const node: LRUNode = { key, value: embedding, prev: null, next: null };
    this.list.prepend(node);
    this.map.set(key, node);
  }

  /**
   * Check whether a cached embedding exists for the given text.
   */
  has(text: string): boolean {
    return this.map.has(this.hashKey(text));
  }

  /**
   * Delete a cached embedding.
   */
  delete(text: string): boolean {
    const key = this.hashKey(text);
    const node = this.map.get(key);
    if (!node) return false;
    this.list.remove(node);
    this.map.delete(key);
    return true;
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.map.clear();
    this.list.head = null;
    this.list.tail = null;
  }

  // ---------------------------------------------------------------------------
  // Wrap an embedding function with caching
  // ---------------------------------------------------------------------------

  /**
   * Return a cached version of an async embedding function.
   */
  wrap(
    fn: (text: string) => Promise<number[]>,
  ): (text: string) => Promise<number[]> {
    return async (text: string) => {
      const cached = this.get(text);
      if (cached !== undefined) return cached;
      const embedding = await fn(text);
      this.set(text, embedding);
      return embedding;
    };
  }

  /**
   * Batch-embed with caching: only calls fn for cache misses.
   */
  async wrapBatch(
    texts: string[],
    fn: (texts: string[]) => Promise<number[][]>,
  ): Promise<number[][]> {
    const result = new Array<number[]>(texts.length);
    const missIndices: number[] = [];
    const missTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cached = this.get(texts[i]!);
      if (cached !== undefined) {
        result[i] = cached;
      } else {
        missIndices.push(i);
        missTexts.push(texts[i]!);
      }
    }

    if (missTexts.length > 0) {
      const embeddings = await fn(missTexts);
      for (let k = 0; k < missIndices.length; k++) {
        const idx = missIndices[k]!;
        const embedding = embeddings[k]!;
        result[idx] = embedding;
        this.set(texts[idx]!, embedding);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  get stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.map.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  serialize(): SerializedCache {
    const entries: Array<{ key: string; value: number[] }> = [];
    let node = this.list.head;
    while (node) {
      entries.push({ key: node.key, value: node.value });
      node = node.next;
    }
    return { version: 1, entries };
  }

  /**
   * Restore cache from a serialized snapshot.
   * Entries are inserted in order (most recent first).
   */
  deserialize(data: SerializedCache): void {
    if (data.version !== 1) {
      throw new Error(`Unsupported cache version: ${data.version}`);
    }
    this.clear();
    // Insert in reverse order so the first entry ends up as MRU
    for (let i = data.entries.length - 1; i >= 0; i--) {
      const entry = data.entries[i]!;
      if (this.map.size < this.capacity) {
        const node: LRUNode = {
          key: entry.key,
          value: entry.value,
          prev: null,
          next: null,
        };
        this.list.prepend(node);
        this.map.set(entry.key, node);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private hashKey(text: string): string {
    return fnv1a32(text);
  }

  get size(): number {
    return this.map.size;
  }
}
