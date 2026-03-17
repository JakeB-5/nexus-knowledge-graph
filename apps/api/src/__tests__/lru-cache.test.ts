import { describe, it, expect, beforeEach, vi } from "vitest";
import { LRUCache } from "../utils/lru-cache.js";

describe("LRUCache", () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache({ maxSize: 3 });
  });

  // ── Basic get/set ──

  it("returns undefined for missing keys", () => {
    expect(cache.get("missing")).toBeUndefined();
  });

  it("stores and retrieves values", () => {
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("overwrites existing values", () => {
    cache.set("a", 1);
    cache.set("a", 99);
    expect(cache.get("a")).toBe(99);
  });

  // ── LRU eviction ──

  it("evicts the least-recently-used entry when full", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // Access 'a' to make it recently used
    cache.get("a");
    // Now insert 'd' – should evict 'b' (LRU)
    cache.set("d", 4);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.has("d")).toBe(true);
  });

  it("evicts the oldest entry when none are accessed", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // should evict 'a'
    expect(cache.has("a")).toBe(false);
  });

  // ── has / delete ──

  it("has() returns true for present keys", () => {
    cache.set("x", 42);
    expect(cache.has("x")).toBe(true);
  });

  it("has() returns false after delete", () => {
    cache.set("x", 42);
    cache.delete("x");
    expect(cache.has("x")).toBe(false);
  });

  it("delete() returns false for missing keys", () => {
    expect(cache.delete("nope")).toBe(false);
  });

  // ── clear ──

  it("clear() removes all entries", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  // ── TTL ──

  it("returns undefined for expired entries", () => {
    vi.useFakeTimers();
    cache.set("temp", 1, 1000); // 1 second TTL
    vi.advanceTimersByTime(1001);
    expect(cache.get("temp")).toBeUndefined();
    vi.useRealTimers();
  });

  it("returns value for non-expired entries", () => {
    vi.useFakeTimers();
    cache.set("temp", 1, 5000);
    vi.advanceTimersByTime(3000);
    expect(cache.get("temp")).toBe(1);
    vi.useRealTimers();
  });

  it("respects default TTL from options", () => {
    vi.useFakeTimers();
    const ttlCache = new LRUCache<string, number>({ maxSize: 10, defaultTtlMs: 500 });
    ttlCache.set("k", 7);
    vi.advanceTimersByTime(600);
    expect(ttlCache.get("k")).toBeUndefined();
    vi.useRealTimers();
  });

  // ── Statistics ──

  it("tracks hit/miss statistics", () => {
    cache.set("a", 1);
    cache.get("a"); // hit
    cache.get("b"); // miss
    cache.get("a"); // hit

    const stats = cache.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it("tracks eviction count", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // evicts one
    const stats = cache.stats();
    expect(stats.evictions).toBe(1);
  });

  // ── Non-string keys ──

  it("handles non-string keys via JSON serialization", () => {
    const objCache = new LRUCache<{ id: number }, string>({ maxSize: 5 });
    objCache.set({ id: 1 }, "one");
    expect(objCache.get({ id: 1 })).toBe("one");
  });

  // ── purgeExpired ──

  it("purgeExpired removes expired entries", () => {
    vi.useFakeTimers();
    cache.set("a", 1, 500);
    cache.set("b", 2, 500);
    cache.set("c", 3, 99999);
    vi.advanceTimersByTime(600);
    const removed = cache.purgeExpired();
    expect(removed).toBe(2);
    expect(cache.size).toBe(1);
    vi.useRealTimers();
  });

  // ── Iterator ──

  it("iterates over non-expired entries in MRU order", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.get("a"); // moves a to front

    const keys = [...cache].map(([k]) => k);
    expect(keys[0]).toBe("a"); // most recently used
  });

  // ── constructor validation ──

  it("throws when maxSize < 1", () => {
    expect(() => new LRUCache({ maxSize: 0 })).toThrow();
  });
});
