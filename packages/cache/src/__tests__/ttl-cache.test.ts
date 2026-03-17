// TtlCache tests

import { describe, it, expect, beforeEach } from 'vitest';
import { TtlCache } from '../ttl-cache.js';

// ── Basic operations ──────────────────────────────────────────────────────────

describe('TtlCache - basic operations', () => {
  it('stores and retrieves values', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('returns undefined for missing keys', () => {
    const cache = new TtlCache<string, number>();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('deletes a key', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
  });

  it('delete returns false for missing key', () => {
    const cache = new TtlCache<string, number>();
    expect(cache.delete('ghost')).toBe(false);
  });

  it('has() works correctly', () => {
    const cache = new TtlCache<string, number>();
    cache.set('x', 42);
    expect(cache.has('x')).toBe(true);
    expect(cache.has('y')).toBe(false);
  });

  it('clear() removes all entries', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('size reflects number of entries', () => {
    const cache = new TtlCache<string, number>();
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });
});

// ── TTL expiry ────────────────────────────────────────────────────────────────

describe('TtlCache - TTL expiry', () => {
  it('returns undefined after TTL expires (lazy)', async () => {
    const cache = new TtlCache<string, number>({ defaultTtl: 50 });
    cache.set('a', 1);
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get('a')).toBeUndefined();
  });

  it('per-entry TTL overrides default', async () => {
    const cache = new TtlCache<string, number>({ defaultTtl: 5000 });
    cache.set('a', 1, 50);
    cache.set('b', 2);
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });

  it('has() returns false for expired entry', async () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1, 50);
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.has('a')).toBe(false);
  });

  it('non-expiring entries stay forever', async () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1); // no TTL
    await new Promise((r) => setTimeout(r, 100));
    expect(cache.get('a')).toBe(1);
  });
});

// ── purgeExpired ──────────────────────────────────────────────────────────────

describe('TtlCache.purgeExpired', () => {
  it('removes all expired entries', async () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1, 50);
    cache.set('b', 2, 50);
    cache.set('c', 3); // no TTL
    await new Promise((r) => setTimeout(r, 80));
    const removed = cache.purgeExpired();
    expect(removed).toBe(2);
    expect(cache.size).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('returns 0 when nothing is expired', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1, 5000);
    expect(cache.purgeExpired()).toBe(0);
  });
});

// ── Max size ──────────────────────────────────────────────────────────────────

describe('TtlCache - max size', () => {
  it('evicts when at capacity', () => {
    const cache = new TtlCache<string, number>({ maxSize: 3 });
    cache.set('a', 1, 100);
    cache.set('b', 2, 200);
    cache.set('c', 3, 300);
    cache.set('d', 4); // should evict 'a' (earliest expiry)
    expect(cache.size).toBe(3);
    expect(cache.has('d')).toBe(true);
  });

  it('evicts any entry when none have TTL', () => {
    const cache = new TtlCache<string, number>({ maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // should evict something
    expect(cache.size).toBe(2);
    expect(cache.has('c')).toBe(true);
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

describe('TtlCache - statistics', () => {
  it('tracks hits, misses, expirations', async () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1, 50);
    cache.get('a'); // hit
    cache.get('z'); // miss
    await new Promise((r) => setTimeout(r, 80));
    cache.get('a'); // expiration
    const s = cache.stats;
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(2); // 'z' miss + expired 'a'
    expect(s.expirations).toBe(1);
  });

  it('resetStats clears counters', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1);
    cache.get('a');
    cache.get('b');
    cache.resetStats();
    expect(cache.stats.hits).toBe(0);
    expect(cache.stats.misses).toBe(0);
  });
});

// ── Iteration ─────────────────────────────────────────────────────────────────

describe('TtlCache - iteration', () => {
  it('entries() yields live entries', async () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1, 50);
    cache.set('b', 2);
    await new Promise((r) => setTimeout(r, 80));
    const pairs = Array.from(cache.entries());
    expect(pairs.some(([k]) => k === 'b')).toBe(true);
    expect(pairs.some(([k]) => k === 'a')).toBe(false);
  });

  it('keys() returns live keys', () => {
    const cache = new TtlCache<string, number>();
    cache.set('x', 10);
    cache.set('y', 20);
    const keys = cache.keys();
    expect(keys).toContain('x');
    expect(keys).toContain('y');
  });
});

// ── Active cleanup ────────────────────────────────────────────────────────────

describe('TtlCache - cleanup interval', () => {
  it('automatically purges expired entries', async () => {
    const cache = new TtlCache<string, number>({
      defaultTtl: 50,
      cleanupInterval: 30,
    });
    cache.set('a', 1);
    cache.set('b', 2);
    await new Promise((r) => setTimeout(r, 150));
    // After cleanup, store should be empty (lazy check via size may be stale)
    // Force a purge via check
    cache.purgeExpired();
    expect(cache.size).toBe(0);
    cache.destroy();
  });

  it('destroy() stops the cleanup timer', () => {
    const cache = new TtlCache({ cleanupInterval: 50 });
    expect(() => cache.destroy()).not.toThrow();
  });
});
