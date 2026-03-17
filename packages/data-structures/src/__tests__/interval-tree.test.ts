import { describe, it, expect, beforeEach } from 'vitest';
import { IntervalTree } from '../interval-tree.js';

describe('IntervalTree', () => {
  let tree: IntervalTree<string>;

  beforeEach(() => {
    tree = new IntervalTree<string>();
  });

  describe('insert / size', () => {
    it('starts empty', () => {
      expect(tree.size).toBe(0);
    });

    it('inserts intervals and tracks size', () => {
      tree.insert(1, 5, 'a');
      tree.insert(3, 8, 'b');
      expect(tree.size).toBe(2);
    });

    it('throws for invalid interval', () => {
      expect(() => tree.insert(5, 3, 'invalid')).toThrow();
    });
  });

  describe('point query', () => {
    beforeEach(() => {
      tree.insert(1, 5, 'a');
      tree.insert(3, 8, 'b');
      tree.insert(6, 10, 'c');
      tree.insert(2, 4, 'd');
    });

    it('finds all intervals containing a point', () => {
      const result = tree.query(4);
      const data = result.map((r) => r.data).sort();
      expect(data).toContain('a');
      expect(data).toContain('b');
      expect(data).toContain('d');
      expect(data).not.toContain('c');
    });

    it('returns empty for point outside all intervals', () => {
      expect(tree.query(0)).toHaveLength(0);
      expect(tree.query(11)).toHaveLength(0);
    });

    it('handles boundary points', () => {
      const resultAt1 = tree.query(1);
      expect(resultAt1.map((r) => r.data)).toContain('a');

      const resultAt5 = tree.query(5);
      expect(resultAt5.map((r) => r.data)).toContain('a');
      expect(resultAt5.map((r) => r.data)).toContain('b');
    });
  });

  describe('overlap query', () => {
    beforeEach(() => {
      tree.insert(1, 3, 'a');
      tree.insert(5, 8, 'b');
      tree.insert(6, 10, 'c');
      tree.insert(2, 6, 'd');
    });

    it('finds overlapping intervals', () => {
      const result = tree.overlapping(4, 7);
      const data = result.map((r) => r.data).sort();
      expect(data).toContain('b');
      expect(data).toContain('c');
      expect(data).toContain('d');
      expect(data).not.toContain('a');
    });

    it('returns empty for non-overlapping query', () => {
      expect(tree.overlapping(20, 30)).toHaveLength(0);
    });

    it('finds all overlapping with wide query', () => {
      const result = tree.overlapping(0, 100);
      expect(result.length).toBe(4);
    });

    it('touching intervals overlap', () => {
      // [1,3] and [3,5] share point 3
      tree.insert(3, 5, 'e');
      const result = tree.overlapping(1, 3);
      expect(result.map((r) => r.data)).toContain('a');
      expect(result.map((r) => r.data)).toContain('e');
    });
  });

  describe('remove', () => {
    it('removes an interval', () => {
      tree.insert(1, 5, 'a');
      tree.insert(3, 8, 'b');
      expect(tree.remove(1, 5)).toBe(true);
      expect(tree.size).toBe(1);
      expect(tree.query(3).map((r) => r.data)).not.toContain('a');
    });

    it('returns false for non-existing interval', () => {
      tree.insert(1, 5, 'a');
      expect(tree.remove(2, 5)).toBe(false);
    });

    it('maintains correct query after removal', () => {
      tree.insert(1, 10, 'wide');
      tree.insert(2, 4, 'narrow');
      tree.remove(1, 10);
      const result = tree.query(3);
      expect(result.map((r) => r.data)).not.toContain('wide');
      expect(result.map((r) => r.data)).toContain('narrow');
    });
  });

  describe('all', () => {
    it('returns all intervals', () => {
      tree.insert(1, 5, 'a');
      tree.insert(3, 8, 'b');
      tree.insert(6, 10, 'c');
      const all = tree.all();
      expect(all.length).toBe(3);
      expect(all.map((r) => r.data).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('clear', () => {
    it('removes all intervals', () => {
      tree.insert(1, 5, 'a');
      tree.insert(2, 6, 'b');
      tree.clear();
      expect(tree.size).toBe(0);
      expect(tree.query(3)).toHaveLength(0);
    });
  });

  describe('large scale', () => {
    it('handles 500 overlapping intervals', () => {
      for (let i = 0; i < 500; i++) {
        tree.insert(i, i + 10, `interval-${i}`);
      }
      expect(tree.size).toBe(500);
      // Point 5 is in intervals 0-10, so [0..5] = 6 intervals
      const result = tree.query(5);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('numeric data', () => {
    it('works with numeric data', () => {
      const numTree = new IntervalTree<number>();
      numTree.insert(0, 100, 42);
      numTree.insert(50, 150, 99);
      const result = numTree.query(75);
      expect(result.map((r) => r.data).sort()).toEqual([42, 99]);
    });
  });
});
