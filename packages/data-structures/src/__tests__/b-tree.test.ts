import { describe, it, expect, beforeEach } from 'vitest';
import { BTree } from '../b-tree.js';

describe('BTree', () => {
  let tree: BTree<number, string>;

  beforeEach(() => {
    tree = new BTree<number, string>({ order: 4 }); // t=2, max 3 keys per node
  });

  describe('basic insert / get', () => {
    it('starts empty', () => {
      expect(tree.size).toBe(0);
      expect(tree.get(1)).toBeUndefined();
    });

    it('inserts and retrieves single entry', () => {
      tree.insert(1, 'one');
      expect(tree.get(1)).toBe('one');
      expect(tree.size).toBe(1);
    });

    it('inserts multiple entries', () => {
      tree.insert(3, 'three');
      tree.insert(1, 'one');
      tree.insert(2, 'two');
      expect(tree.get(1)).toBe('one');
      expect(tree.get(2)).toBe('two');
      expect(tree.get(3)).toBe('three');
    });

    it('updates existing key', () => {
      tree.insert(1, 'one');
      tree.insert(1, 'ONE');
      expect(tree.get(1)).toBe('ONE');
      expect(tree.size).toBe(1);
    });

    it('has() works correctly', () => {
      tree.insert(5, 'five');
      expect(tree.has(5)).toBe(true);
      expect(tree.has(6)).toBe(false);
    });
  });

  describe('splitting and balancing', () => {
    it('handles many insertions causing splits', () => {
      const keys = [10, 20, 5, 6, 12, 30, 7, 17, 3, 25, 15, 27, 1, 8, 13];
      keys.forEach((k) => tree.insert(k, `v${k}`));
      keys.forEach((k) => expect(tree.get(k)).toBe(`v${k}`));
      expect(tree.size).toBe(keys.length);
    });

    it('maintains sorted order after many inserts', () => {
      for (let i = 100; i >= 1; i--) tree.insert(i, `v${i}`);
      const inorder: number[] = [];
      tree.forEach((k) => inorder.push(k));
      for (let i = 1; i < inorder.length; i++) {
        expect(inorder[i]!).toBeGreaterThan(inorder[i - 1]!);
      }
    });
  });

  describe('delete', () => {
    it('deletes leaf key', () => {
      tree.insert(1, 'one');
      tree.insert(2, 'two');
      tree.insert(3, 'three');
      expect(tree.delete(2)).toBe(true);
      expect(tree.get(2)).toBeUndefined();
      expect(tree.size).toBe(2);
    });

    it('returns false for non-existing key', () => {
      tree.insert(1, 'one');
      expect(tree.delete(99)).toBe(false);
    });

    it('deletes all keys', () => {
      [1, 2, 3, 4, 5].forEach((k) => tree.insert(k, `v${k}`));
      [1, 2, 3, 4, 5].forEach((k) => tree.delete(k));
      expect(tree.size).toBe(0);
    });

    it('handles deletion with merge', () => {
      const keys = [10, 5, 15, 3, 7, 12, 20];
      keys.forEach((k) => tree.insert(k, `v${k}`));
      tree.delete(10);
      expect(tree.get(10)).toBeUndefined();
      [5, 15, 3, 7, 12, 20].forEach((k) => {
        expect(tree.get(k)).toBe(`v${k}`);
      });
    });

    it('handles 100 sequential inserts and deletes', () => {
      for (let i = 1; i <= 100; i++) tree.insert(i, `v${i}`);
      for (let i = 1; i <= 50; i++) tree.delete(i);
      expect(tree.size).toBe(50);
      for (let i = 51; i <= 100; i++) expect(tree.get(i)).toBe(`v${i}`);
    });
  });

  describe('range query', () => {
    beforeEach(() => {
      [1, 5, 10, 15, 20, 25, 30].forEach((k) => tree.insert(k, `v${k}`));
    });

    it('returns entries within range', () => {
      const result = tree.range(5, 20);
      expect(result.map((e) => e.key).sort((a, b) => a - b)).toEqual([5, 10, 15, 20]);
    });

    it('returns empty for out-of-range', () => {
      expect(tree.range(100, 200)).toEqual([]);
    });

    it('handles single element range', () => {
      const result = tree.range(10, 10);
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe(10);
    });
  });

  describe('min / max', () => {
    it('returns min and max', () => {
      [5, 1, 10, 3].forEach((k) => tree.insert(k, `v${k}`));
      expect(tree.min()?.key).toBe(1);
      expect(tree.max()?.key).toBe(10);
    });

    it('returns undefined for empty tree', () => {
      expect(tree.min()).toBeUndefined();
      expect(tree.max()).toBeUndefined();
    });
  });

  describe('forEach', () => {
    it('iterates in sorted order', () => {
      [3, 1, 4, 1, 5, 9, 2, 6].forEach((k) => tree.insert(k, `v${k}`));
      const keys: number[] = [];
      tree.forEach((k) => keys.push(k));
      const sorted = [...keys].sort((a, b) => a - b);
      expect(keys).toEqual(sorted);
    });
  });

  describe('toJSON', () => {
    it('returns tree structure', () => {
      tree.insert(1, 'one');
      tree.insert(2, 'two');
      const json = tree.toJSON();
      expect(json).toBeDefined();
      expect(typeof json).toBe('object');
    });
  });

  describe('custom comparator', () => {
    it('supports string keys with custom comparator', () => {
      const strTree = new BTree<string, number>({
        comparator: (a, b) => a.localeCompare(b),
      });
      strTree.insert('banana', 2);
      strTree.insert('apple', 1);
      strTree.insert('cherry', 3);
      expect(strTree.get('apple')).toBe(1);
      expect(strTree.min()?.key).toBe('apple');
      expect(strTree.max()?.key).toBe('cherry');
    });
  });
});
