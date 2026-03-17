import type { MiddlewareHandler, Context } from "hono";
import { ErrorCode } from "@nexus/shared";

// ── Token Bucket ──────────────────────────────────────────────────────────

interface Bucket {
  tokens: number;
  lastRefill: number; // epoch ms
}

class TokenBucket {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number,   // tokens per second
    private readonly windowMs: number,
  ) {}

  /** Returns remaining tokens after consuming one, or -1 if denied. */
  consume(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const refilled = Math.floor(elapsed * this.refillRate);
    if (refilled > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refilled);
      bucket.lastRefill = now;
    }

    const resetAt = now + this.windowMs;

    if (bucket.tokens <= 0) {
      return { allowed: false, remaining: 0, resetAt };
    }

    bucket.tokens -= 1;
    return { allowed: true, remaining: bucket.tokens, resetAt };
  }

  /** Remove stale entries to prevent unbounded memory growth. */
  prune(): void {
    const cutoff = Date.now() - this.windowMs * 2;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

// ── Configuration ──────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** If true, use authenticated userId instead of IP when available */
  preferUserId?: boolean;
  /** Custom key extractor */
  keyExtractor?: (c: Context) => string;
  /** Message to return on rate limit */
  message?: string;
  /** Skip rate limiting for these paths (exact match) */
  skip?: (c: Context) => boolean;
}

export interface RateLimitPreset {
  /** Generous limit for authenticated API access */
  api: RateLimitConfig;
  /** Strict limit for auth endpoints to prevent brute-force */
  auth: RateLimitConfig;
  /** Very strict limit for expensive operations */
  heavy: RateLimitConfig;
}

export const defaultPresets: RateLimitPreset = {
  api: {
    maxRequests: 100,
    windowMs: 60_000, // 1 minute
    preferUserId: true,
  },
  auth: {
    maxRequests: 10,
    windowMs: 60_000, // 1 minute
    preferUserId: false,
    message: "Too many authentication attempts. Please wait before retrying.",
  },
  heavy: {
    maxRequests: 20,
    windowMs: 60_000,
    preferUserId: true,
    message: "Request limit exceeded for this operation.",
  },
};

// ── Global bucket store ───────────────────────────────────────────────────

// One bucket store per unique config to avoid cross-contamination
const bucketStores = new WeakMap<RateLimitConfig, TokenBucket>();

function getBucketStore(config: RateLimitConfig): TokenBucket {
  let store = bucketStores.get(config);
  if (!store) {
    const refillRate = config.maxRequests / (config.windowMs / 1000);
    store = new TokenBucket(config.maxRequests, refillRate, config.windowMs);
    bucketStores.set(config, store);

    // Prune stale entries every 5 minutes
    setInterval(() => store!.prune(), 5 * 60_000).unref?.();
  }
  return store;
}

// ── Key extraction ─────────────────────────────────────────────────────────

function extractKey(c: Context, config: RateLimitConfig): string {
  if (config.keyExtractor) {
    return config.keyExtractor(c);
  }

  // Try userId from auth context (set by authMiddleware)
  if (config.preferUserId) {
    const auth = c.get("auth" as never) as { userId?: string } | undefined;
    if (auth?.userId) return `user:${auth.userId}`;
  }

  // Fall back to IP
  const ip =
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    c.req.header("X-Real-IP") ??
    "unknown";
  return `ip:${ip}`;
}

// ── Middleware factory ─────────────────────────────────────────────────────

/**
 * Token bucket rate limiter middleware for Hono.
 *
 * Usage:
 *   app.use("/api/auth/*", rateLimiter(defaultPresets.auth))
 *   app.use("/api/*",      rateLimiter(defaultPresets.api))
 */
export function rateLimiter(config: RateLimitConfig): MiddlewareHandler {
  const store = getBucketStore(config);
  const message = config.message ?? "Too many requests. Please slow down.";

  return async (c, next) => {
    // Allow skipping
    if (config.skip?.(c)) {
      await next();
      return;
    }

    const key = extractKey(c, config);
    const { allowed, remaining, resetAt } = store.consume(key);

    // Set standard rate-limit headers (always, not just on rejection)
    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000))); // Unix seconds
    c.header("X-RateLimit-Window", String(config.windowMs));

    if (!allowed) {
      const retryAfter = Math.ceil(config.windowMs / 1000);
      c.header("Retry-After", String(retryAfter));

      return c.json(
        {
          code: ErrorCode.RATE_LIMITED,
          message,
          statusCode: 429,
          retryAfter,
        },
        429,
      );
    }

    await next();
  };
}

/**
 * Convenience factory – creates a rate limiter from a named preset.
 */
export function rateLimiterPreset(
  presetName: keyof RateLimitPreset,
  overrides?: Partial<RateLimitConfig>,
): MiddlewareHandler {
  const config: RateLimitConfig = { ...defaultPresets[presetName], ...overrides };
  return rateLimiter(config);
}

/**
 * Per-route rate limiter that accepts different configs per HTTP method.
 * e.g. GET requests get a higher limit than POST.
 */
export function perMethodRateLimiter(
  configs: Partial<Record<string, RateLimitConfig>>,
  fallback: RateLimitConfig,
): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const config = configs[method] ?? fallback;
    return rateLimiter(config)(c, next);
  };
}
