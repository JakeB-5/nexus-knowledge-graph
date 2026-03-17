// Red-Black Tree colors
const RED = true;
const BLACK = false;

class RBNode<K, V> {
  key: K;
  value: V;
  color: boolean; // true = RED, false = BLACK
  left: RBNode<K, V> | null = null;
  right: RBNode<K, V> | null = null;
  parent: RBNode<K, V> | null = null;
  size: number = 1; // subtree size for rank queries

  constructor(key: K, value: V, color: boolean) {
    this.key = key;
    this.value = value;
    this.color = color;
  }
}

export class RedBlackTree<K, V> {
  private root: RBNode<K, V> | null = null;
  private _size = 0;
  private readonly comparator: (a: K, b: K) => number;

  constructor(comparator?: (a: K, b: K) => number) {
    this.comparator = comparator ?? this.defaultComparator;
  }

  get size(): number {
    return this._size;
  }

  private defaultComparator(a: K, b: K): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  private isRed(node: RBNode<K, V> | null): boolean {
    return node !== null && node.color === RED;
  }

  private nodeSize(node: RBNode<K, V> | null): number {
    return node?.size ?? 0;
  }

  private updateSize(node: RBNode<K, V>): void {
    node.size = 1 + this.nodeSize(node.left) + this.nodeSize(node.right);
  }

  // Left rotation
  private rotateLeft(x: RBNode<K, V>): RBNode<K, V> {
    const y = x.right!;
    x.right = y.left;
    if (y.left !== null) y.left.parent = x;
    y.parent = x.parent;

    if (x.parent === null) this.root = y;
    else if (x === x.parent.left) x.parent.left = y;
    else x.parent.right = y;

    y.left = x;
    x.parent = y;
    y.color = x.color;
    x.color = RED;
    y.size = x.size;
    this.updateSize(x);
    return y;
  }

  // Right rotation
  private rotateRight(y: RBNode<K, V>): RBNode<K, V> {
    const x = y.left!;
    y.left = x.right;
    if (x.right !== null) x.right.parent = y;
    x.parent = y.parent;

    if (y.parent === null) this.root = x;
    else if (y === y.parent.right) y.parent.right = x;
    else y.parent.left = x;

    x.right = y;
    y.parent = x;
    x.color = y.color;
    y.color = RED;
    x.size = y.size;
    this.updateSize(y);
    return x;
  }

  private flipColors(node: RBNode<K, V>): void {
    node.color = !node.color;
    if (node.left !== null) node.left.color = !node.left.color;
    if (node.right !== null) node.right.color = !node.right.color;
  }

  // Insert key-value pair - O(log n)
  insert(key: K, value: V): void {
    const existing = this.search(key);
    if (existing !== undefined) {
      this.updateNode(this.root, key, value);
      return;
    }

    this.root = this.insertNode(this.root, null, key, value);
    this.root.color = BLACK;
    this._size++;
  }

  private updateNode(node: RBNode<K, V> | null, key: K, value: V): void {
    if (node === null) return;
    const cmp = this.comparator(key, node.key);
    if (cmp < 0) this.updateNode(node.left, key, value);
    else if (cmp > 0) this.updateNode(node.right, key, value);
    else node.value = value;
  }

  private insertNode(
    node: RBNode<K, V> | null,
    parent: RBNode<K, V> | null,
    key: K,
    value: V,
  ): RBNode<K, V> {
    if (node === null) {
      const n = new RBNode(key, value, RED);
      n.parent = parent;
      return n;
    }

    const cmp = this.comparator(key, node.key);
    if (cmp < 0) {
      node.left = this.insertNode(node.left, node, key, value);
    } else if (cmp > 0) {
      node.right = this.insertNode(node.right, node, key, value);
    }

    // Fix up
    if (this.isRed(node.right) && !this.isRed(node.left)) node = this.rotateLeft(node);
    if (this.isRed(node.left) && this.isRed(node.left?.left ?? null)) node = this.rotateRight(node);
    if (this.isRed(node.left) && this.isRed(node.right)) this.flipColors(node);

    this.updateSize(node);
    return node;
  }

