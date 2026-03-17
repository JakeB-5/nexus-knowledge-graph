/**
 * Union-Find (Disjoint Set Union) data structure
 * with path compression and union by rank.
 */
export class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();
  private _componentCount: number = 0;
  private componentSizes: Map<string, number> = new Map();

  constructor(nodes?: string[]) {
    if (nodes) {
      for (const node of nodes) {
        this.add(node);
      }
    }
  }

  /** Add a node to the union-find structure */
  add(node: string): void {
    if (!this.parent.has(node)) {
      this.parent.set(node, node);
      this.rank.set(node, 0);
      this.componentSizes.set(node, 1);
      this._componentCount++;
    }
  }

  /** Find the root representative of the component containing node */
  find(node: string): string {
    if (!this.parent.has(node)) {
      this.add(node);
    }
    // Path compression: flatten tree to make future finds faster
    if (this.parent.get(node) !== node) {
      this.parent.set(node, this.find(this.parent.get(node)!));
    }
    return this.parent.get(node)!;
  }

  /** Union the components containing a and b; returns true if they were separate */
  union(a: string, b: string): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA === rootB) return false;

    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;
    const sizeA = this.componentSizes.get(rootA) ?? 1;
    const sizeB = this.componentSizes.get(rootB) ?? 1;

    // Union by rank: attach smaller tree under larger tree
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
      this.componentSizes.set(rootB, sizeA + sizeB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
      this.componentSizes.set(rootA, sizeA + sizeB);
    } else {
      this.parent.set(rootB, rootA);
      this.componentSizes.set(rootA, sizeA + sizeB);
      this.rank.set(rootA, rankA + 1);
    }

    this._componentCount--;
    return true;
  }

  /** Check if two nodes are in the same component */
  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }

  /** Number of distinct components */
  get componentCount(): number {
    return this._componentCount;
  }

  /** Size of the component containing node */
  getComponentSize(node: string): number {
    return this.componentSizes.get(this.find(node)) ?? 0;
  }

  /** Get all nodes in the same component as the given node */
  getComponent(node: string): string[] {
    const root = this.find(node);
    const result: string[] = [];
    for (const n of this.parent.keys()) {
      if (this.find(n) === root) {
        result.push(n);
      }
    }
    return result;
  }

  /** Get all components as arrays of node IDs */
  getAllComponents(): string[][] {
    const componentMap = new Map<string, string[]>();
    for (const node of this.parent.keys()) {
      const root = this.find(node);
      if (!componentMap.has(root)) {
        componentMap.set(root, []);
      }
      componentMap.get(root)!.push(node);
    }
    return Array.from(componentMap.values());
  }

  /** Get a map from each node to its component root */
  getRootMap(): Map<string, string> {
    const result = new Map<string, string>();
    for (const node of this.parent.keys()) {
      result.set(node, this.find(node));
    }
    return result;
  }
}
