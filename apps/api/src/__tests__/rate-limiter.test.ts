import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimiter } from "../middleware/rate-limiter.js";
import type { RateLimitConfig } from "../middleware/rate-limiter.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function buildApp(config: RateLimitConfig) {
  const app = new Hono();
  app.use("*", rateLimiter(config));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

async function makeRequest(
  app: Hono,
  path = "/test",
  headers: Record<string, string> = {},
): Promise<Response> {
  const req = new Request(`http://localhost${path}`, { headers });
  return app.fetch(req);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("rateLimiter middleware", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", async () => {
    const app = buildApp({ maxRequests: 5, windowMs: 60_000 });
    const res = await makeRequest(app, "/test", { "X-Forwarded-For": "10.0.0.1" });
    expect(res.status).toBe(200);
  });

  it("returns 429 after exceeding the limit", async () => {
    const app = buildApp({ maxRequests: 3, windowMs: 60_000 });
    const ip = "10.0.0.2";
    const headers = { "X-Forwarded-For": ip };

    // Exhaust the bucket
    for (let i = 0; i < 3; i++) {
      await makeRequest(app, "/test", headers);
    }

    const res = await makeRequest(app, "/test", headers);
    expect(res.status).toBe(429);
    const body = await res.json() as Record<string, unknown>;
    expect(body["code"]).toBe("RATE_LIMITED");
  });

  it("sets X-RateLimit-* headers on success", async () => {
    const app = buildApp({ maxRequests: 10, windowMs: 60_000 });
    const res = await makeRequest(app, "/test", { "X-Forwarded-For": "10.0.0.3" });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).not.toBeNull();
    expect(res.headers.get("X-RateLimit-Reset")).not.toBeNull();
  });

  it("sets Retry-After header on 429", async () => {
    const app = buildApp({ maxRequests: 1, windowMs: 60_000 });
    const ip = "10.0.0.4";
    const headers = { "X-Forwarded-For": ip };

    await makeRequest(app, "/test", headers); // consume
    const res = await makeRequest(app, "/test", headers); // blocked

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });

  it("counts down X-RateLimit-Remaining correctly", async () => {
    const app = buildApp({ maxRequests: 5, windowMs: 60_000 });
    const ip = "10.0.0.5";
    const headers = { "X-Forwarded-For": ip };

    const first = await makeRequest(app, "/test", headers);
    const second = await makeRequest(app, "/test", headers);

    const rem1 = Number(first.headers.get("X-RateLimit-Remaining"));
    const rem2 = Number(second.headers.get("X-RateLimit-Remaining"));
    expect(rem2).toBe(rem1 - 1);
  });

  it("tracks different IPs independently", async () => {
    const app = buildApp({ maxRequests: 1, windowMs: 60_000 });

    const res1 = await makeRequest(app, "/test", { "X-Forwarded-For": "10.1.1.1" });
    const res2 = await makeRequest(app, "/test", { "X-Forwarded-For": "10.1.1.2" });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200); // different IP – fresh bucket
  });

  it("uses userId key when preferUserId=true and auth context present", async () => {
    const app = new Hono();
    // Inject a mock auth context
    app.use("*", async (c, next) => {
      c.set("auth" as never, { userId: "user-abc" } as never);
      await next();
    });
    app.use("*", rateLimiter({ maxRequests: 2, windowMs: 60_000, preferUserId: true }));
    app.get("/test", (c) => c.json({ ok: true }));

    const fetchWith = (ip: string) =>
      app.fetch(new Request("http://localhost/test", { headers: { "X-Forwarded-For": ip } }));

    // Both requests share the same userId bucket, different IPs
    await fetchWith("1.1.1.1"); // 1st: remaining 1
    await fetchWith("2.2.2.2"); // 2nd: remaining 0 (same userId)
    const res = await fetchWith("3.3.3.3"); // 3rd: blocked
    expect(res.status).toBe(429);
  });

  it("respects skip() predicate", async () => {
    const app = buildApp({
      maxRequests: 0, // would block everything
      windowMs: 60_000,
      skip: () => true,
    });
    const res = await makeRequest(app, "/test");
    expect(res.status).toBe(200);
  });

  it("uses custom message when provided", async () => {
    const app = buildApp({
      maxRequests: 0,
      windowMs: 60_000,
      message: "Custom rate limit message",
    });
    const res = await makeRequest(app, "/test", { "X-Forwarded-For": "9.9.9.9" });
    expect(res.status).toBe(429);
    const body = await res.json() as Record<string, unknown>;
    expect(body["message"]).toBe("Custom rate limit message");
  });

  it("uses custom keyExtractor when provided", async () => {
    const app = buildApp({
      maxRequests: 1,
      windowMs: 60_000,
      keyExtractor: () => "fixed-key", // all requests share one bucket
    });

    const res1 = await makeRequest(app, "/test", { "X-Forwarded-For": "11.0.0.1" });
    const res2 = await makeRequest(app, "/test", { "X-Forwarded-For": "11.0.0.2" });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(429); // second request hits same key
  });
});
