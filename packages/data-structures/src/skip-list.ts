// Skip list node
class SkipNode<K, V> {
  key: K;
  value: V;
  forward: Array<SkipNode<K, V> | null>;

  constructor(key: K, value: V, level: number) {
    this.key = key;
    this.value = value;
    this.forward = new Array<SkipNode<K, V> | null>(level + 1).fill(null);
  }
}

// Sentinel head node using a symbol key
const HEAD_KEY = Symbol('head');
const TAIL_KEY = Symbol('tail');

export class SkipList<K, V> {
  private readonly maxLevel: number;
  private readonly probability: number;
  private level: number;
  private head: SkipNode<K | symbol, V>;
  private _size: number;
  private readonly comparator: (a: K, b: K) => number;

  constructor(options?: {
    maxLevel?: number;
    probability?: number;
    comparator?: (a: K, b: K) => number;
  }) {
    this.maxLevel = options?.maxLevel ?? 16;
    this.probability = options?.probability ?? 0.5;
    this.level = 0;
    this._size = 0;
    this.comparator = options?.comparator ?? this.defaultComparator;
    // Head sentinel with minimum possible key
    this.head = new SkipNode<K | symbol, V>(HEAD_KEY, undefined as unknown as V, this.maxLevel);
  }

  get size(): number {
    return this._size;
  }

  private defaultComparator(a: K, b: K): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  private compareKeys(a: K | symbol, b: K | symbol): number {
    if (a === HEAD_KEY) return -1;
    if (b === HEAD_KEY) return 1;
    if (a === TAIL_KEY) return 1;
    if (b === TAIL_KEY) return -1;
    return this.comparator(a as K, b as K);
  }

  // Random level generation
  private randomLevel(): number {
    let level = 0;
    while (Math.random() < this.probability && level < this.maxLevel) {
      level++;
    }
    return level;
  }

  // Find update array (predecessors at each level) - O(log n) avg
  private findUpdate(key: K): Array<SkipNode<K | symbol, V>> {
    const update = new Array<SkipNode<K | symbol, V>>(this.maxLevel + 1);
    let cur = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (
        cur.forward[i] !== null &&
        this.compareKeys(cur.forward[i]!.key, key) < 0
      ) {
        cur = cur.forward[i]!;
      }
      update[i] = cur;
    }
    return update;
  }

  // Set key-value pair - O(log n) avg
  set(key: K, value: V): void {
    const update = this.findUpdate(key);
    const cur = update[0]?.forward[0];

    // Update existing key
    if (cur !== null && cur !== undefined && this.compareKeys(cur.key, key) === 0) {
      cur.value = value;
      return;
    }

    // Insert new node
    const newLevel = this.randomLevel();
    if (newLevel > this.level) {
      for (let i = this.level + 1; i <= newLevel; i++) {
        update[i] = this.head;
      }
      this.level = newLevel;
    }

    const newNode = new SkipNode<K | symbol, V>(key, value, newLevel);
    for (let i = 0; i <= newLevel; i++) {
      newNode.forward[i] = update[i]!.forward[i] ?? null;
      update[i]!.forward[i] = newNode;
    }
    this._size++;
  }

  // Get value by key - O(log n) avg
  get(key: K): V | undefined {
    let cur = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (
        cur.forward[i] !== null &&
        this.compareKeys(cur.forward[i]!.key, key) < 0
      ) {
        cur = cur.forward[i]!;
      }
    }
    const target = cur.forward[0];
    if (target !== null && this.compareKeys(target.key, key) === 0) {
      return target.value;
    }
    return undefined;
  }

  // Check if key exists - O(log n) avg
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  // Delete key - O(log n) avg
  delete(key: K): boolean {
    const update = this.findUpdate(key);
    const cur = update[0]?.forward[0];

    if (cur === null || cur === undefined || this.compareKeys(cur.key, key) !== 0) {
      return false;
    }

    for (let i = 0; i <= this.level; i++) {
      if (update[i]?.forward[i] !== cur) break;
      update[i]!.forward[i] = cur.forward[i] ?? null;
    }

    while (this.level > 0 && this.head.forward[this.level] === null) {
      this.level--;
    }
    this._size--;
    return true;
  }

  // Range query: all entries with min <= key <= max - O(log n + k)
  range(min: K, max: K): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    let cur = this.head;

    // Skip to min
    for (let i = this.level; i >= 0; i--) {
      while (
        cur.forward[i] !== null &&
        this.compareKeys(cur.forward[i]!.key, min) < 0
      ) {
        cur = cur.forward[i]!;
      }
    }
    cur = cur.forward[0] ?? this.head;

    // Collect until max
    while (cur !== null && cur !== undefined && this.compareKeys(cur.key, max) <= 0) {
      if (cur.key !== HEAD_KEY) {
        result.push({ key: cur.key as K, value: cur.value });
      }
      cur = cur.forward[0] ?? this.head;
    }

    return result;
  }

  // Find nearest key (floor: greatest key <= target)
  nearestKey(target: K): K | undefined {
    let cur = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (
        cur.forward[i] !== null &&
        this.compareKeys(cur.forward[i]!.key, target) <= 0
      ) {
        cur = cur.forward[i]!;
      }
    }
    if (cur.key === HEAD_KEY) return undefined;
    return cur.key as K;
  }

  // Find ceiling key (smallest key >= target)
  ceilingKey(target: K): K | undefined {
    let cur = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (
        cur.forward[i] !== null &&
        this.compareKeys(cur.forward[i]!.key, target) < 0
      ) {
        cur = cur.forward[i]!;
      }
    }
    const node = cur.forward[0];
    if (node === null || node === undefined) return undefined;
    return node.key as K;
  }

  // Clear all entries
  clear(): void {
    this.head = new SkipNode<K | symbol, V>(HEAD_KEY, undefined as unknown as V, this.maxLevel);
    this.level = 0;
    this._size = 0;
  }

  // Iterate all entries in sorted order
  entries(): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    let cur = this.head.forward[0];
    while (cur !== null && cur !== undefined) {
      result.push({ key: cur.key as K, value: cur.value });
      cur = cur.forward[0] ?? null;
    }
    return result;
  }

  // Min and max keys
  min(): { key: K; value: V } | undefined {
    const node = this.head.forward[0];
    if (!node) return undefined;
    return { key: node.key as K, value: node.value };
  }

  max(): { key: K; value: V } | undefined {
    let cur = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (cur.forward[i] !== null) {
        cur = cur.forward[i]!;
      }
    }
    if (cur.key === HEAD_KEY) return undefined;
    return { key: cur.key as K, value: cur.value };
  }

  [Symbol.iterator](): Iterator<{ key: K; value: V }> {
    let cur = this.head.forward[0];
    return {
      next(): IteratorResult<{ key: K; value: V }> {
        if (cur === null || cur === undefined) {
          return { value: undefined as unknown as { key: K; value: V }, done: true };
        }
        const entry = { key: cur.key as K, value: cur.value };
        cur = cur.forward[0] ?? null;
        return { value: entry, done: false };
      },
    };
  }
}
