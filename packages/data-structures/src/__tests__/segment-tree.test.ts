import { describe, it, expect } from 'vitest';
import { SegmentTree } from '../segment-tree.js';

describe('SegmentTree', () => {
  describe('sum segment tree', () => {
    it('queries sum over full range', () => {
      const st = SegmentTree.sum([1, 2, 3, 4, 5]);
      expect(st.query(0, 4)).toBe(15);
    });

    it('queries sum over subrange', () => {
      const st = SegmentTree.sum([1, 2, 3, 4, 5]);
      expect(st.query(1, 3)).toBe(9); // 2+3+4
    });

    it('queries single element', () => {
      const st = SegmentTree.sum([10, 20, 30]);
      expect(st.query(1, 1)).toBe(20);
    });

    it('point update changes sum', () => {
      const st = SegmentTree.sum([1, 2, 3, 4, 5]);
      st.update(2, 10); // replace 3 with 10
      expect(st.query(0, 4)).toBe(22);
      expect(st.query(1, 3)).toBe(16); // 2+10+4
    });

    it('range update adds to all elements in range', () => {
      const st = SegmentTree.sum([1, 2, 3, 4, 5]);
      st.rangeUpdate(1, 3, 10); // add 10 to indices 1..3
      expect(st.query(1, 3)).toBe(39); // (2+10)+(3+10)+(4+10)
      expect(st.query(0, 0)).toBe(1); // unchanged
      expect(st.query(4, 4)).toBe(5); // unchanged
    });

    it('get single element', () => {
      const st = SegmentTree.sum([5, 10, 15]);
      expect(st.get(0)).toBe(5);
      expect(st.get(1)).toBe(10);
      expect(st.get(2)).toBe(15);
    });
  });

  describe('min segment tree', () => {
    it('queries min over range', () => {
      const st = SegmentTree.min([5, 2, 8, 1, 9]);
      expect(st.query(0, 4)).toBe(1);
      expect(st.query(0, 2)).toBe(2);
    });

    it('point update changes min', () => {
      const st = SegmentTree.min([5, 2, 8, 1, 9]);
      st.update(3, 100); // replace 1 with 100
      expect(st.query(0, 4)).toBe(2);
    });

    it('range update sets range to value', () => {
      const st = SegmentTree.min([5, 2, 8, 1, 9]);
      st.rangeUpdate(0, 2, 0); // set indices 0..2 to 0
      expect(st.query(0, 2)).toBe(0);
      expect(st.query(3, 4)).toBe(1); // unchanged
    });
  });

  describe('max segment tree', () => {
    it('queries max over range', () => {
      const st = SegmentTree.max([3, 1, 4, 1, 5, 9, 2, 6]);
      expect(st.query(0, 7)).toBe(9);
      expect(st.query(0, 4)).toBe(5);
    });

    it('point update changes max', () => {
      const st = SegmentTree.max([1, 2, 3]);
      st.update(0, 100);
      expect(st.query(0, 2)).toBe(100);
    });
  });

  describe('gcd segment tree', () => {
    it('queries gcd over range', () => {
      const st = SegmentTree.gcd([12, 8, 6, 4]);
      expect(st.query(0, 1)).toBe(4); // gcd(12,8)=4
      expect(st.query(0, 3)).toBe(2); // gcd(12,8,6,4)=2
    });
  });

  describe('custom merge', () => {
    it('supports product merge', () => {
      const st = new SegmentTree<number>(
        [1, 2, 3, 4, 5],
        (a, b) => a * b,
        1,
      );
      expect(st.query(0, 4)).toBe(120);
      expect(st.query(1, 3)).toBe(24);
    });
  });

  describe('bounds checking', () => {
    it('throws on invalid range', () => {
      const st = SegmentTree.sum([1, 2, 3]);
      expect(() => st.query(-1, 2)).toThrow();
      expect(() => st.query(0, 5)).toThrow();
      expect(() => st.query(2, 1)).toThrow();
    });

    it('throws on invalid update index', () => {
      const st = SegmentTree.sum([1, 2, 3]);
      expect(() => st.update(-1, 5)).toThrow();
      expect(() => st.update(5, 5)).toThrow();
    });
  });

  describe('length', () => {
    it('returns correct length', () => {
      const st = SegmentTree.sum([1, 2, 3, 4, 5]);
      expect(st.length).toBe(5);
    });
  });
});
