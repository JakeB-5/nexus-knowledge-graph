// Trie node
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEnd = false;
  count = 0; // How many words pass through this node
}

export class Trie {
  private root: TrieNode = new TrieNode();
  private _size = 0;

  get size(): number {
    return this._size;
  }

  // Insert a word - O(m) where m = word length
  insert(word: string): void {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) {
        node.children.set(ch, new TrieNode());
      }
      node = node.children.get(ch)!;
      node.count++;
    }
    if (!node.isEnd) {
      node.isEnd = true;
      this._size++;
    }
  }

  // Search for exact word - O(m)
  search(word: string): boolean {
    const node = this.traverse(word);
    return node !== null && node.isEnd;
  }

  // Check if any word starts with prefix - O(m)
  startsWith(prefix: string): boolean {
    return this.traverse(prefix) !== null;
  }

  // Delete a word - O(m)
  delete(word: string): boolean {
    if (!this.search(word)) return false;
    this._delete(this.root, word, 0);
    this._size--;
    return true;
  }

  private _delete(node: TrieNode, word: string, depth: number): boolean {
    if (depth === word.length) {
      node.isEnd = false;
      return node.children.size === 0;
    }
    const ch = word[depth]!;
    const child = node.children.get(ch);
    if (!child) return false;

    child.count--;
    const shouldDelete = this._delete(child, word, depth + 1);
    if (shouldDelete) {
      node.children.delete(ch);
    }
    return !node.isEnd && node.children.size === 0;
  }

  // Traverse to the node at end of string, or null
  private traverse(str: string): TrieNode | null {
    let node = this.root;
    for (const ch of str) {
      const child = node.children.get(ch);
      if (!child) return null;
      node = child;
    }
    return node;
  }

  // Autocomplete: return up to `limit` words starting with prefix - O(p + k)
  autocomplete(prefix: string, limit = 10): string[] {
    const node = this.traverse(prefix);
    if (!node) return [];
    const results: string[] = [];
    this.collectWords(node, prefix, results, limit);
    return results;
  }

  // All words with a given prefix
  wordsWithPrefix(prefix: string): string[] {
    return this.autocomplete(prefix, Infinity);
  }

  private collectWords(
    node: TrieNode,
    current: string,
    results: string[],
    limit: number,
  ): void {
    if (results.length >= limit) return;
    if (node.isEnd) results.push(current);
    for (const [ch, child] of node.children) {
      if (results.length >= limit) break;
      this.collectWords(child, current + ch, results, limit);
    }
  }

  // Longest common prefix of all words in trie - O(m)
  longestCommonPrefix(): string {
    let prefix = '';
    let node = this.root;
    while (node.children.size === 1 && !node.isEnd) {
      const [ch, child] = [...node.children.entries()][0]!;
      prefix += ch;
      node = child;
    }
    return prefix;
  }

  // Wildcard search: ? matches exactly one char, * matches zero or more
  wildcardSearch(pattern: string): string[] {
    const results: string[] = [];
    this.wildcardDfs(this.root, pattern, 0, '', results);
    return results;
  }

  private wildcardDfs(
    node: TrieNode,
    pattern: string,
    pi: number,
    current: string,
    results: string[],
  ): void {
    if (pi === pattern.length) {
      if (node.isEnd) results.push(current);
      return;
    }

    const ch = pattern[pi]!;

    if (ch === '?') {
      // Match exactly one character
      for (const [c, child] of node.children) {
        this.wildcardDfs(child, pattern, pi + 1, current + c, results);
      }
    } else if (ch === '*') {
      // Match zero or more characters
      // Match zero chars
      this.wildcardDfs(node, pattern, pi + 1, current, results);
      // Match one or more chars
      for (const [c, child] of node.children) {
        // Consume one char, stay at '*'
        this.wildcardDfs(child, pattern, pi, current + c, results);
      }
    } else {
      const child = node.children.get(ch);
      if (child) {
        this.wildcardDfs(child, pattern, pi + 1, current + ch, results);
      }
    }
  }

  // All words in the trie
  allWords(): string[] {
    return this.wordsWithPrefix('');
  }

  // Clear all words
  clear(): void {
    this.root = new TrieNode();
    this._size = 0;
  }

  // Count words with given prefix
  countWithPrefix(prefix: string): number {
    const node = this.traverse(prefix);
    if (!node) return 0;
    return node.count;
  }
}
