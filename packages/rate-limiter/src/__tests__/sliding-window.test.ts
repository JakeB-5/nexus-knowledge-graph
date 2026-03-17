import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlidingWindowLog, FixedWindowCounter, SlidingWindowCounter } from '../sliding-window.js';

describe('SlidingWindowLog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows requests within limit', () => {
    const limiter = new SlidingWindowLog({ windowMs: 1000, maxRequests: 3 });
    expect(limiter.consume('user-1').allowed).toBe(true);
    expect(limiter.consume('user-1').allowed).toBe(true);
    expect(limiter.consume('user-1').allowed).toBe(true);
  });

  it('denies requests over limit', () => {
    const limiter = new SlidingWindowLog({ windowMs: 1000, maxRequests: 2 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    const result = limiter.consume('user-1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('allows requests after window slides', () => {
    const limiter = new SlidingWindowLog({ windowMs: 1000, maxRequests: 2 });
    vi.setSystemTime(0);
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(limiter.consume('user-1').allowed).toBe(false);

    // Advance past the window
    vi.setSystemTime(1001);
    expect(limiter.consume('user-1').allowed).toBe(true);
  });

  it('provides accurate remaining count', () => {
    const limiter = new SlidingWindowLog({ windowMs: 1000, maxRequests: 5 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(limiter.consume('user-1').remaining).toBe(2);
  });

  it('tracks separate keys', () => {
    const limiter = new SlidingWindowLog({ windowMs: 1000, maxRequests: 2 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(limiter.consume('user-2').allowed).toBe(true);
  });

  it('resets a key', () => {
    const limiter = new SlidingWindowLog({ windowMs: 1000, maxRequests: 2 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.reset('user-1');
    expect(limiter.consume('user-1').allowed).toBe(true);
  });

  it('count() returns current request count', () => {
    const limiter = new SlidingWindowLog({ windowMs: 1000, maxRequests: 10 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(limiter.count('user-1')).toBe(2);
  });

  it('provides resetAt timestamp', () => {
    vi.setSystemTime(1000);
    const limiter = new SlidingWindowLog({ windowMs: 1000, maxRequests: 5 });
    const result = limiter.consume('user-1');
    expect(result.resetAt).toBeDefined();
    expect(result.resetAt!.getTime()).toBeGreaterThan(1000);
  });
});

describe('FixedWindowCounter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resets counter at window boundary', () => {
    vi.setSystemTime(0);
    const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 2 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(limiter.consume('user-1').allowed).toBe(false);

    vi.setSystemTime(1000); // new window
    expect(limiter.consume('user-1').allowed).toBe(true);
  });

  it('counts within the same window', () => {
    vi.setSystemTime(0);
    const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 5 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(limiter.count('user-1')).toBe(2);
  });

  it('resets count in new window', () => {
    vi.setSystemTime(0);
    const limiter = new FixedWindowCounter({ windowMs: 1000, maxRequests: 5 });
    limiter.consume('user-1');
    vi.setSystemTime(1000);
    expect(limiter.count('user-1')).toBe(0);
  });
});

describe('SlidingWindowCounter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows requests within limit', () => {
    vi.setSystemTime(0);
    const limiter = new SlidingWindowCounter({ windowMs: 1000, maxRequests: 5 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.consume('user-1').allowed).toBe(true);
    }
  });

  it('denies requests over limit', () => {
    vi.setSystemTime(0);
    const limiter = new SlidingWindowCounter({ windowMs: 1000, maxRequests: 3 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(limiter.consume('user-1').allowed).toBe(false);
  });

  it('uses previous window weight to limit requests', () => {
    vi.setSystemTime(0);
    const limiter = new SlidingWindowCounter({ windowMs: 1000, maxRequests: 4 });
    // Fill window 0 completely (t=0..999)
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.consume('user-1');

    // At t=1500ms we are 50% through window 1 (windowStart=1000).
    // previous=4, ratio=0.5 → estimate = 4*(1-0.5) + 0 = 2.
    // So only 2 new requests should be allowed before the estimate hits 4.
    vi.setSystemTime(1500);
    expect(limiter.consume('user-1').allowed).toBe(true);
    expect(limiter.consume('user-1').allowed).toBe(true);
    expect(limiter.consume('user-1').allowed).toBe(false);
  });

  it('resets key', () => {
    vi.setSystemTime(0);
    const limiter = new SlidingWindowCounter({ windowMs: 1000, maxRequests: 2 });
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.reset('user-1');
    expect(limiter.consume('user-1').allowed).toBe(true);
  });
});
