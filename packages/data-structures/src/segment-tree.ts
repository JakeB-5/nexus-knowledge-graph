// Segment tree with lazy propagation and configurable merge function
export type MergeFunction<T> = (a: T, b: T) => T;

export class SegmentTree<T> {
  private readonly n: number;
  private readonly tree: T[];
  private readonly lazy: T[];
  private readonly identity: T;
  private readonly merge: MergeFunction<T>;
  private readonly lazyMerge: MergeFunction<T>; // How to combine lazy updates
  private readonly applyLazy: (value: T, lazy: T, size: number) => T;

  constructor(
    data: T[],
    merge: MergeFunction<T>,
    identity: T,
    options?: {
      lazyMerge?: MergeFunction<T>;
      applyLazy?: (value: T, lazy: T, size: number) => T;
    },
  ) {
    this.n = data.length;
    this.merge = merge;
    this.identity = identity;
    this.lazyMerge = options?.lazyMerge ?? ((_, b) => b);
    this.applyLazy = options?.applyLazy ?? ((value, lazy) => this.merge(value, lazy));
    this.tree = new Array<T>(4 * this.n).fill(identity);
    this.lazy = new Array<T>(4 * this.n).fill(identity);
    if (this.n > 0) this.build(data, 1, 0, this.n - 1);
  }

  // Build tree from array - O(n)
  private build(data: T[], node: number, start: number, end: number): void {
    if (start === end) {
      this.tree[node] = data[start] ?? this.identity;
      return;
    }
    const mid = (start + end) >> 1;
    this.build(data, 2 * node, start, mid);
    this.build(data, 2 * node + 1, mid + 1, end);
    this.tree[node] = this.merge(this.tree[2 * node]!, this.tree[2 * node + 1]!);
  }

  // Push lazy updates down to children
  private pushDown(node: number, start: number, end: number): void {
    if (this.lazy[node] === this.identity) return;
    const mid = (start + end) >> 1;
    const leftSize = mid - start + 1;
    const rightSize = end - mid;

    this.tree[2 * node] = this.applyLazy(this.tree[2 * node]!, this.lazy[node]!, leftSize);
    this.lazy[2 * node] = this.lazyMerge(this.lazy[2 * node]!, this.lazy[node]!);

    this.tree[2 * node + 1] = this.applyLazy(this.tree[2 * node + 1]!, this.lazy[node]!, rightSize);
    this.lazy[2 * node + 1] = this.lazyMerge(this.lazy[2 * node + 1]!, this.lazy[node]!);

    this.lazy[node] = this.identity;
  }

  // Point update: set index i to value - O(log n)
  update(index: number, value: T): void {
    if (index < 0 || index >= this.n) throw new RangeError(`Index ${index} out of bounds`);
    this.pointUpdate(1, 0, this.n - 1, index, value);
  }

  private pointUpdate(node: number, start: number, end: number, idx: number, value: T): void {
    if (start === end) {
      this.tree[node] = value;
      this.lazy[node] = this.identity;
      return;
    }
    this.pushDown(node, start, end);
    const mid = (start + end) >> 1;
    if (idx <= mid) this.pointUpdate(2 * node, start, mid, idx, value);
    else this.pointUpdate(2 * node + 1, mid + 1, end, idx, value);
    this.tree[node] = this.merge(this.tree[2 * node]!, this.tree[2 * node + 1]!);
  }

  // Range update: apply value to all elements in [l, r] - O(log n)
  rangeUpdate(l: number, r: number, value: T): void {
    if (l < 0 || r >= this.n || l > r) throw new RangeError(`Invalid range [${l}, ${r}]`);
    this.rangeUpdateHelper(1, 0, this.n - 1, l, r, value);
  }

  private rangeUpdateHelper(
    node: number, start: number, end: number, l: number, r: number, value: T,
  ): void {
    if (r < start || end < l) return;
    if (l <= start && end <= r) {
      this.tree[node] = this.applyLazy(this.tree[node]!, value, end - start + 1);
      this.lazy[node] = this.lazyMerge(this.lazy[node]!, value);
      return;
    }
    this.pushDown(node, start, end);
    const mid = (start + end) >> 1;
    this.rangeUpdateHelper(2 * node, start, mid, l, r, value);
    this.rangeUpdateHelper(2 * node + 1, mid + 1, end, l, r, value);
    this.tree[node] = this.merge(this.tree[2 * node]!, this.tree[2 * node + 1]!);
  }

  // Range query: merge of [l, r] - O(log n)
  query(l: number, r: number): T {
    if (l < 0 || r >= this.n || l > r) throw new RangeError(`Invalid range [${l}, ${r}]`);
    return this.queryHelper(1, 0, this.n - 1, l, r);
  }

  private queryHelper(node: number, start: number, end: number, l: number, r: number): T {
    if (r < start || end < l) return this.identity;
    if (l <= start && end <= r) return this.tree[node]!;
    this.pushDown(node, start, end);
    const mid = (start + end) >> 1;
    return this.merge(
      this.queryHelper(2 * node, start, mid, l, r),
      this.queryHelper(2 * node + 1, mid + 1, end, l, r),
    );
  }

  // Get single element value
  get(index: number): T {
    return this.query(index, index);
  }

  get length(): number {
    return this.n;
  }

  // Create sum segment tree
  static sum(data: number[]): SegmentTree<number> {
    return new SegmentTree<number>(data, (a, b) => a + b, 0, {
      lazyMerge: (a, b) => a + b,
      applyLazy: (value, lazy, size) => value + lazy * size,
    });
  }

  // Create min segment tree
  static min(data: number[]): SegmentTree<number> {
    return new SegmentTree<number>(data, Math.min, Infinity, {
      lazyMerge: (_, b) => b,
      applyLazy: (_, lazy) => lazy,
    });
  }

  // Create max segment tree
  static max(data: number[]): SegmentTree<number> {
    return new SegmentTree<number>(data, Math.max, -Infinity, {
      lazyMerge: (_, b) => b,
      applyLazy: (_, lazy) => lazy,
    });
  }

  // Create GCD segment tree
  static gcd(data: number[]): SegmentTree<number> {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    return new SegmentTree<number>(data, gcd, 0);
  }
}
