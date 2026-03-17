// Types for the rate-limiter package

export interface RateLimiterConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  keyPrefix?: string;      // Prefix for store keys
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;       // Requests left in the current window
  total: number;           // Total limit for the window
  retryAfter?: number;     // Milliseconds until the next window (when denied)
  resetAt?: Date;          // When the window resets
}

export interface RateLimiterStore {
  /** Increment the counter for a key and return the new count. */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }>;
  /** Decrement the counter (for failed-request skip logic). */
  decrement(key: string): Promise<void>;
  /** Reset the counter for a key. */
  reset(key: string): Promise<void>;
  /** Return the current count without incrementing. */
  get(key: string): Promise<{ count: number; resetAt: Date } | null>;
}

export interface RateLimitRule {
  key: string | ((identifier: string) => string);
  maxRequests: number;
  windowMs: number;
  burst?: number;          // Optional burst allowance above maxRequests
}

export interface TokenBucketConfig {
  capacity: number;        // Maximum tokens the bucket can hold
  refillRate: number;      // Tokens added per second
  initialTokens?: number;  // Starting token count (defaults to capacity)
}

export interface SlidingWindowConfig {
  windowMs: number;
  maxRequests: number;
  precision?: number;      // Sub-window divisions for counter strategy
}

export interface LeakyBucketConfig {
  capacity: number;        // Maximum queue depth
  leakRatePerSec: number;  // Requests processed per second
}