  // Search - O(log n)
  search(key: K): V | undefined {
    let node = this.root;
    while (node !== null) {
      const cmp = this.comparator(key, node.key);
      if (cmp < 0) node = node.left;
      else if (cmp > 0) node = node.right;
      else return node.value;
    }
    return undefined;
  }

  has(key: K): boolean {
    return this.search(key) !== undefined;
  }

  // Delete key - O(log n)
  delete(key: K): boolean {
    if (!this.has(key)) return false;
    if (!this.isRed(this.root?.left ?? null) && !this.isRed(this.root?.right ?? null)) {
      if (this.root) this.root.color = RED;
    }
    this.root = this.deleteNode(this.root!, key);
    if (this.root !== null) this.root.color = BLACK;
    this._size--;
    return true;
  }

  private deleteNode(node: RBNode<K, V>, key: K): RBNode<K, V> | null {
    if (this.comparator(key, node.key) < 0) {
      if (!this.isRed(node.left) && !this.isRed(node.left?.left ?? null)) {
        node = this.moveRedLeft(node);
      }
      node.left = this.deleteNode(node.left!, key);
    } else {
      if (this.isRed(node.left)) node = this.rotateRight(node);
      if (this.comparator(key, node.key) === 0 && node.right === null) return null;
      if (!this.isRed(node.right) && !this.isRed(node.right?.left ?? null)) {
        node = this.moveRedRight(node);
      }
      if (this.comparator(key, node.key) === 0) {
        const minNode = this.minNode(node.right!);
        node.key = minNode.key;
        node.value = minNode.value;
        node.right = this.deleteMin(node.right!);
      } else {
        node.right = this.deleteNode(node.right!, key);
      }
    }
    return this.balance(node);
  }

  private moveRedLeft(node: RBNode<K, V>): RBNode<K, V> {
    this.flipColors(node);
    if (this.isRed(node.right?.left ?? null)) {
      node.right = this.rotateRight(node.right!);
      node = this.rotateLeft(node);
      this.flipColors(node);
    }
    return node;
  }

  private moveRedRight(node: RBNode<K, V>): RBNode<K, V> {
    this.flipColors(node);
    if (this.isRed(node.left?.left ?? null)) {
      node = this.rotateRight(node);
      this.flipColors(node);
    }
    return node;
  }

  private balance(node: RBNode<K, V>): RBNode<K, V> {
    if (this.isRed(node.right) && !this.isRed(node.left)) node = this.rotateLeft(node);
    if (this.isRed(node.left) && this.isRed(node.left?.left ?? null)) node = this.rotateRight(node);
    if (this.isRed(node.left) && this.isRed(node.right)) this.flipColors(node);
    this.updateSize(node);
    return node;
  }

  private deleteMin(node: RBNode<K, V>): RBNode<K, V> | null {
    if (node.left === null) return null;
    if (!this.isRed(node.left) && !this.isRed(node.left.left)) {
      node = this.moveRedLeft(node);
    }
    node.left = this.deleteMin(node.left!);
    return this.balance(node);
  }

  private minNode(node: RBNode<K, V>): RBNode<K, V> {
    while (node.left !== null) node = node.left;
    return node;
  }

  // Min key - O(log n)
  min(): { key: K; value: V } | undefined {
    if (this.root === null) return undefined;
    const node = this.minNode(this.root);
    return { key: node.key, value: node.value };
  }

  // Max key - O(log n)
  max(): { key: K; value: V } | undefined {
    if (this.root === null) return undefined;
    let node = this.root;
    while (node.right !== null) node = node.right;
    return { key: node.key, value: node.value };
  }

  // Successor (next larger key) - O(log n)
  successor(key: K): { key: K; value: V } | undefined {
    let node = this.root;
    let succ: RBNode<K, V> | null = null;
    while (node !== null) {
      const cmp = this.comparator(key, node.key);
      if (cmp < 0) {
        succ = node;
        node = node.left;
      } else {
        node = node.right;
      }
    }
    return succ ? { key: succ.key, value: succ.value } : undefined;
  }

  // Predecessor (next smaller key) - O(log n)
  predecessor(key: K): { key: K; value: V } | undefined {
    let node = this.root;
    let pred: RBNode<K, V> | null = null;
    while (node !== null) {
      const cmp = this.comparator(key, node.key);
      if (cmp > 0) {
        pred = node;
        node = node.right;
      } else {
        node = node.left;
      }
    }
    return pred ? { key: pred.key, value: pred.value } : undefined;
  }

