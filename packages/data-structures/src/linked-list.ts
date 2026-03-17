// Doubly linked list node
class DLLNode<T> {
  value: T;
  prev: DLLNode<T> | null = null;
  next: DLLNode<T> | null = null;

  constructor(value: T) {
    this.value = value;
  }
}

export class DoublyLinkedList<T> implements Iterable<T> {
  private head: DLLNode<T> | null = null;
  private tail: DLLNode<T> | null = null;
  private _size = 0;

  get size(): number {
    return this._size;
  }

  isEmpty(): boolean {
    return this._size === 0;
  }

  // Add to front - O(1)
  pushFront(value: T): void {
    const node = new DLLNode(value);
    if (this.head === null) {
      this.head = node;
      this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }
    this._size++;
  }

  // Add to back - O(1)
  pushBack(value: T): void {
    const node = new DLLNode(value);
    if (this.tail === null) {
      this.head = node;
      this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }
    this._size++;
  }

  // Remove from front - O(1)
  popFront(): T | undefined {
    if (this.head === null) return undefined;
    const value = this.head.value;
    this.head = this.head.next;
    if (this.head !== null) {
      this.head.prev = null;
    } else {
      this.tail = null;
    }
    this._size--;
    return value;
  }

  // Remove from back - O(1)
  popBack(): T | undefined {
    if (this.tail === null) return undefined;
    const value = this.tail.value;
    this.tail = this.tail.prev;
    if (this.tail !== null) {
      this.tail.next = null;
    } else {
      this.head = null;
    }
    this._size--;
    return value;
  }

  // Get node at index - O(n)
  private nodeAt(index: number): DLLNode<T> | null {
    if (index < 0 || index >= this._size) return null;
    // Traverse from nearest end
    if (index <= this._size / 2) {
      let cur = this.head;
      for (let i = 0; i < index; i++) {
        cur = cur?.next ?? null;
      }
      return cur;
    } else {
      let cur = this.tail;
      for (let i = this._size - 1; i > index; i--) {
        cur = cur?.prev ?? null;
      }
      return cur;
    }
  }

  // Get value at index - O(n)
  get(index: number): T | undefined {
    return this.nodeAt(index)?.value;
  }

  // Insert at index - O(n)
  insertAt(index: number, value: T): void {
    if (index < 0 || index > this._size) throw new RangeError(`Index ${index} out of bounds`);
    if (index === 0) return this.pushFront(value);
    if (index === this._size) return this.pushBack(value);

    const node = new DLLNode(value);
    const before = this.nodeAt(index - 1)!;
    const after = before.next!;
    node.prev = before;
    node.next = after;
    before.next = node;
    after.prev = node;
    this._size++;
  }

  // Remove at index - O(n)
  removeAt(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined;
    if (index === 0) return this.popFront();
    if (index === this._size - 1) return this.popBack();

    const node = this.nodeAt(index)!;
    const before = node.prev!;
    const after = node.next!;
    before.next = after;
    after.prev = before;
    this._size--;
    return node.value;
  }

  // Find first element matching predicate - O(n)
  find(predicate: (value: T) => boolean): T | undefined {
    let cur = this.head;
    while (cur !== null) {
      if (predicate(cur.value)) return cur.value;
      cur = cur.next;
    }
    return undefined;
  }

  // Find index of first element matching predicate - O(n)
  findIndex(predicate: (value: T) => boolean): number {
    let cur = this.head;
    let i = 0;
    while (cur !== null) {
      if (predicate(cur.value)) return i;
      cur = cur.next;
      i++;
    }
    return -1;
  }

  // Iterate over all elements - O(n)
  forEach(callback: (value: T, index: number) => void): void {
    let cur = this.head;
    let i = 0;
    while (cur !== null) {
      callback(cur.value, i);
      cur = cur.next;
      i++;
    }
  }

  // Map to new list - O(n)
  map<U>(transform: (value: T, index: number) => U): DoublyLinkedList<U> {
    const result = new DoublyLinkedList<U>();
    this.forEach((value, i) => result.pushBack(transform(value, i)));
    return result;
  }

  // Filter to new list - O(n)
  filter(predicate: (value: T, index: number) => boolean): DoublyLinkedList<T> {
    const result = new DoublyLinkedList<T>();
    this.forEach((value, i) => {
      if (predicate(value, i)) result.pushBack(value);
    });
    return result;
  }

  // Convert to array - O(n)
  toArray(): T[] {
    const arr: T[] = [];
    let cur = this.head;
    while (cur !== null) {
      arr.push(cur.value);
      cur = cur.next;
    }
    return arr;
  }

  // Reverse in place - O(n)
  reverse(): void {
    let cur = this.head;
    while (cur !== null) {
      const tmp = cur.next;
      cur.next = cur.prev;
      cur.prev = tmp;
      cur = tmp;
    }
    const tmp = this.head;
    this.head = this.tail;
    this.tail = tmp;
  }

  // Iterator support
  [Symbol.iterator](): Iterator<T> {
    let cur = this.head;
    return {
      next(): IteratorResult<T> {
        if (cur === null) return { value: undefined as unknown as T, done: true };
        const value = cur.value;
        cur = cur.next;
        return { value, done: false };
      },
    };
  }

  // Create from array
  static fromArray<T>(arr: T[]): DoublyLinkedList<T> {
    const list = new DoublyLinkedList<T>();
    for (const item of arr) list.pushBack(item);
    return list;
  }
}
