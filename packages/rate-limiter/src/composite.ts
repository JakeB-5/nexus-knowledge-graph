// CompositeRateLimiter: combine multiple limiters, tier-based limits, whitelist/blacklist

import type { RateLimitResult, RateLimitRule } from './types.js';
import { TokenBucket } from './token-bucket.js';
import { SlidingWindowLog } from './sliding-window.js';

export interface CompositeResult {
  allowed: boolean;
  results: Array<{ rule: string; result: RateLimitResult }>;
  mostRestrictive: RateLimitResult;
}

export type LimiterTier = 'free' | 'pro' | 'enterprise' | string;

export interface TierConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  burst?: number;
}

const DEFAULT_TIERS: Record<LimiterTier, TierConfig> = {
  free: { requestsPerSecond: 1, requestsPerMinute: 30, requestsPerHour: 500 },
  pro: { requestsPerSecond: 10, requestsPerMinute: 300, requestsPerHour: 5000 },
  enterprise: { requestsPerSecond: 100, requestsPerMinute: 3000, requestsPerHour: 50000 },
};

interface NamedLimiter {
  name: string;
  check: (identifier: string) => RateLimitResult;
}

export class CompositeRateLimiter {
  private limiters: NamedLimiter[] = [];
  private whitelist: Set<string> = new Set();
  private blacklist: Set<string> = new Set();

  /**
   * Add a custom named limiter function.
   */
  addLimiter(name: string, limiter: (identifier: string) => RateLimitResult): this {
    this.limiters.push({ name, check: limiter });
    return this;
  }

  /**
   * Add a token-bucket limiter for a named rule.
   */
  addTokenBucket(rule: RateLimitRule): this {
    const bucket = new TokenBucket({
      capacity: rule.burst ?? rule.maxRequests,
      refillRate: rule.maxRequests / (rule.windowMs / 1000),
    });

    const keyFn = typeof rule.key === 'function' ? rule.key : () => rule.key as string;

    this.limiters.push({
      name: `token-bucket:${typeof rule.key === 'string' ? rule.key : 'fn'}`,
      check: (identifier) => bucket.consume(keyFn(identifier)),
    });
    return this;
  }

  /**
   * Add a sliding-window log limiter for a named rule.
   */
  addSlidingWindow(rule: RateLimitRule): this {
    const window = new SlidingWindowLog({
      windowMs: rule.windowMs,
      maxRequests: rule.maxRequests,
    });

    const keyFn = typeof rule.key === 'function' ? rule.key : (id: string) => `${rule.key}:${id}`;

    this.limiters.push({
      name: `sliding-window:${typeof rule.key === 'string' ? rule.key : 'fn'}`,
      check: (identifier) => window.consume(keyFn(identifier)),
    });
    return this;
  }

  /**
   * Configure tier-based limits (free / pro / enterprise).
   * Adds per-second, per-minute, and per-hour windows automatically.
   */
  addTierLimits(
    tier: LimiterTier,
    getTier: (identifier: string) => LimiterTier,
    customTiers?: Record<LimiterTier, TierConfig>
  ): this {
    const tiers = { ...DEFAULT_TIERS, ...customTiers };

    const perSecond = new Map<LimiterTier, SlidingWindowLog>();
    const perMinute = new Map<LimiterTier, SlidingWindowLog>();
    const perHour = new Map<LimiterTier, SlidingWindowLog>();

    // Pre-build windows for known tiers
    for (const [t, cfg] of Object.entries(tiers)) {
      perSecond.set(t, new SlidingWindowLog({ windowMs: 1000, maxRequests: cfg.requestsPerSecond }));
      perMinute.set(t, new SlidingWindowLog({ windowMs: 60_000, maxRequests: cfg.requestsPerMinute }));
      perHour.set(t, new SlidingWindowLog({ windowMs: 3_600_000, maxRequests: cfg.requestsPerHour }));
    }

    const getOrCreate = (
      map: Map<LimiterTier, SlidingWindowLog>,
      t: LimiterTier,
      windowMs: number,
      maxRequests: number
    ) => {
      if (!map.has(t)) {
        map.set(t, new SlidingWindowLog({ windowMs, maxRequests }));
      }
      return map.get(t)!;
    };

    this.limiters.push({
      name: `tier:${tier}:per-second`,
      check: (identifier) => {
        const t = getTier(identifier);
        const cfg = tiers[t] ?? tiers['free']!;
        return getOrCreate(perSecond, t, 1000, cfg.requestsPerSecond).consume(identifier);
      },
    });

    this.limiters.push({
      name: `tier:${tier}:per-minute`,
      check: (identifier) => {
        const t = getTier(identifier);
        const cfg = tiers[t] ?? tiers['free']!;
        return getOrCreate(perMinute, t, 60_000, cfg.requestsPerMinute).consume(identifier);
      },
    });

    this.limiters.push({
      name: `tier:${tier}:per-hour`,
      check: (identifier) => {
        const t = getTier(identifier);
        const cfg = tiers[t] ?? tiers['free']!;
        return getOrCreate(perHour, t, 3_600_000, cfg.requestsPerHour).consume(identifier);
      },
    });

    return this;
  }

  /**
   * Add identifier to whitelist — always allowed, skips all limiters.
   */
  allow(identifier: string): this {
    this.whitelist.add(identifier);
    return this;
  }

  /**
   * Add identifier to blacklist — always denied.
   */
  deny(identifier: string): this {
    this.blacklist.add(identifier);
    return this;
  }

  /**
   * Remove from whitelist.
   */
  removeAllow(identifier: string): this {
    this.whitelist.delete(identifier);
    return this;
  }

  /**
   * Remove from blacklist.
   */
  removeDeny(identifier: string): this {
    this.blacklist.delete(identifier);
    return this;
  }

  /**
   * Check the identifier against all limiters. All must pass.
   */
  check(identifier: string): CompositeResult {
    // Blacklist check
    if (this.blacklist.has(identifier)) {
      const denied: RateLimitResult = { allowed: false, remaining: 0, total: 0, retryAfter: Infinity };
      return {
        allowed: false,
        results: [{ rule: 'blacklist', result: denied }],
        mostRestrictive: denied,
      };
    }

    // Whitelist bypass
    if (this.whitelist.has(identifier)) {
      const allowed: RateLimitResult = { allowed: true, remaining: Infinity, total: Infinity };
      return {
        allowed: true,
        results: [{ rule: 'whitelist', result: allowed }],
        mostRestrictive: allowed,
      };
    }

    const results: Array<{ rule: string; result: RateLimitResult }> = [];

    for (const limiter of this.limiters) {
      const result = limiter.check(identifier);
      results.push({ rule: limiter.name, result });
    }

    const denied = results.find((r) => !r.result.allowed);
    const allowed = !denied;

    // Most restrictive = lowest remaining
    const mostRestrictive = results.reduce<RateLimitResult>(
      (min, { result }) =>
        result.remaining < min.remaining ? result : min,
      results[0]?.result ?? { allowed: true, remaining: Infinity, total: Infinity }
    );

    return { allowed, results, mostRestrictive };
  }

  /**
   * Number of registered limiters.
   */
  limiterCount(): number {
    return this.limiters.size ?? this.limiters.length;
  }
}
