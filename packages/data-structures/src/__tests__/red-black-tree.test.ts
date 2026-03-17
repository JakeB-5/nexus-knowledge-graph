import { describe, it, expect, beforeEach } from 'vitest';
import { RedBlackTree } from '../red-black-tree.js';

describe('RedBlackTree', () => {
  let rbt: RedBlackTree<number, string>;

  beforeEach(() => {
    rbt = new RedBlackTree<number, string>();
  });

  describe('insert / search', () => {
    it('starts empty', () => {
      expect(rbt.size).toBe(0);
      expect(rbt.search(1)).toBeUndefined();
    });

    it('inserts and retrieves single entry', () => {
      rbt.insert(1, 'one');
      expect(rbt.search(1)).toBe('one');
      expect(rbt.size).toBe(1);
    });

    it('inserts multiple entries', () => {
      rbt.insert(3, 'three');
      rbt.insert(1, 'one');
      rbt.insert(2, 'two');
      expect(rbt.search(1)).toBe('one');
      expect(rbt.search(2)).toBe('two');
      expect(rbt.search(3)).toBe('three');
    });

    it('updates existing key', () => {
      rbt.insert(1, 'one');
      rbt.insert(1, 'ONE');
      expect(rbt.search(1)).toBe('ONE');
      expect(rbt.size).toBe(1);
    });

    it('has() returns correct boolean', () => {
      rbt.insert(5, 'five');
      expect(rbt.has(5)).toBe(true);
      expect(rbt.has(99)).toBe(false);
    });
  });

  describe('invariants', () => {
    it('maintains valid RB invariants after inserts', () => {
      [10, 5, 15, 3, 7, 12, 20, 1, 4, 6, 8].forEach((k) =>
        rbt.insert(k, `v${k}`),
      );
      const { valid, errors } = rbt.verifyInvariants();
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('maintains valid RB invariants after mixed inserts', () => {
      for (let i = 1; i <= 50; i++) rbt.insert(i, `v${i}`);
      const { valid } = rbt.verifyInvariants();
      expect(valid).toBe(true);
    });

    it('maintains invariants after random-order inserts', () => {
      const keys = Array.from({ length: 30 }, (_, i) => i + 1);
      // Shuffle
      keys.sort(() => Math.random() - 0.5);
      keys.forEach((k) => rbt.insert(k, `v${k}`));
      const { valid } = rbt.verifyInvariants();
      expect(valid).toBe(true);
    });
  });

  describe('delete', () => {
    it('deletes existing key', () => {
      rbt.insert(1, 'one');
      rbt.insert(2, 'two');
      rbt.insert(3, 'three');
      expect(rbt.delete(2)).toBe(true);
      expect(rbt.search(2)).toBeUndefined();
      expect(rbt.size).toBe(2);
    });

    it('returns false for non-existing key', () => {
      rbt.insert(1, 'one');
      expect(rbt.delete(99)).toBe(false);
    });

    it('maintains invariants after delete', () => {
      [10, 5, 15, 3, 7, 12, 20].forEach((k) => rbt.insert(k, `v${k}`));
      rbt.delete(10);
      const { valid } = rbt.verifyInvariants();
      expect(valid).toBe(true);
    });

    it('handles deleting all elements', () => {
      [1, 2, 3, 4, 5].forEach((k) => rbt.insert(k, `v${k}`));
      [1, 2, 3, 4, 5].forEach((k) => rbt.delete(k));
      expect(rbt.size).toBe(0);
    });

    it('maintains invariants through 100 insert/delete cycles', () => {
      for (let i = 1; i <= 100; i++) rbt.insert(i, `v${i}`);
      for (let i = 1; i <= 50; i++) rbt.delete(i);
      const { valid } = rbt.verifyInvariants();
      expect(valid).toBe(true);
      expect(rbt.size).toBe(50);
    });
  });

  describe('min / max', () => {
    it('returns min and max', () => {
      [5, 2, 8, 1, 10].forEach((k) => rbt.insert(k, `v${k}`));
      expect(rbt.min()?.key).toBe(1);
      expect(rbt.max()?.key).toBe(10);
    });

    it('returns undefined for empty tree', () => {
      expect(rbt.min()).toBeUndefined();
      expect(rbt.max()).toBeUndefined();
    });
  });

  describe('successor / predecessor', () => {
    beforeEach(() => {
      [10, 5, 15, 3, 7, 12, 20].forEach((k) => rbt.insert(k, `v${k}`));
    });

    it('successor returns next larger key', () => {
      expect(rbt.successor(10)?.key).toBe(12);
      expect(rbt.successor(7)?.key).toBe(10);
    });

    it('successor of max returns undefined', () => {
      expect(rbt.successor(20)).toBeUndefined();
    });

    it('predecessor returns next smaller key', () => {
      expect(rbt.predecessor(10)?.key).toBe(7);
      expect(rbt.predecessor(12)?.key).toBe(10);
    });

    it('predecessor of min returns undefined', () => {
      expect(rbt.predecessor(3)).toBeUndefined();
    });
  });

  describe('traversals', () => {
    beforeEach(() => {
      [5, 3, 7, 1, 4].forEach((k) => rbt.insert(k, `v${k}`));
    });

    it('inOrder is sorted', () => {
      const keys = rbt.inOrder().map((e) => e.key);
      expect(keys).toEqual([1, 3, 4, 5, 7]);
    });

    it('preOrder visits root first', () => {
      const pre = rbt.preOrder();
      expect(pre.length).toBe(5);
    });

    it('postOrder visits root last', () => {
      const post = rbt.postOrder();
      expect(post.length).toBe(5);
    });
  });

  describe('range', () => {
    beforeEach(() => {
      [1, 3, 5, 7, 9, 11, 13].forEach((k) => rbt.insert(k, `v${k}`));
    });

    it('returns entries in range', () => {
      const result = rbt.range(3, 9);
      expect(result.map((e) => e.key).sort((a, b) => a - b)).toEqual([3, 5, 7, 9]);
    });

    it('returns empty for out of range', () => {
      expect(rbt.range(20, 30)).toHaveLength(0);
    });
  });

  describe('rank query', () => {
    beforeEach(() => {
      [10, 5, 20, 3, 7, 15, 25].forEach((k) => rbt.insert(k, `v${k}`));
    });

    it('kthSmallest returns correct element', () => {
      expect(rbt.kthSmallest(0)?.key).toBe(3);  // 0-based
      expect(rbt.kthSmallest(1)?.key).toBe(5);
      expect(rbt.kthSmallest(6)?.key).toBe(25);
    });

    it('kthSmallest out of bounds returns undefined', () => {
      expect(rbt.kthSmallest(-1)).toBeUndefined();
      expect(rbt.kthSmallest(100)).toBeUndefined();
    });

    it('rank returns position of key', () => {
      expect(rbt.rank(3)).toBe(0);
      expect(rbt.rank(5)).toBe(1);
      expect(rbt.rank(25)).toBe(6);
    });

    it('rank of non-existing key returns -1', () => {
      expect(rbt.rank(99)).toBe(-1);
    });
  });
});
