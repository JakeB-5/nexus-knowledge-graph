import { describe, it, expect } from 'vitest';
import { BloomFilter } from '../bloom-filter.js';

describe('BloomFilter', () => {
  describe('basic operations', () => {
    it('returns false for items not added', () => {
      const bf = new BloomFilter({ expectedItems: 100, falsePositiveRate: 0.01 });
      expect(bf.mightContain('hello')).toBe(false);
      expect(bf.mightContain('world')).toBe(false);
    });

    it('returns true for items added (no false negatives)', () => {
      const bf = new BloomFilter({ expectedItems: 100, falsePositiveRate: 0.01 });
      const words = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
      words.forEach((w) => bf.add(w));
      words.forEach((w) => expect(bf.mightContain(w)).toBe(true));
    });

    it('tracks approximate count', () => {
      const bf = new BloomFilter({ expectedItems: 1000, falsePositiveRate: 0.01 });
      for (let i = 0; i < 100; i++) bf.add(`item-${i}`);
      const est = bf.estimatedCount;
      // Estimated count should be in ballpark
      expect(est).toBeGreaterThan(50);
      expect(est).toBeLessThan(200);
    });
  });

  describe('configuration', () => {
    it('uses optimal bit count and hash count', () => {
      const bf = new BloomFilter({ expectedItems: 1000, falsePositiveRate: 0.01 });
      const info = bf.info;
      expect(info.numBits).toBeGreaterThan(0);
      expect(info.numHashes).toBeGreaterThan(0);
    });

    it('higher FP rate uses fewer bits', () => {
      const precise = new BloomFilter({ expectedItems: 1000, falsePositiveRate: 0.001 });
      const loose = new BloomFilter({ expectedItems: 1000, falsePositiveRate: 0.1 });
      expect(precise.info.numBits).toBeGreaterThan(loose.info.numBits);
    });

    it('accepts manual numBits and numHashes', () => {
      const bf = new BloomFilter({ numBits: 1000, numHashes: 5 });
      bf.add('test');
      expect(bf.mightContain('test')).toBe(true);
    });
  });

  describe('false positive rate', () => {
    it('false positive rate is within configured bounds (statistical)', () => {
      const targetFPR = 0.01;
      const bf = new BloomFilter({ expectedItems: 1000, falsePositiveRate: targetFPR });

      // Insert 1000 items
      for (let i = 0; i < 1000; i++) bf.add(`insert-${i}`);

      // Check 10000 items that were NOT inserted
      let falsePositives = 0;
      const trials = 10000;
      for (let i = 0; i < trials; i++) {
        if (bf.mightContain(`check-${i}`)) falsePositives++;
      }

      const actualFPR = falsePositives / trials;
      // Allow 3x tolerance due to statistical variance
      expect(actualFPR).toBeLessThan(targetFPR * 3);
    });
  });

  describe('merge', () => {
    it('merged filter contains all items from both filters', () => {
      const bf1 = new BloomFilter({ expectedItems: 100, falsePositiveRate: 0.01 });
      const bf2 = new BloomFilter({ expectedItems: 100, falsePositiveRate: 0.01 });

      bf1.add('apple');
      bf1.add('banana');
      bf2.add('cherry');
      bf2.add('date');

      const merged = bf1.merge(bf2);
      expect(merged.mightContain('apple')).toBe(true);
      expect(merged.mightContain('banana')).toBe(true);
      expect(merged.mightContain('cherry')).toBe(true);
      expect(merged.mightContain('date')).toBe(true);
    });

    it('throws when merging incompatible filters', () => {
      const bf1 = new BloomFilter({ numBits: 100, numHashes: 3 });
      const bf2 = new BloomFilter({ numBits: 200, numHashes: 4 });
      expect(() => bf1.merge(bf2)).toThrow();
    });
  });

  describe('serialization', () => {
    it('serializes and deserializes correctly', () => {
      const bf = new BloomFilter({ expectedItems: 100, falsePositiveRate: 0.01 });
      bf.add('hello');
      bf.add('world');

      const serialized = bf.serialize();
      expect(typeof serialized).toBe('string');

      const restored = BloomFilter.deserialize(serialized);
      expect(restored.mightContain('hello')).toBe(true);
      expect(restored.mightContain('world')).toBe(true);
      expect(restored.info.numBits).toBe(bf.info.numBits);
      expect(restored.info.numHashes).toBe(bf.info.numHashes);
    });

    it('preserves configuration after roundtrip', () => {
      const bf = new BloomFilter({ expectedItems: 500, falsePositiveRate: 0.05 });
      const restored = BloomFilter.deserialize(bf.serialize());
      expect(restored.info.numBits).toBe(bf.info.numBits);
      expect(restored.info.numHashes).toBe(bf.info.numHashes);
    });
  });

  describe('large scale', () => {
    it('handles 10000 items with no false negatives', () => {
      const bf = new BloomFilter({ expectedItems: 10000, falsePositiveRate: 0.01 });
      for (let i = 0; i < 10000; i++) bf.add(`item-${i}`);
      for (let i = 0; i < 10000; i++) {
        expect(bf.mightContain(`item-${i}`)).toBe(true);
      }
    });
  });
});
