// Max-heap based priority queue (higher priority number = extracted first)

export interface PriorityQueueItem {
  id: string;
  priority: number; // higher number = higher priority
  insertionOrder: number; // tiebreaker: lower = earlier (FIFO within same priority)
}

export class PriorityQueue<T extends PriorityQueueItem> {
  private heap: T[] = [];
  private counter: number = 0;
  private idIndex: Map<string, number> = new Map(); // id -> heap index

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Insert an item into the priority queue.
   * If an item with the same id exists, it is replaced.
   */
  insert(item: T): void {
    if (this.idIndex.has(item.id)) {
      this.removeById(item.id);
    }

    // Always override insertionOrder with the internal counter to guarantee FIFO
    const entry = { ...item, insertionOrder: this.counter++ } as T;
    const idx = this.heap.length;
    this.heap.push(entry);
    this.idIndex.set(entry.id, idx);
    this.bubbleUp(idx);
  }

  /**
   * Peek at the highest-priority item without removing it.
   */
  peek(): T | undefined {
    return this.heap[0];
  }

  /**
   * Remove and return the highest-priority item.
   */
  extractMax(): T | undefined {
    if (this.heap.length === 0) return undefined;

    const top = this.heap[0]!;
    this.idIndex.delete(top.id);

    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.idIndex.set(last.id, 0);
      this.sinkDown(0);
    }

    return top;
  }

  /**
   * Update the priority of an existing item.
   */
  updatePriority(id: string, newPriority: number): boolean {
    const idx = this.idIndex.get(id);
    if (idx === undefined) return false;

    const item = this.heap[idx]!;
    this.heap[idx] = { ...item, priority: newPriority } as T;

    // Try bubble up first, then sink down, to handle either direction
    this.bubbleUp(idx);
    const newIdx = this.idIndex.get(id);
    if (newIdx !== undefined) {
      this.sinkDown(newIdx);
    }

    return true;
  }

  /**
   * Remove an item by id.
   */
  removeById(id: string): T | undefined {
    const idx = this.idIndex.get(id);
    if (idx === undefined) return undefined;

    const item = this.heap[idx]!;
    this.idIndex.delete(id);

    const last = this.heap.pop()!;
    if (idx < this.heap.length) {
      this.heap[idx] = last;
      this.idIndex.set(last.id, idx);
      this.bubbleUp(idx);
      const newIdx = this.idIndex.get(last.id);
      if (newIdx !== undefined) {
        this.sinkDown(newIdx);
      }
    }

    return item;
  }

  /**
   * Check if an item with given id exists.
   */
  has(id: string): boolean {
    return this.idIndex.has(id);
  }

  /**
   * Get item by id without removing.
   */
  getById(id: string): T | undefined {
    const idx = this.idIndex.get(id);
    if (idx === undefined) return undefined;
    return this.heap[idx];
  }

  /**
   * Return all items sorted by priority (highest first). Does not modify the heap.
   */
  toSortedArray(): T[] {
    return [...this.heap].sort((a, b) => this.sortOrder(a, b));
  }

  /**
   * Clear all items.
   */
  clear(): void {
    this.heap = [];
    this.idIndex.clear();
    this.counter = 0;
  }

  /**
   * Returns true if a should be above b in the heap (higher priority or earlier insertion).
   */
  private dominates(a: T, b: T): boolean {
    if (a.priority !== b.priority) return a.priority > b.priority;
    return a.insertionOrder < b.insertionOrder;
  }

  /**
   * Sort comparator for toSortedArray: returns negative if a comes before b.
   */
  private sortOrder(a: T, b: T): number {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.insertionOrder - b.insertionOrder;
  }

  /**
   * Bubble item at index up to restore max-heap property.
   */
  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      const parent = this.heap[parentIdx]!;
      const current = this.heap[idx]!;

      // If current dominates parent, swap upward
      if (!this.dominates(current, parent)) break;

      this.swap(idx, parentIdx);
      idx = parentIdx;
    }
  }

  /**
   * Sink item at index down to restore max-heap property.
   */
  private sinkDown(idx: number): void {
    const n = this.heap.length;

    while (true) {
      let best = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;

      if (left < n && this.dominates(this.heap[left]!, this.heap[best]!)) {
        best = left;
      }
      if (right < n && this.dominates(this.heap[right]!, this.heap[best]!)) {
        best = right;
      }

      if (best === idx) break;

      this.swap(idx, best);
      idx = best;
    }
  }

  /**
   * Swap two elements in the heap and update the index map.
   */
  private swap(i: number, j: number): void {
    const a = this.heap[i]!;
    const b = this.heap[j]!;
    this.heap[i] = b;
    this.heap[j] = a;
    this.idIndex.set(a.id, j);
    this.idIndex.set(b.id, i);
  }
}
