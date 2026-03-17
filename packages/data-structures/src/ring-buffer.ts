// Circular ring buffer with fixed capacity
export class RingBuffer<T> {
  private readonly buffer: Array<T | undefined>;
  private readonly capacity: number;
  private head: number = 0; // oldest element index
  private tail: number = 0; // next write index
  private _size: number = 0;

  constructor(capacity: number) {
    if (capacity <= 0) throw new RangeError('Capacity must be positive');
    this.capacity = capacity;
    this.buffer = new Array<T | undefined>(capacity).fill(undefined);
  }

  get size(): number {
    return this._size;
  }

  isEmpty(): boolean {
    return this._size === 0;
  }

  isFull(): boolean {
    return this._size === this.capacity;
  }

  // Push element; overwrites oldest if full - O(1)
  push(item: T): void {
    if (this.isFull()) {
      // Overwrite oldest: advance head
      this.buffer[this.tail] = item;
      this.tail = (this.tail + 1) % this.capacity;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.buffer[this.tail] = item;
      this.tail = (this.tail + 1) % this.capacity;
      this._size++;
    }
  }

  // Remove and return oldest element - O(1)
  pop(): T | undefined {
    if (this.isEmpty()) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this._size--;
    return item;
  }

  // Peek at oldest element without removing - O(1)
  peek(): T | undefined {
    if (this.isEmpty()) return undefined;
    return this.buffer[this.head];
  }

  // Peek at newest element - O(1)
  peekLast(): T | undefined {
    if (this.isEmpty()) return undefined;
    const lastIdx = (this.tail - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIdx];
  }

  // Get element at logical index (0 = oldest) - O(1)
  get(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined;
    return this.buffer[(this.head + index) % this.capacity];
  }

  // Convert to array from oldest to newest - O(n)
  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this._size; i++) {
      result.push(this.buffer[(this.head + i) % this.capacity] as T);
    }
    return result;
  }

  // Iterate from oldest to newest
  [Symbol.iterator](): Iterator<T> {
    let i = 0;
    const size = this._size;
    const head = this.head;
    const cap = this.capacity;
    const buf = this.buffer;

    return {
      next(): IteratorResult<T> {
        if (i >= size) return { value: undefined as unknown as T, done: true };
        const value = buf[(head + i) % cap] as T;
        i++;
        return { value, done: false };
      },
    };
  }

  // Drain all elements into array and clear
  drain(): T[] {
    const result = this.toArray();
    this.clear();
    return result;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.head = 0;
    this.tail = 0;
    this._size = 0;
  }

  // Fill buffer from array (oldest first)
  static fromArray<T>(arr: T[], capacity?: number): RingBuffer<T> {
    const cap = capacity ?? arr.length;
    const rb = new RingBuffer<T>(cap);
    for (const item of arr) rb.push(item);
    return rb;
  }
}
