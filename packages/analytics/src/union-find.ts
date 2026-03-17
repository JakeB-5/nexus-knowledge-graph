// Union-Find (Disjoint Set Union) data structure
// Uses path compression and union by rank for near-O(1) amortized operations

export class UnionFind {
  private parent: Map<string, string>;
  private rank: Map<string, number>;
  private _size: Map<string, number>;
  private _count: number;

  constructor(elements?: string[]) {
    this.parent = new Map();
    this.rank = new Map();
    this._size = new Map();
    this._count = 0;

    if (elements) {
      for (const el of elements) {
        this.add(el);
      }
    }
  }

  /** Add a new element as its own component */
  add(element: string): void {
    if (this.parent.has(element)) return;
    this.parent.set(element, element);
    this.rank.set(element, 0);
    this._size.set(element, 1);
    this._count++;
  }

  /** Find the representative (root) of the component containing element.
   *  Applies path compression: flattens the tree toward root. */
  find(element: string): string {
    if (!this.parent.has(element)) {
      this.add(element);
    }

    let root = element;
    // Walk up to find root
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }

    // Path compression: point all nodes directly to root
    let current = element;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }

    return root;
  }

  /** Union the components containing a and b.
   *  Uses union by rank to keep trees shallow. */
  union(a: string, b: string): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA === rootB) return false; // already in same component

    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;
    const sizeA = this._size.get(rootA) ?? 1;
    const sizeB = this._size.get(rootB) ?? 1;

    // Attach smaller rank tree under larger rank tree
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
      this._size.set(rootB, sizeA + sizeB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
      this._size.set(rootA, sizeA + sizeB);
    } else {
      // Equal rank: make rootB a child of rootA, increment rootA rank
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
      this._size.set(rootA, sizeA + sizeB);
    }

    this._count--;
    return true;
  }

  /** Check if a and b are in the same component */
  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }

  /** Number of distinct components */
  get count(): number {
    return this._count;
  }

  /** Size of the component containing element */
  componentSize(element: string): number {
    const root = this.find(element);
    return this._size.get(root) ?? 1;
  }

  /** Get all components as arrays of members */
  getComponents(): Map<string, string[]> {
    const components = new Map<string, string[]>();
    for (const element of this.parent.keys()) {
      const root = this.find(element);
      const existing = components.get(root);
      if (existing) {
        existing.push(element);
      } else {
        components.set(root, [element]);
      }
    }
    return components;
  }

  /** Get the largest component's size */
  largestComponentSize(): number {
    let max = 0;
    // Only look at roots (elements that are their own parent)
    for (const element of this.parent.keys()) {
      if (this.find(element) === element) {
        const size = this._size.get(element) ?? 1;
        if (size > max) max = size;
      }
    }
    return max;
  }

  /** Total number of elements tracked */
  get totalElements(): number {
    return this.parent.size;
  }
}
