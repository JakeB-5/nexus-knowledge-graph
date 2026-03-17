import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompositeRateLimiter } from '../composite.js';

describe('CompositeRateLimiter', () => {
  describe('basic limiting', () => {
    it('allows when all limiters pass', () => {
      const composite = new CompositeRateLimiter()
        .addSlidingWindow({ key: 'per-sec', maxRequests: 10, windowMs: 1000 })
        .addSlidingWindow({ key: 'per-min', maxRequests: 100, windowMs: 60_000 });

      const result = composite.check('user-1');
      expect(result.allowed).toBe(true);
    });

    it('denies when any limiter rejects', () => {
      const composite = new CompositeRateLimiter()
        .addSlidingWindow({ key: 'per-sec', maxRequests: 2, windowMs: 1000 })
        .addSlidingWindow({ key: 'per-min', maxRequests: 100, windowMs: 60_000 });

      composite.check('user-1');
      composite.check('user-1');
      const result = composite.check('user-1'); // third request — per-sec limiter rejects
      expect(result.allowed).toBe(false);
    });

    it('returns all limiter results', () => {
      const composite = new CompositeRateLimiter()
        .addSlidingWindow({ key: 'per-sec', maxRequests: 10, windowMs: 1000 })
        .addSlidingWindow({ key: 'per-min', maxRequests: 100, windowMs: 60_000 });

      const result = composite.check('user-1');
      expect(result.results).toHaveLength(2);
    });

    it('identifies most restrictive result', () => {
      const composite = new CompositeRateLimiter()
        .addSlidingWindow({ key: 'per-sec', maxRequests: 5, windowMs: 1000 })
        .addSlidingWindow({ key: 'per-min', maxRequests: 100, windowMs: 60_000 });

      // Use 4 of 5 per-sec, 4 of 100 per-min
      for (let i = 0; i < 4; i++) composite.check('user-1');
      const result = composite.check('user-1');
      // per-sec has remaining=0, per-min has remaining=95 — per-sec is most restrictive
      expect(result.mostRestrictive.remaining).toBeLessThanOrEqual(
        result.results.reduce((max, r) => Math.max(max, r.result.remaining), 0)
      );
    });
  });

  describe('whitelist', () => {
    it('always allows whitelisted identifiers', () => {
      const composite = new CompositeRateLimiter()
        .addSlidingWindow({ key: 'limit', maxRequests: 1, windowMs: 1000 })
        .allow('trusted-service');

      // Even after limit would be exceeded
      for (let i = 0; i < 10; i++) {
        expect(composite.check('trusted-service').allowed).toBe(true);
      }
    });

    it('removeAllow removes from whitelist', () => {
      const composite = new CompositeRateLimiter()
        .addSlidingWindow({ key: 'limit', maxRequests: 1, windowMs: 1000 })
        .allow('trusted-service');

      composite.check('trusted-service'); // consume the token
      composite.removeAllow('trusted-service');

      // Now subject to normal limits
      composite.check('trusted-service'); // uses up the 1 token
      const result = composite.check('trusted-service');
      expect(result.allowed).toBe(false);
    });
  });

  describe('blacklist', () => {
    it('always denies blacklisted identifiers', () => {
      const composite = new CompositeRateLimiter()
        .addSlidingWindow({ key: 'limit', maxRequests: 100, windowMs: 1000 })
        .deny('bad-actor');

      expect(composite.check('bad-actor').allowed).toBe(false);
    });

    it('removeDeny removes from blacklist', () => {
      const composite = new CompositeRateLimiter()
        .addSlidingWindow({ key: 'limit', maxRequests: 100, windowMs: 1000 })
        .deny('user-1');

      composite.removeDeny('user-1');
      expect(composite.check('user-1').allowed).toBe(true);
    });
  });

  describe('custom limiter', () => {
    it('applies custom limiter function', () => {
      let callCount = 0;
      const composite = new CompositeRateLimiter().addLimiter('custom', (id) => {
        callCount++;
        return { allowed: id !== 'blocked', remaining: 10, total: 10 };
      });

      expect(composite.check('ok-user').allowed).toBe(true);
      expect(composite.check('blocked').allowed).toBe(false);
      expect(callCount).toBe(2);
    });
  });

  describe('token bucket limiter', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('uses token bucket for rate limiting', () => {
      const composite = new CompositeRateLimiter().addTokenBucket({
        key: 'api',
        maxRequests: 5,
        windowMs: 1000,
        burst: 5,
      });

      for (let i = 0; i < 5; i++) {
        expect(composite.check('user-1').allowed).toBe(true);
      }
      expect(composite.check('user-1').allowed).toBe(false);
    });
  });

  describe('tier-based limits', () => {
    it('applies different limits based on tier', () => {
      const userTiers: Record<string, string> = {
        'free-user': 'free',
        'pro-user': 'pro',
      };

      const composite = new CompositeRateLimiter().addTierLimits(
        'users',
        (id) => userTiers[id] ?? 'free'
      );

      // Free user: 1 req/sec limit
      const freeResult = composite.check('free-user');
      expect(freeResult.allowed).toBe(true);

      // Exhaust free tier per-second limit
      const freeResult2 = composite.check('free-user');
      expect(freeResult2.allowed).toBe(false); // free = 1/sec

      // Pro user still allowed (10/sec)
      for (let i = 0; i < 5; i++) {
        expect(composite.check('pro-user').allowed).toBe(true);
      }
    });
  });

  describe('limiter count', () => {
    it('reports correct limiter count', () => {
      const composite = new CompositeRateLimiter()
        .addSlidingWindow({ key: 'a', maxRequests: 10, windowMs: 1000 })
        .addSlidingWindow({ key: 'b', maxRequests: 100, windowMs: 60_000 });
      expect(composite.limiterCount()).toBe(2);
    });
  });
});
