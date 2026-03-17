// B-Tree node
class BTreeNode<K, V> {
  keys: K[] = [];
  values: V[] = [];
  children: BTreeNode<K, V>[] = [];
  isLeaf: boolean;

  constructor(isLeaf: boolean) {
    this.isLeaf = isLeaf;
  }

  get numKeys(): number {
    return this.keys.length;
  }
}

export class BTree<K, V> {
  private root: BTreeNode<K, V>;
  private readonly t: number; // minimum degree (order = 2t)
  private _size: number = 0;
  private readonly comparator: (a: K, b: K) => number;

  constructor(options?: {
    order?: number; // branching factor (min children for non-root internal nodes)
    comparator?: (a: K, b: K) => number;
  }) {
    // t = minimum degree, so max keys = 2t-1, min keys = t-1
    this.t = Math.max(2, Math.floor((options?.order ?? 3) / 2));
    this.comparator = options?.comparator ?? this.defaultComparator;
    this.root = new BTreeNode<K, V>(true);
  }

  get size(): number {
    return this._size;
  }

  private defaultComparator(a: K, b: K): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  // Find position of first key >= target using binary search
  private findPos(keys: K[], target: K): number {
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.comparator(keys[mid]!, target) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // Search for key - O(log n)
  get(key: K): V | undefined {
    return this.search(this.root, key);
  }

  private search(node: BTreeNode<K, V>, key: K): V | undefined {
    const i = this.findPos(node.keys, key);
    if (i < node.numKeys && this.comparator(node.keys[i]!, key) === 0) {
      return node.values[i];
    }
    if (node.isLeaf) return undefined;
    return this.search(node.children[i]!, key);
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  // Insert key-value pair - O(log n)
  insert(key: K, value: V): void {
    const existing = this.search(this.root, key);
    if (existing !== undefined) {
      this.update(this.root, key, value);
      return;
    }

    const root = this.root;
    if (root.numKeys === 2 * this.t - 1) {
      // Root is full, need to split
      const newRoot = new BTreeNode<K, V>(false);
      newRoot.children.push(root);
      this.splitChild(newRoot, 0);
      this.root = newRoot;
    }
    this.insertNonFull(this.root, key, value);
    this._size++;
  }

  private update(node: BTreeNode<K, V>, key: K, value: V): void {
    const i = this.findPos(node.keys, key);
    if (i < node.numKeys && this.comparator(node.keys[i]!, key) === 0) {
      node.values[i] = value;
      return;
    }
    if (!node.isLeaf) this.update(node.children[i]!, key, value);
  }

  private insertNonFull(node: BTreeNode<K, V>, key: K, value: V): void {
    let i = node.numKeys - 1;

    if (node.isLeaf) {
      // Insert into sorted position
      while (i >= 0 && this.comparator(node.keys[i]!, key) > 0) {
        node.keys[i + 1] = node.keys[i]!;
        node.values[i + 1] = node.values[i]!;
        i--;
      }
      node.keys[i + 1] = key;
      node.values[i + 1] = value;
    } else {
      // Find child to recurse into
      while (i >= 0 && this.comparator(node.keys[i]!, key) > 0) i--;
      i++;
      const child = node.children[i]!;
      if (child.numKeys === 2 * this.t - 1) {
        this.splitChild(node, i);
        if (this.comparator(node.keys[i]!, key) < 0) i++;
      }
      this.insertNonFull(node.children[i]!, key, value);
    }
  }

  // Split the i-th child of parent
  private splitChild(parent: BTreeNode<K, V>, i: number): void {
    const t = this.t;
    const full = parent.children[i]!;
    const right = new BTreeNode<K, V>(full.isLeaf);

    // Median key goes up to parent
    const medKey = full.keys[t - 1]!;
    const medVal = full.values[t - 1]!;

    // Right half of keys/values
    right.keys = full.keys.splice(t);
    right.values = full.values.splice(t);
    full.keys.splice(t - 1); // remove median
    full.values.splice(t - 1);

    if (!full.isLeaf) {
      right.children = full.children.splice(t);
    }

    // Insert median into parent
    parent.keys.splice(i, 0, medKey);
    parent.values.splice(i, 0, medVal);
    parent.children.splice(i + 1, 0, right);
  }

  // Delete key - O(log n)
  delete(key: K): boolean {
    if (!this.has(key)) return false;
    this.deleteKey(this.root, key);
    // If root is empty and has children, shrink tree
    if (this.root.numKeys === 0 && !this.root.isLeaf) {
      this.root = this.root.children[0]!;
    }
    this._size--;
    return true;
  }

  private deleteKey(node: BTreeNode<K, V>, key: K): void {
    const t = this.t;
    const i = this.findPos(node.keys, key);

    if (i < node.numKeys && this.comparator(node.keys[i]!, key) === 0) {
      // Key is in this node
      if (node.isLeaf) {
        node.keys.splice(i, 1);
        node.values.splice(i, 1);
      } else {
        const leftChild = node.children[i]!;
        const rightChild = node.children[i + 1]!;

        if (leftChild.numKeys >= t) {
          // Replace with predecessor
          const pred = this.getPredecessor(leftChild);
          node.keys[i] = pred.key;
          node.values[i] = pred.value;
          this.deleteKey(leftChild, pred.key);
        } else if (rightChild.numKeys >= t) {
          // Replace with successor
          const succ = this.getSuccessor(rightChild);
          node.keys[i] = succ.key;
          node.values[i] = succ.value;
          this.deleteKey(rightChild, succ.key);
        } else {
          // Merge left and right through key
          this.merge(node, i);
          this.deleteKey(leftChild, key);
        }
      }
    } else {
      // Key is not in this node
      if (node.isLeaf) return; // Not found

      const child = node.children[i]!;
      if (child.numKeys < t) {
        this.fill(node, i);
        // After fill, index might have changed
        const newI = this.findPos(node.keys, key);
        const newChild = newI < node.numKeys && this.comparator(node.keys[newI]!, key) === 0
          ? node.children[newI]!
          : node.children[Math.min(newI, node.children.length - 1)]!;
        this.deleteKey(newChild, key);
      } else {
        this.deleteKey(child, key);
      }
    }
  }

  private getPredecessor(node: BTreeNode<K, V>): { key: K; value: V } {
    let cur = node;
    while (!cur.isLeaf) cur = cur.children[cur.numKeys]!;
    return { key: cur.keys[cur.numKeys - 1]!, value: cur.values[cur.numKeys - 1]! };
  }

  private getSuccessor(node: BTreeNode<K, V>): { key: K; value: V } {
    let cur = node;
    while (!cur.isLeaf) cur = cur.children[0]!;
    return { key: cur.keys[0]!, value: cur.values[0]! };
  }

  // Merge children[i] and children[i+1] through keys[i]
  private merge(node: BTreeNode<K, V>, i: number): void {
    const left = node.children[i]!;
    const right = node.children[i + 1]!;

    left.keys.push(node.keys[i]!);
    left.values.push(node.values[i]!);
    left.keys.push(...right.keys);
    left.values.push(...right.values);
    if (!left.isLeaf) left.children.push(...right.children);

    node.keys.splice(i, 1);
    node.values.splice(i, 1);
    node.children.splice(i + 1, 1);
  }

  // Ensure child at index i has at least t keys
  private fill(node: BTreeNode<K, V>, i: number): void {
    const t = this.t;
    if (i > 0 && node.children[i - 1]!.numKeys >= t) {
      this.borrowFromPrev(node, i);
    } else if (i < node.numKeys && node.children[i + 1]!.numKeys >= t) {
      this.borrowFromNext(node, i);
    } else {
      if (i < node.numKeys) {
        this.merge(node, i);
      } else {
        this.merge(node, i - 1);
      }
    }
  }

  private borrowFromPrev(node: BTreeNode<K, V>, i: number): void {
    const child = node.children[i]!;
    const sibling = node.children[i - 1]!;

    child.keys.unshift(node.keys[i - 1]!);
    child.values.unshift(node.values[i - 1]!);
    if (!child.isLeaf) child.children.unshift(sibling.children.pop()!);

    node.keys[i - 1] = sibling.keys.pop()!;
    node.values[i - 1] = sibling.values.pop()!;
  }

  private borrowFromNext(node: BTreeNode<K, V>, i: number): void {
    const child = node.children[i]!;
    const sibling = node.children[i + 1]!;

    child.keys.push(node.keys[i]!);
    child.values.push(node.values[i]!);
    if (!child.isLeaf) child.children.push(sibling.children.shift()!);

    node.keys[i] = sibling.keys.shift()!;
    node.values[i] = sibling.values.shift()!;
  }

  // Range query: all entries with minKey <= key <= maxKey - O(log n + k)
  range(minKey: K, maxKey: K): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    this.rangeSearch(this.root, minKey, maxKey, result);
    return result;
  }

  private rangeSearch(
    node: BTreeNode<K, V>,
    min: K,
    max: K,
    result: Array<{ key: K; value: V }>,
  ): void {
    let i = 0;
    while (i < node.numKeys && this.comparator(node.keys[i]!, min) < 0) i++;

    for (; i < node.numKeys; i++) {
      if (this.comparator(node.keys[i]!, max) > 0) break;
      if (!node.isLeaf) this.rangeSearch(node.children[i]!, min, max, result);
      result.push({ key: node.keys[i]!, value: node.values[i]! });
    }
    if (!node.isLeaf) this.rangeSearch(node.children[i]!, min, max, result);
  }

  // Min key
  min(): { key: K; value: V } | undefined {
    if (this._size === 0) return undefined;
    let node = this.root;
    while (!node.isLeaf) node = node.children[0]!;
    return { key: node.keys[0]!, value: node.values[0]! };
  }

  // Max key
  max(): { key: K; value: V } | undefined {
    if (this._size === 0) return undefined;
    let node = this.root;
    while (!node.isLeaf) node = node.children[node.numKeys]!;
    return { key: node.keys[node.numKeys - 1]!, value: node.values[node.numKeys - 1]! };
  }

  // In-order traversal
  forEach(callback: (key: K, value: V) => void): void {
    this.inOrder(this.root, callback);
  }

  private inOrder(node: BTreeNode<K, V>, callback: (key: K, value: V) => void): void {
    for (let i = 0; i < node.numKeys; i++) {
      if (!node.isLeaf) this.inOrder(node.children[i]!, callback);
      callback(node.keys[i]!, node.values[i]!);
    }
    if (!node.isLeaf) this.inOrder(node.children[node.numKeys]!, callback);
  }

  // JSON visualization
  toJSON(): object {
    return this.nodeToJSON(this.root);
  }

  private nodeToJSON(node: BTreeNode<K, V>): object {
    const obj: { keys: K[]; values: V[]; children?: object[] } = {
      keys: [...node.keys],
      values: [...node.values],
    };
    if (!node.isLeaf) {
      obj.children = node.children.map((c) => this.nodeToJSON(c));
    }
    return obj;
  }
}
