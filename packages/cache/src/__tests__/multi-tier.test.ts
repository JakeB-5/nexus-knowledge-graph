// MultiTierCache tests

import { describe, it, expect, beforeEach } from 'vitest';
import { MultiTierCache } from '../multi-tier.js';
import { LRUCache } from '../lru.js';
import { TtlCache } from '../ttl-cache.js';

function makeTiers() {
  const l1 = new LRUCache<string, number>({ maxSize: 5 });
  const l2 = new LRUCache<string, number>({ maxSize: 50 });
  return { l1, l2 };
}

function makeCache(opts: { readThrough?: boolean; writeThrough?: boolean } = {}) {
  const { l1, l2 } = makeTiers();
  const cache = new MultiTierCache<string, number>({
    l1,
    l2,
    readThrough: opts.readThrough ?? true,
    writeThrough: opts.writeThrough ?? true,
  });
  return { cache, l1, l2 };
}

// ── Write-through ─────────────────────────────────────────────────────────────

describe('MultiTierCache - write-through', () => {
  it('writes to both L1 and L2', () => {
    const { cache, l1, l2 } = makeCache();
    cache.set('a', 1);
    expect(l1.get('a')).toBe(1);
    expect(l2.get('a')).toBe(1);
  });

  it('skips L2 write when writeThrough=false', () => {
    const { cache, l1, l2 } = makeCache({ writeThrough: false });
    cache.set('a', 1);
    expect(l1.get('a')).toBe(1);
    expect(l2.get('a')).toBeUndefined();
  });
});

// ── Read-through ──────────────────────────────────────────────────────────────

describe('MultiTierCache - read-through', () => {
  it('returns value from L1 on L1 hit', () => {
    const { cache, l1 } = makeCache();
    l1.set('a', 42);
    expect(cache.get('a')).toBe(42);
  });

  it('falls through to L2 on L1 miss', () => {
    const { cache, l2 } = makeCache();
    l2.set('b', 99);
    expect(cache.get('b')).toBe(99);
  });

  it('promotes L2 value to L1 after L2 hit', () => {
    const { cache, l1, l2 } = makeCache();
    l2.set('b', 99);
    cache.get('b');
    expect(l1.get('b')).toBe(99); // promoted
  });

  it('returns undefined on full miss', () => {
    const { cache } = makeCache();
    expect(cache.get('ghost')).toBeUndefined();
  });

  it('skips L2 read when readThrough=false', () => {
    const { cache, l2 } = makeCache({ readThrough: false });
    l2.set('b', 99);
    expect(cache.get('b')).toBeUndefined();
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

describe('MultiTierCache - delete', () => {
  it('removes from both tiers', () => {
    const { cache, l1, l2 } = makeCache();
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(l1.get('a')).toBeUndefined();
    expect(l2.get('a')).toBeUndefined();
  });

  it('returns false when key not in either tier', () => {
    const { cache } = makeCache();
    expect(cache.delete('ghost')).toBe(false);
  });
});

// ── Has ───────────────────────────────────────────────────────────────────────

describe('MultiTierCache - has', () => {
  it('returns true when key is in L1', () => {
    const { cache } = makeCache();
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
  });

  it('returns true when key is in L2 (read-through)', () => {
    const { cache, l2 } = makeCache();
    l2.set('b', 2);
    expect(cache.has('b')).toBe(true);
  });

  it('returns false when key is in neither tier', () => {
    const { cache } = makeCache();
    expect(cache.has('ghost')).toBe(false);
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────────

describe('MultiTierCache - clear', () => {
  it('clears both tiers', () => {
    const { cache, l1, l2 } = makeCache();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(l1.size).toBe(0);
    expect(l2.size).toBe(0);
  });
});

// ── Tier-specific operations ──────────────────────────────────────────────────

describe('MultiTierCache - tier-specific operations', () => {
  it('setL1Only does not write to L2', () => {
    const { cache, l1, l2 } = makeCache();
    cache.setL1Only('x', 10);
    expect(l1.get('x')).toBe(10);
    expect(l2.get('x')).toBeUndefined();
  });

  it('setL2Only does not write to L1', () => {
    const { cache, l1, l2 } = makeCache();
    cache.setL2Only('x', 10);
    expect(l1.get('x')).toBeUndefined();
    expect(l2.get('x')).toBe(10);
  });

  it('invalidateL1 removes from L1 but not L2', () => {
    const { cache, l1, l2 } = makeCache();
    cache.set('a', 1);
    cache.invalidateL1('a');
    expect(l1.get('a')).toBeUndefined();
    expect(l2.get('a')).toBe(1);
  });

  it('promoteToL1 copies L2 value to L1', () => {
    const { cache, l1, l2 } = makeCache();
    l2.set('b', 55);
    const promoted = cache.promoteToL1('b');
    expect(promoted).toBe(true);
    expect(l1.get('b')).toBe(55);
  });

  it('promoteToL1 returns false when not in L2', () => {
    const { cache } = makeCache();
    expect(cache.promoteToL1('ghost')).toBe(false);
  });
});

// ── Statistics ────────────────────────────────────────────────────────────────

describe('MultiTierCache - statistics', () => {
  it('tracks L1 hits, L2 hits, and misses', () => {
    const { cache, l2 } = makeCache();
    cache.set('a', 1);    // write-through
    l2.set('b', 2);       // only in L2

    cache.get('a');       // L1 hit
    cache.get('b');       // L2 hit (promotes to L1)
    cache.get('ghost');   // miss

    const s = cache.tierStats;
    expect(s.l1Hits).toBe(1);
    expect(s.l2Hits).toBe(1);
    expect(s.totalMisses).toBe(1);
    expect(s.promotions).toBe(1);
  });

  it('overallHitRate is correct', () => {
    const { cache } = makeCache();
    cache.set('a', 1);
    cache.get('a'); // L1 hit
    cache.get('b'); // miss
    const s = cache.tierStats;
    expect(s.overallHitRate).toBeCloseTo(0.5);
  });

  it('resetStats zeros all counters', () => {
    const { cache } = makeCache();
    cache.set('a', 1);
    cache.get('a');
    cache.resetStats();
    const s = cache.tierStats;
    expect(s.l1Hits).toBe(0);
    expect(s.l2Hits).toBe(0);
    expect(s.totalMisses).toBe(0);
  });

  it('tier access via getL1/getL2', () => {
    const { cache, l1, l2 } = makeCache();
    expect(cache.getL1()).toBe(l1);
    expect(cache.getL2()).toBe(l2);
  });
});

// ── With TtlCache as L2 ───────────────────────────────────────────────────────

describe('MultiTierCache - with TtlCache as L2', () => {
  it('falls through to TtlCache L2', () => {
    const l1 = new LRUCache<string, string>({ maxSize: 2 });
    const l2 = new TtlCache<string, string>({ defaultTtl: 5000 });
    const cache = new MultiTierCache({ l1, l2 });

    l2.set('key', 'value');
    expect(cache.get('key')).toBe('value');
    expect(l1.get('key')).toBe('value'); // promoted
  });
});