  // In-order traversal - O(n)
  inOrder(): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    this.inOrderTraversal(this.root, result);
    return result;
  }

  private inOrderTraversal(node: RBNode<K, V> | null, result: Array<{ key: K; value: V }>): void {
    if (node === null) return;
    this.inOrderTraversal(node.left, result);
    result.push({ key: node.key, value: node.value });
    this.inOrderTraversal(node.right, result);
  }

  // Pre-order traversal - O(n)
  preOrder(): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    this.preOrderTraversal(this.root, result);
    return result;
  }

  private preOrderTraversal(node: RBNode<K, V> | null, result: Array<{ key: K; value: V }>): void {
    if (node === null) return;
    result.push({ key: node.key, value: node.value });
    this.preOrderTraversal(node.left, result);
    this.preOrderTraversal(node.right, result);
  }

  // Post-order traversal - O(n)
  postOrder(): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    this.postOrderTraversal(this.root, result);
    return result;
  }

  private postOrderTraversal(node: RBNode<K, V> | null, result: Array<{ key: K; value: V }>): void {
    if (node === null) return;
    this.postOrderTraversal(node.left, result);
    this.postOrderTraversal(node.right, result);
    result.push({ key: node.key, value: node.value });
  }

  // Range query - O(log n + k)
  range(minKey: K, maxKey: K): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    this.rangeTraversal(this.root, minKey, maxKey, result);
    return result;
  }

  private rangeTraversal(
    node: RBNode<K, V> | null,
    min: K,
    max: K,
    result: Array<{ key: K; value: V }>,
  ): void {
    if (node === null) return;
    const cmpMin = this.comparator(node.key, min);
    const cmpMax = this.comparator(node.key, max);
    if (cmpMin > 0) this.rangeTraversal(node.left, min, max, result);
    if (cmpMin >= 0 && cmpMax <= 0) result.push({ key: node.key, value: node.value });
    if (cmpMax < 0) this.rangeTraversal(node.right, min, max, result);
  }

  // Rank query: kth smallest (0-based) - O(log n)
  kthSmallest(k: number): { key: K; value: V } | undefined {
    if (k < 0 || k >= this._size) return undefined;
    const node = this.rankNode(this.root, k);
    return node ? { key: node.key, value: node.value } : undefined;
  }

  private rankNode(node: RBNode<K, V> | null, k: number): RBNode<K, V> | null {
    if (node === null) return null;
    const leftSize = this.nodeSize(node.left);
    if (k < leftSize) return this.rankNode(node.left, k);
    if (k > leftSize) return this.rankNode(node.right, k - leftSize - 1);
    return node;
  }

  // Get rank of a key (0-based position in sorted order) - O(log n)
  rank(key: K): number {
    let node = this.root;
    let r = 0;
    while (node !== null) {
      const cmp = this.comparator(key, node.key);
      if (cmp < 0) {
        node = node.left;
      } else if (cmp > 0) {
        r += this.nodeSize(node.left) + 1;
        node = node.right;
      } else {
        r += this.nodeSize(node.left);
        return r;
      }
    }
    return -1; // not found
  }

  // Verify red-black invariants (for testing)
  verifyInvariants(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (this.root !== null && this.root.color !== BLACK) {
      errors.push('Root is not black');
    }
    this.verifyNode(this.root, errors);
    return { valid: errors.length === 0, errors };
  }

  private verifyNode(node: RBNode<K, V> | null, errors: string[]): number {
    if (node === null) return 1; // black height of null = 1

    if (this.isRed(node) && (this.isRed(node.left) || this.isRed(node.right))) {
      errors.push(`Red node ${String(node.key)} has red child`);
    }

    const leftHeight = this.verifyNode(node.left, errors);
    const rightHeight = this.verifyNode(node.right, errors);

    if (leftHeight !== rightHeight) {
      errors.push(`Black height mismatch at ${String(node.key)}: left=${leftHeight}, right=${rightHeight}`);
    }

    return leftHeight + (node.color === BLACK ? 1 : 0);
  }
}
