// Disjoint Set (Union-Find) with path compression and union by rank
export class DisjointSet {
  private parent: number[];
  private rank: number[];
  private _componentCount: number;
  private _size: number;

  constructor(n: number) {
    this._size = n;
    this._componentCount = n;
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array<number>(n).fill(0);
  }

  // Find representative (root) with path compression - O(α(n)) amortized
  find(a: number): number {
    this.checkBounds(a);
    if (this.parent[a] !== a) {
      this.parent[a] = this.find(this.parent[a]!);
    }
    return this.parent[a]!;
  }

  // Union two sets by rank - O(α(n)) amortized
  union(a: number, b: number): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return false; // already connected

    // Union by rank
    if (this.rank[rootA]! < this.rank[rootB]!) {
      this.parent[rootA] = rootB;
    } else if (this.rank[rootA]! > this.rank[rootB]!) {
      this.parent[rootB] = rootA;
    } else {
      this.parent[rootB] = rootA;
      this.rank[rootA]!++;
    }

    this._componentCount--;
    return true;
  }

  // Check if two elements are in the same component
  connected(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }

  // Number of disjoint components
  get componentCount(): number {
    return this._componentCount;
  }

  // Total number of elements
  get size(): number {
    return this._size;
  }

  // Size of the component containing element a
  componentSize(a: number): number {
    const root = this.find(a);
    let count = 0;
    for (let i = 0; i < this._size; i++) {
      if (this.find(i) === root) count++;
    }
    return count;
  }

  // All components as arrays of elements
  allComponents(): number[][] {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < this._size; i++) {
      const root = this.find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }
    return [...groups.values()];
  }

  // Get all members of the same component as element a
  componentOf(a: number): number[] {
    const root = this.find(a);
    const members: number[] = [];
    for (let i = 0; i < this._size; i++) {
      if (this.find(i) === root) members.push(i);
    }
    return members;
  }

  // Reset to initial state (all separate)
  reset(): void {
    for (let i = 0; i < this._size; i++) {
      this.parent[i] = i;
      this.rank[i] = 0;
    }
    this._componentCount = this._size;
  }

  private checkBounds(a: number): void {
    if (a < 0 || a >= this._size) {
      throw new RangeError(`Element ${a} out of bounds [0, ${this._size - 1}]`);
    }
  }
}
