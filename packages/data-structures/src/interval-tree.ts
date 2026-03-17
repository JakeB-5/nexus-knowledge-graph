// Interval tree based on augmented BST (AVL-balanced)
export interface Interval<T> {
  low: number;
  high: number;
  data: T;
}

class ITNode<T> {
  low: number;
  high: number;
  data: T;
  maxHigh: number; // max high value in this subtree
  left: ITNode<T> | null = null;
  right: ITNode<T> | null = null;
  height: number = 1;

  constructor(low: number, high: number, data: T) {
    this.low = low;
    this.high = high;
    this.data = data;
    this.maxHigh = high;
  }
}

export class IntervalTree<T> {
  private root: ITNode<T> | null = null;
  private _size = 0;

  get size(): number {
    return this._size;
  }

  private height(node: ITNode<T> | null): number {
    return node?.height ?? 0;
  }

  private maxHigh(node: ITNode<T> | null): number {
    return node?.maxHigh ?? -Infinity;
  }

  private update(node: ITNode<T>): void {
    node.height = 1 + Math.max(this.height(node.left), this.height(node.right));
    node.maxHigh = Math.max(
      node.high,
      this.maxHigh(node.left),
      this.maxHigh(node.right),
    );
  }

  private balanceFactor(node: ITNode<T>): number {
    return this.height(node.left) - this.height(node.right);
  }

  private rotateRight(y: ITNode<T>): ITNode<T> {
    const x = y.left!;
    const T2 = x.right;
    x.right = y;
    y.left = T2;
    this.update(y);
    this.update(x);
    return x;
  }

  private rotateLeft(x: ITNode<T>): ITNode<T> {
    const y = x.right!;
    const T2 = y.left;
    y.left = x;
    x.right = T2;
    this.update(x);
    this.update(y);
    return y;
  }

  private balance(node: ITNode<T>): ITNode<T> {
    this.update(node);
    const bf = this.balanceFactor(node);

    if (bf > 1) {
      // Left heavy
      if (this.balanceFactor(node.left!) < 0) {
        node.left = this.rotateLeft(node.left!);
      }
      return this.rotateRight(node);
    }
    if (bf < -1) {
      // Right heavy
      if (this.balanceFactor(node.right!) > 0) {
        node.right = this.rotateRight(node.right!);
      }
      return this.rotateLeft(node);
    }
    return node;
  }

  // Insert interval - O(log n)
  insert(low: number, high: number, data: T): void {
    if (low > high) throw new RangeError(`Invalid interval [${low}, ${high}]`);
    this.root = this.insertNode(this.root, low, high, data);
    this._size++;
  }

  private insertNode(node: ITNode<T> | null, low: number, high: number, data: T): ITNode<T> {
    if (node === null) return new ITNode(low, high, data);

    if (low < node.low || (low === node.low && high < node.high)) {
      node.left = this.insertNode(node.left, low, high, data);
    } else {
      node.right = this.insertNode(node.right, low, high, data);
    }

    return this.balance(node);
  }

  // Query: all intervals containing point - O(log n + k)
  query(point: number): Array<Interval<T>> {
    const result: Array<Interval<T>> = [];
    this.queryPoint(this.root, point, result);
    return result;
  }

  private queryPoint(node: ITNode<T> | null, point: number, result: Array<Interval<T>>): void {
    if (node === null) return;
    // Prune: if max high in subtree < point, no intervals can contain it
    if (node.maxHigh < point) return;

    // Check left subtree
    this.queryPoint(node.left, point, result);

    // Check this node
    if (node.low <= point && point <= node.high) {
      result.push({ low: node.low, high: node.high, data: node.data });
    }

    // Check right subtree only if node.low <= point
    if (node.low <= point) {
      this.queryPoint(node.right, point, result);
    }
  }

  // All intervals overlapping with [low, high] - O(log n + k)
  overlapping(low: number, high: number): Array<Interval<T>> {
    const result: Array<Interval<T>> = [];
    this.queryOverlap(this.root, low, high, result);
    return result;
  }

  private queryOverlap(
    node: ITNode<T> | null,
    low: number,
    high: number,
    result: Array<Interval<T>>,
  ): void {
    if (node === null) return;
    if (node.maxHigh < low) return; // Prune: no interval in subtree can overlap

    this.queryOverlap(node.left, low, high, result);

    // Two intervals [a,b] and [c,d] overlap iff a <= d && c <= b
    if (node.low <= high && low <= node.high) {
      result.push({ low: node.low, high: node.high, data: node.data });
    }

    if (node.low <= high) {
      this.queryOverlap(node.right, low, high, result);
    }
  }

  // Remove first interval matching [low, high] - O(log n)
  remove(low: number, high: number): boolean {
    const beforeSize = this._size;
    this.root = this.removeNode(this.root, low, high);
    return this._size < beforeSize;
  }

  private removeNode(node: ITNode<T> | null, low: number, high: number): ITNode<T> | null {
    if (node === null) return null;

    if (low < node.low || (low === node.low && high < node.high)) {
      node.left = this.removeNode(node.left, low, high);
    } else if (low === node.low && high === node.high) {
      // Found: remove this node
      this._size--;
      if (node.left === null) return node.right;
      if (node.right === null) return node.left;
      // Replace with inorder successor
      const succ = this.minNode(node.right);
      node.low = succ.low;
      node.high = succ.high;
      node.data = succ.data;
      node.right = this.removeMin(node.right);
    } else {
      node.right = this.removeNode(node.right, low, high);
    }

    return this.balance(node);
  }

  private minNode(node: ITNode<T>): ITNode<T> {
    while (node.left !== null) node = node.left;
    return node;
  }

  private removeMin(node: ITNode<T>): ITNode<T> | null {
    if (node.left === null) return node.right;
    node.left = this.removeMin(node.left);
    return this.balance(node);
  }

  // All intervals in the tree
  all(): Array<Interval<T>> {
    const result: Array<Interval<T>> = [];
    this.inOrder(this.root, result);
    return result;
  }

  private inOrder(node: ITNode<T> | null, result: Array<Interval<T>>): void {
    if (node === null) return;
    this.inOrder(node.left, result);
    result.push({ low: node.low, high: node.high, data: node.data });
    this.inOrder(node.right, result);
  }

  clear(): void {
    this.root = null;
    this._size = 0;
  }
}
