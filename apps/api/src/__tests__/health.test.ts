import { describe, it, expect } from "vitest";
import { healthRoutes } from "../routes/health.js";

// ── Health endpoint ────────────────────────────────────────────────────────

describe("GET /", () => {
  it("returns 200 with status ok", async () => {
    const req = new Request("http://localhost/");
    const res = await healthRoutes.fetch(req);
    expect(res.status).toBe(200);
  });

  it("returns JSON with status=ok", async () => {
    const req = new Request("http://localhost/");
    const res = await healthRoutes.fetch(req);
    const body = await res.json() as Record<string, unknown>;
    expect(body["status"]).toBe("ok");
  });

  it("includes version field", async () => {
    const req = new Request("http://localhost/");
    const res = await healthRoutes.fetch(req);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body["version"]).toBe("string");
    expect((body["version"] as string).length).toBeGreaterThan(0);
  });

  it("includes a valid ISO timestamp", async () => {
    const before = new Date().toISOString();
    const req = new Request("http://localhost/");
    const res = await healthRoutes.fetch(req);
    const after = new Date().toISOString();
    const body = await res.json() as Record<string, unknown>;

    expect(typeof body["timestamp"]).toBe("string");
    const ts = new Date(body["timestamp"] as string).toISOString();
    expect(ts >= before).toBe(true);
    expect(ts <= after).toBe(true);
  });

  it("sets Content-Type to application/json", async () => {
    const req = new Request("http://localhost/");
    const res = await healthRoutes.fetch(req);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
