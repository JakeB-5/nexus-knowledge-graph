// LRUCache tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache } from '../lru.js';

// ── Basic get/set/delete ──────────────────────────────────────────────────────

describe('LRUCache - basic operations', () => {
  it('stores and retrieves values', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    expect(cache.get('missing')).toBeUndefined();
  });

  it('deletes a key', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
  });

  it('returns false when deleting missing key', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    expect(cache.delete('ghost')).toBe(false);
  });

  it('has() returns true for existing key', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
  });

  it('has() returns false for missing key', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    expect(cache.has('ghost')).toBe(false);
  });

  it('clears all entries', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('updates existing key without creating duplicates', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1);
    cache.set('a', 99);
    expect(cache.get('a')).toBe(99);
    expect(cache.size).toBe(1);
  });
});

// ── LRU eviction ─────────────────────────────────────────────────────────────

describe('LRUCache - LRU eviction', () => {
  it('evicts the least recently used entry when at capacity', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // should evict 'a'
    expect(cache.has('a')).toBe(false);
    expect(cache.has('d')).toBe(true);
  });

  it('accessing a key makes it most recently used', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a'); // promote 'a'
    cache.set('d', 4); // should evict 'b' (now LRU)
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('tracks eviction count in stats', () => {
    const cache = new LRUCache<string, number>({ maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // evicts 'a'
    expect(cache.stats.evictions).toBe(1);
  });
});

// ── TTL ───────────────────────────────────────────────────────────────────────

describe('LRUCache - TTL', () => {
  it('returns undefined for expired entries', async () => {
    const cache = new LRUCache<string, number>({ maxSize: 10, defaultTtl: 50 });
    cache.set('a', 1);
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get('a')).toBeUndefined();
  });

  it('per-entry TTL overrides default', async () => {
    const cache = new LRUCache<string, number>({ maxSize: 10, defaultTtl: 5000 });
    cache.set('a', 1, 50); // short TTL
    cache.set('b', 2);     // uses default 5000ms
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });

  it('has() returns false for expired entries', async () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1, 50);
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.has('a')).toBe(false);
  });

  it('tracks expirations in stats', async () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1, 50);
    await new Promise((r) => setTimeout(r, 80));
    cache.get('a'); // triggers expiration check
    expect(cache.stats.expirations).toBe(1);
  });

  it('non-expiring entries stay indefinitely', async () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1); // no TTL
    await new Promise((r) => setTimeout(r, 100));
    expect(cache.get('a')).toBe(1);
  });
});

// ── Statistics ────────────────────────────────────────────────────────────────

describe('LRUCache - statistics', () => {
  it('tracks hits and misses', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1);
    cache.get('a'); // hit
    cache.get('b'); // miss
    cache.get('a'); // hit
    expect(cache.stats.hits).toBe(2);
    expect(cache.stats.misses).toBe(1);
    expect(cache.stats.hitRate).toBeCloseTo(2 / 3);
  });

  it('resetStats resets all counters', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1);
    cache.get('a');
    cache.get('b');
    cache.resetStats();
    expect(cache.stats.hits).toBe(0);
    expect(cache.stats.misses).toBe(0);
  });
});

// ── Iteration ─────────────────────────────────────────────────────────────────

describe('LRUCache - iteration', () => {
  it('entries() yields key-value pairs', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1);
    cache.set('b', 2);
    const entries = Array.from(cache.entries());
    expect(entries).toHaveLength(2);
  });

  it('keys() returns all live keys', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('x', 10);
    cache.set('y', 20);
    expect(cache.keys()).toContain('x');
    expect(cache.keys()).toContain('y');
  });

  it('entries() excludes expired entries', async () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1, 50);
    cache.set('b', 2); // no TTL
    await new Promise((r) => setTimeout(r, 80));
    const entries = Array.from(cache.entries());
    expect(entries.some(([k]) => k === 'b')).toBe(true);
    expect(entries.some(([k]) => k === 'a')).toBe(false);
  });
});

// ── Serialization ─────────────────────────────────────────────────────────────

describe('LRUCache - serialization', () => {
  it('serializes and deserializes correctly', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1);
    cache.set('b', 2);
    const serialized = cache.serialize();
    const restored = LRUCache.deserialize(serialized, { maxSize: 10 });
    expect(restored.get('a')).toBe(1);
    expect(restored.get('b')).toBe(2);
  });

  it('does not restore expired entries', async () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    cache.set('a', 1, 50);
    const serialized = cache.serialize();
    await new Promise((r) => setTimeout(r, 80));
    const restored = LRUCache.deserialize(serialized, { maxSize: 10 });
    expect(restored.get('a')).toBeUndefined();
  });
});

// ── Constructor validation ────────────────────────────────────────────────────

describe('LRUCache - constructor', () => {
  it('throws when maxSize <= 0', () => {
    expect(() => new LRUCache({ maxSize: 0 })).toThrow(RangeError);
    expect(() => new LRUCache({ maxSize: -1 })).toThrow(RangeError);
  });
});
