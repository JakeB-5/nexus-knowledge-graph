/**
 * Binary min-heap priority queue.
 * Supports insert, extractMin, and decreaseKey operations.
 */
export interface PQEntry<T> {
  key: T;
  priority: number;
}

export class PriorityQueue<T> {
  private heap: PQEntry<T>[] = [];
  // Map from key to heap index for O(log n) decreaseKey
  private indexMap: Map<T, number> = new Map();

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /** Insert a new element with given priority */
  insert(key: T, priority: number): void {
    if (this.indexMap.has(key)) {
      this.decreaseKey(key, priority);
      return;
    }
    const entry: PQEntry<T> = { key, priority };
    this.heap.push(entry);
    const idx = this.heap.length - 1;
    this.indexMap.set(key, idx);
    this.bubbleUp(idx);
  }

  /** Extract and return the element with minimum priority */
  extractMin(): PQEntry<T> | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0]!;
    const last = this.heap.pop()!;
    this.indexMap.delete(min.key);

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.indexMap.set(last.key, 0);
      this.sinkDown(0);
    }

    return min;
  }

  /** Decrease the priority of an existing element */
  decreaseKey(key: T, newPriority: number): void {
    const idx = this.indexMap.get(key);
    if (idx === undefined) return;

    if (newPriority >= this.heap[idx]!.priority) return;
    this.heap[idx]!.priority = newPriority;
    this.bubbleUp(idx);
  }

  /** Peek at the minimum element without removing it */
  peekMin(): PQEntry<T> | undefined {
    return this.heap[0];
  }

  /** Check if a key exists in the queue */
  has(key: T): boolean {
    return this.indexMap.has(key);
  }

  /** Get the priority of a key */
  getPriority(key: T): number | undefined {
    const idx = this.indexMap.get(key);
    if (idx === undefined) return undefined;
    return this.heap[idx]?.priority;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent]!.priority <= this.heap[idx]!.priority) break;
      this.swap(parent, idx);
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;

      if (left < n && this.heap[left]!.priority < this.heap[smallest]!.priority) {
        smallest = left;
      }
      if (right < n && this.heap[right]!.priority < this.heap[smallest]!.priority) {
        smallest = right;
      }

      if (smallest === idx) break;
      this.swap(idx, smallest);
      idx = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const tmp = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = tmp;
    this.indexMap.set(this.heap[i]!.key, i);
    this.indexMap.set(this.heap[j]!.key, j);
  }
}
