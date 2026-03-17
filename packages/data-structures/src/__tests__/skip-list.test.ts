import { describe, it, expect, beforeEach } from 'vitest';
import { SkipList } from '../skip-list.js';

describe('SkipList', () => {
  let sl: SkipList<number, string>;

  beforeEach(() => {
    sl = new SkipList<number, string>();
  });

  describe('set / get / has', () => {
    it('starts empty', () => {
      expect(sl.size).toBe(0);
      expect(sl.get(1)).toBeUndefined();
      expect(sl.has(1)).toBe(false);
    });

    it('sets and gets a value', () => {
      sl.set(1, 'one');
      expect(sl.get(1)).toBe('one');
      expect(sl.has(1)).toBe(true);
    });

    it('updates existing key', () => {
      sl.set(1, 'one');
      sl.set(1, 'ONE');
      expect(sl.get(1)).toBe('ONE');
      expect(sl.size).toBe(1);
    });

    it('handles multiple entries', () => {
      sl.set(3, 'three');
      sl.set(1, 'one');
      sl.set(2, 'two');
      expect(sl.get(1)).toBe('one');
      expect(sl.get(2)).toBe('two');
      expect(sl.get(3)).toBe('three');
      expect(sl.size).toBe(3);
    });

    it('returns undefined for missing key', () => {
      sl.set(1, 'one');
      expect(sl.get(99)).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes existing key', () => {
      sl.set(1, 'one');
      sl.set(2, 'two');
      expect(sl.delete(1)).toBe(true);
      expect(sl.get(1)).toBeUndefined();
      expect(sl.size).toBe(1);
    });

    it('returns false for non-existing key', () => {
      sl.set(1, 'one');
      expect(sl.delete(99)).toBe(false);
    });

    it('can delete all elements', () => {
      [1, 2, 3].forEach((k) => sl.set(k, `v${k}`));
      [1, 2, 3].forEach((k) => sl.delete(k));
      expect(sl.size).toBe(0);
    });
  });

  describe('range query', () => {
    beforeEach(() => {
      [1, 3, 5, 7, 9, 11].forEach((k) => sl.set(k, `v${k}`));
    });

    it('returns entries within range', () => {
      const result = sl.range(3, 9);
      expect(result.map((e) => e.key)).toEqual([3, 5, 7, 9]);
    });

    it('returns empty for out-of-range', () => {
      expect(sl.range(20, 30)).toHaveLength(0);
    });

    it('inclusive bounds', () => {
      const result = sl.range(1, 11);
      expect(result.length).toBe(6);
    });

    it('single element range', () => {
      const result = sl.range(5, 5);
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe(5);
    });
  });

  describe('nearestKey / ceilingKey', () => {
    beforeEach(() => {
      [2, 4, 6, 8, 10].forEach((k) => sl.set(k, `v${k}`));
    });

    it('nearestKey returns floor key', () => {
      expect(sl.nearestKey(5)).toBe(4);
      expect(sl.nearestKey(4)).toBe(4);
      expect(sl.nearestKey(7)).toBe(6);
    });

    it('nearestKey returns undefined when all keys are larger', () => {
      expect(sl.nearestKey(1)).toBeUndefined();
    });

    it('ceilingKey returns ceiling key', () => {
      expect(sl.ceilingKey(5)).toBe(6);
      expect(sl.ceilingKey(6)).toBe(6);
      expect(sl.ceilingKey(3)).toBe(4);
    });

    it('ceilingKey returns undefined when all keys are smaller', () => {
      expect(sl.ceilingKey(11)).toBeUndefined();
    });
  });

  describe('min / max', () => {
    it('returns min and max', () => {
      [5, 2, 8, 1, 10].forEach((k) => sl.set(k, `v${k}`));
      expect(sl.min()?.key).toBe(1);
      expect(sl.max()?.key).toBe(10);
    });

    it('returns undefined for empty list', () => {
      expect(sl.min()).toBeUndefined();
      expect(sl.max()).toBeUndefined();
    });
  });

  describe('entries / iterator', () => {
    it('entries() returns sorted key-value pairs', () => {
      [3, 1, 2].forEach((k) => sl.set(k, `v${k}`));
      const entries = sl.entries();
      expect(entries.map((e) => e.key)).toEqual([1, 2, 3]);
    });

    it('supports for...of iteration', () => {
      [1, 2, 3].forEach((k) => sl.set(k, `v${k}`));
      const keys: number[] = [];
      for (const { key } of sl) keys.push(key);
      expect(keys).toEqual([1, 2, 3]);
    });
  });

  describe('clear', () => {
    it('clears all entries', () => {
      [1, 2, 3].forEach((k) => sl.set(k, `v${k}`));
      sl.clear();
      expect(sl.size).toBe(0);
      expect(sl.get(1)).toBeUndefined();
    });
  });

  describe('large scale', () => {
    it('handles 1000 insertions in sorted order', () => {
      for (let i = 1; i <= 1000; i++) sl.set(i, `v${i}`);
      expect(sl.size).toBe(1000);
      expect(sl.get(500)).toBe('v500');
      expect(sl.min()?.key).toBe(1);
      expect(sl.max()?.key).toBe(1000);
    });

    it('handles reverse order insertions', () => {
      for (let i = 1000; i >= 1; i--) sl.set(i, `v${i}`);
      expect(sl.size).toBe(1000);
      const entries = sl.entries();
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i]!.key).toBeGreaterThan(entries[i - 1]!.key);
      }
    });
  });

  describe('custom comparator', () => {
    it('supports custom comparator', () => {
      const strSl = new SkipList<string, number>({
        comparator: (a, b) => a.localeCompare(b),
      });
      strSl.set('banana', 2);
      strSl.set('apple', 1);
      strSl.set('cherry', 3);
      expect(strSl.min()?.key).toBe('apple');
      expect(strSl.max()?.key).toBe('cherry');
    });
  });
});
