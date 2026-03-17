import type { MiddlewareHandler } from "hono";
import { LRUCache } from "../utils/lru-cache.js";
import { createHash } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

interface CacheEntry {
  body: string;
  status: number;
  headers: Record<string, string>;
  etag: string;
  cachedAt: number;
}

export interface CacheOptions {
  /** TTL in milliseconds (default: 60_000 = 1 minute) */
  ttlMs?: number;
  /** Maximum number of cached responses (default: 500) */
  maxSize?: number;
  /**
   * Custom cache key builder. Defaults to method + URL + relevant query params.
   * Return null to skip caching for a particular request.
   */
  keyBuilder?: (req: Request) => string | null;
  /** HTTP methods to cache (default: ["GET", "HEAD"]) */
  methods?: string[];
  /**
   * Headers whose values are included in the cache key
   * (e.g. ["Accept", "Accept-Language"])
   */
  varyHeaders?: string[];
  /** If true, include query string in cache key (default: true) */
  includeQuery?: boolean;
  /** Paths that bypass cache entirely */
  skip?: (req: Request) => boolean;
}

// ── ETag generation ────────────────────────────────────────────────────────

function generateETag(body: string): string {
  const hash = createHash("sha1").update(body).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

// ── Cache key ──────────────────────────────────────────────────────────────

function buildCacheKey(req: Request, options: CacheOptions): string | null {
  if (options.keyBuilder) return options.keyBuilder(req);

  const methods = options.methods ?? ["GET", "HEAD"];
  if (!methods.includes(req.method.toUpperCase())) return null;

  const url = new URL(req.url);
  let key = `${req.method}:${url.pathname}`;

  if (options.includeQuery !== false && url.search) {
    // Sort params for consistent keys regardless of param order
    const params = new URLSearchParams(url.search);
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    key += `?${new URLSearchParams(sorted).toString()}`;
  }

  if (options.varyHeaders?.length) {
    const headers = new Headers(req.headers);
    for (const h of options.varyHeaders) {
      const val = headers.get(h);
      if (val) key += `;${h.toLowerCase()}=${val}`;
    }
  }

  return key;
}

// ── Global store (shared across middleware instances with same config) ──────

// We use a single store per process; callers can create separate stores by
// passing distinct option objects.
const defaultStore = new LRUCache<string, CacheEntry>({ maxSize: 500, defaultTtlMs: 60_000 });

/** Returns a dedicated store for these options, or the shared default. */
function getStore(options: CacheOptions): LRUCache<string, CacheEntry> {
  if (options.maxSize || options.ttlMs) {
    // Create a dedicated store for non-default config
    return new LRUCache<string, CacheEntry>({
      maxSize: options.maxSize ?? 500,
      defaultTtlMs: options.ttlMs ?? 60_000,
    });
  }
  return defaultStore;
}

// ── Cache invalidation ─────────────────────────────────────────────────────

/**
 * Invalidate cache entries whose keys start with the given prefix.
 * Useful after mutations: invalidateByPrefix("/api/nodes") clears all node listings.
 */
export function invalidateByPrefix(
  prefix: string,
  store: LRUCache<string, CacheEntry> = defaultStore,
): number {
  let count = 0;
  for (const [key] of store) {
    const k = key as string;
    if (k.startsWith(prefix)) {
      store.delete(k);
      count++;
    }
  }
  return count;
}

/** Clear the entire cache store. */
export function clearCache(store: LRUCache<string, CacheEntry> = defaultStore): void {
  store.clear();
}

// ── Middleware factory ─────────────────────────────────────────────────────

/**
 * In-memory LRU response cache middleware with ETag and conditional request support.
 *
 * Features:
 *  - Only caches GET/HEAD by default
 *  - Generates and stores ETags for responses
 *  - Handles If-None-Match → 304 Not Modified
 *  - Adds X-Cache: HIT | MISS header
 *  - Configurable TTL and max entries
 *
 * Usage:
 *   app.use("/api/nodes", cacheMiddleware({ ttlMs: 30_000 }))
 */
export function cacheMiddleware(options: CacheOptions = {}): MiddlewareHandler {
  const store = getStore(options);
  const ttlMs = options.ttlMs ?? 60_000;

  return async (c, next) => {
    const req = c.req.raw;

    // Skip non-cacheable requests
    if (options.skip?.(req)) {
      await next();
      return;
    }

    const cacheKey = buildCacheKey(req, options);
    if (!cacheKey) {
      await next();
      return;
    }

    // ── Cache HIT ──
    const cached = store.get(cacheKey);
    if (cached) {
      const clientETag = req.headers.get("If-None-Match");

      // Conditional request: 304 Not Modified
      if (clientETag && clientETag === cached.etag) {
        c.header("X-Cache", "HIT");
        c.header("ETag", cached.etag);
        c.header("Cache-Control", `max-age=${Math.ceil(ttlMs / 1000)}`);
        return c.body(null, 304);
      }

      // Return cached response
      c.header("X-Cache", "HIT");
      c.header("ETag", cached.etag);
      c.header("Cache-Control", `max-age=${Math.ceil(ttlMs / 1000)}`);
      c.header("X-Cache-Age", String(Math.floor((Date.now() - cached.cachedAt) / 1000)));

      for (const [k, v] of Object.entries(cached.headers)) {
        if (k.toLowerCase() !== "etag" && k.toLowerCase() !== "x-cache") {
          c.header(k, v);
        }
      }

      const contentType = cached.headers["content-type"] ?? cached.headers["Content-Type"] ?? "application/json";
      c.header("Content-Type", contentType);
      return new Response(cached.body, { status: cached.status });
    }

    // ── Cache MISS ──
    c.header("X-Cache", "MISS");

    await next();

    // Only cache successful responses
    const status = c.res.status;
    if (status < 200 || status >= 300) return;

    const contentType = c.res.headers.get("Content-Type") ?? "";
    // Only cache JSON and text responses
    if (!contentType.includes("json") && !contentType.includes("text")) return;

    try {
      const cloned = c.res.clone();
      const body = await cloned.text();
      const etag = generateETag(body);

      const capturedHeaders: Record<string, string> = {};
      c.res.headers.forEach((v, k) => { capturedHeaders[k] = v; });

      const entry: CacheEntry = {
        body,
        status,
        headers: capturedHeaders,
        etag,
        cachedAt: Date.now(),
      };

      store.set(cacheKey, entry, ttlMs);

      // Add ETag to the actual response
      c.header("ETag", etag);
      c.header("Cache-Control", `max-age=${Math.ceil(ttlMs / 1000)}`);
    } catch {
      // If we can't clone/read the response, just skip caching
    }
  };
}
