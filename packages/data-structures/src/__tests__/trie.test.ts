import { describe, it, expect, beforeEach } from 'vitest';
import { Trie } from '../trie.js';

describe('Trie', () => {
  let trie: Trie;

  beforeEach(() => {
    trie = new Trie();
  });

  describe('insert / search', () => {
    it('starts empty', () => {
      expect(trie.size).toBe(0);
      expect(trie.search('hello')).toBe(false);
    });

    it('inserts and finds words', () => {
      trie.insert('hello');
      trie.insert('world');
      expect(trie.search('hello')).toBe(true);
      expect(trie.search('world')).toBe(true);
    });

    it('does not find partial words', () => {
      trie.insert('hello');
      expect(trie.search('hell')).toBe(false);
      expect(trie.search('helloo')).toBe(false);
    });

    it('tracks size correctly', () => {
      trie.insert('a');
      trie.insert('b');
      trie.insert('a'); // duplicate
      expect(trie.size).toBe(2);
    });

    it('handles empty string', () => {
      trie.insert('');
      expect(trie.search('')).toBe(true);
      expect(trie.size).toBe(1);
    });
  });

  describe('startsWith', () => {
    it('returns true for existing prefix', () => {
      trie.insert('hello');
      expect(trie.startsWith('hel')).toBe(true);
      expect(trie.startsWith('hello')).toBe(true);
      expect(trie.startsWith('')).toBe(true);
    });

    it('returns false for non-existing prefix', () => {
      trie.insert('hello');
      expect(trie.startsWith('world')).toBe(false);
      expect(trie.startsWith('helloo')).toBe(false);
    });
  });

  describe('delete', () => {
    it('deletes existing word', () => {
      trie.insert('hello');
      trie.insert('hell');
      expect(trie.delete('hello')).toBe(true);
      expect(trie.search('hello')).toBe(false);
      expect(trie.search('hell')).toBe(true);
      expect(trie.size).toBe(1);
    });

    it('returns false for non-existing word', () => {
      trie.insert('hello');
      expect(trie.delete('world')).toBe(false);
    });

    it('deletes prefix word without affecting longer words', () => {
      trie.insert('he');
      trie.insert('hello');
      trie.delete('he');
      expect(trie.search('he')).toBe(false);
      expect(trie.search('hello')).toBe(true);
    });

    it('deletes and reduces size', () => {
      trie.insert('abc');
      trie.insert('abd');
      trie.delete('abc');
      expect(trie.size).toBe(1);
    });
  });

  describe('autocomplete', () => {
    beforeEach(() => {
      ['apple', 'app', 'application', 'apt', 'banana', 'band'].forEach((w) =>
        trie.insert(w),
      );
    });

    it('returns all words with given prefix', () => {
      const results = trie.autocomplete('app');
      expect(results).toContain('app');
      expect(results).toContain('apple');
      expect(results).toContain('application');
      expect(results).not.toContain('apt');
      expect(results).not.toContain('banana');
    });

    it('respects limit parameter', () => {
      const results = trie.autocomplete('app', 2);
      expect(results.length).toBe(2);
    });

    it('returns empty for non-matching prefix', () => {
      expect(trie.autocomplete('xyz')).toEqual([]);
    });

    it('returns all words for empty prefix', () => {
      const results = trie.autocomplete('');
      expect(results.length).toBe(6);
    });
  });

  describe('wordsWithPrefix', () => {
    it('returns all words with prefix', () => {
      trie.insert('cat');
      trie.insert('cats');
      trie.insert('catch');
      trie.insert('dog');
      const words = trie.wordsWithPrefix('cat');
      expect(words.sort()).toEqual(['cat', 'catch', 'cats']);
    });
  });

  describe('longestCommonPrefix', () => {
    it('returns common prefix of all words', () => {
      trie.insert('interview');
      trie.insert('interact');
      trie.insert('interface');
      expect(trie.longestCommonPrefix()).toBe('inter');
    });

    it('returns empty string when no common prefix', () => {
      trie.insert('apple');
      trie.insert('banana');
      expect(trie.longestCommonPrefix()).toBe('');
    });

    it('returns single word when only one word', () => {
      trie.insert('hello');
      expect(trie.longestCommonPrefix()).toBe('hello');
    });

    it('returns empty for empty trie', () => {
      expect(trie.longestCommonPrefix()).toBe('');
    });
  });

  describe('wildcardSearch', () => {
    beforeEach(() => {
      ['cat', 'car', 'card', 'bat', 'bar', 'bare'].forEach((w) =>
        trie.insert(w),
      );
    });

    it('? matches exactly one character', () => {
      const results = trie.wildcardSearch('ca?');
      expect(results.sort()).toEqual(['car', 'cat']);
    });

    it('* matches zero or more characters', () => {
      const results = trie.wildcardSearch('ba*');
      expect(results.sort()).toEqual(['bar', 'bare', 'bat']);
    });

    it('matches exact word', () => {
      const results = trie.wildcardSearch('cat');
      expect(results).toEqual(['cat']);
    });

    it('* at beginning matches prefix', () => {
      const results = trie.wildcardSearch('*at');
      expect(results.sort()).toEqual(['bat', 'cat']);
    });

    it('multiple ? placeholders', () => {
      const results = trie.wildcardSearch('??r');
      expect(results.sort()).toEqual(['bar', 'car']);
    });

    it('returns empty for no matches', () => {
      expect(trie.wildcardSearch('xyz')).toEqual([]);
    });
  });

  describe('countWithPrefix', () => {
    it('counts words passing through node', () => {
      trie.insert('cat');
      trie.insert('car');
      trie.insert('card');
      expect(trie.countWithPrefix('ca')).toBe(3);
      expect(trie.countWithPrefix('car')).toBe(2);
      expect(trie.countWithPrefix('cat')).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all words', () => {
      trie.insert('hello');
      trie.insert('world');
      trie.clear();
      expect(trie.size).toBe(0);
      expect(trie.search('hello')).toBe(false);
    });
  });

  describe('allWords', () => {
    it('returns all inserted words', () => {
      const words = ['alpha', 'beta', 'gamma'];
      words.forEach((w) => trie.insert(w));
      expect(trie.allWords().sort()).toEqual(words.sort());
    });
  });
});
