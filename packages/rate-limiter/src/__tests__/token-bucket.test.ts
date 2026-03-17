import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket } from '../token-bucket.js';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic consumption', () => {
    it('allows requests when tokens are available', () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
      const result = bucket.consume('user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.total).toBe(10);
    });

    it('denies requests when bucket is empty', () => {
      const bucket = new TokenBucket({ capacity: 2, refillRate: 1 });
      bucket.consume('user-1');
      bucket.consume('user-1');
      const result = bucket.consume('user-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('consumes multiple tokens at once', () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
      const result = bucket.consume('user-1', 5);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it('denies when requesting more tokens than available', () => {
      const bucket = new TokenBucket({ capacity: 3, refillRate: 1 });
      const result = bucket.consume('user-1', 5);
      expect(result.allowed).toBe(false);
    });

    it('tracks separate keys independently', () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
      bucket.consume('user-1');
      bucket.consume('user-1');
      const result = bucket.consume('user-2');
      expect(result.remaining).toBe(4); // user-2 is fresh
    });
  });

  describe('refill', () => {
    it('refills tokens over time', () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 10 }); // 10/sec
      // Drain the bucket
      for (let i = 0; i < 10; i++) bucket.consume('user-1');
      expect(bucket.peek('user-1')).toBe(0);

      // Advance 500ms — should refill 5 tokens
      vi.advanceTimersByTime(500);
      expect(bucket.peek('user-1')).toBe(5);
    });

    it('does not exceed capacity on refill', () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 100 }); // very fast refill
      bucket.consume('user-1');
      vi.advanceTimersByTime(10_000);
      expect(bucket.peek('user-1')).toBe(5); // capped at capacity
    });
  });

  describe('initial tokens', () => {
    it('starts with specified initial tokens', () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1, initialTokens: 3 });
      expect(bucket.peek('user-1')).toBe(3);
    });

    it('defaults to full capacity', () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
      expect(bucket.peek('user-1')).toBe(10);
    });
  });

  describe('reservation', () => {
    it('reserves tokens successfully', () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
      expect(bucket.reserve('user-1', 5)).toBe(true);
      expect(bucket.peek('user-1')).toBe(5);
    });

    it('fails reservation when not enough tokens', () => {
      const bucket = new TokenBucket({ capacity: 3, refillRate: 1 });
      expect(bucket.reserve('user-1', 5)).toBe(false);
    });

    it('releases tokens back to bucket', () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
      bucket.consume('user-1', 5);
      bucket.release('user-1', 3);
      expect(bucket.peek('user-1')).toBe(8);
    });

    it('does not exceed capacity on release', () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
      bucket.release('user-1', 10);
      expect(bucket.peek('user-1')).toBe(5);
    });
  });

  describe('management', () => {
    it('resets a key', () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
      bucket.consume('user-1');
      bucket.consume('user-1');
      bucket.reset('user-1');
      expect(bucket.peek('user-1')).toBe(5); // fresh bucket
    });

    it('clears all buckets', () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
      bucket.consume('user-1');
      bucket.consume('user-2');
      bucket.clear();
      expect(bucket.size()).toBe(0);
    });
  });

  describe('burst handling', () => {
    it('allows burst up to capacity', () => {
      const bucket = new TokenBucket({ capacity: 20, refillRate: 5 }); // 5/sec normal
      // All 20 should be available immediately (burst)
      for (let i = 0; i < 20; i++) {
        expect(bucket.consume('user-1').allowed).toBe(true);
      }
      expect(bucket.consume('user-1').allowed).toBe(false);
    });
  });
});
