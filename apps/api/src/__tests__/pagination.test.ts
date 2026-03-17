import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  encodeCursorFromRow,
  buildPageInfo,
  normalizeLimit,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../utils/pagination.js";

// ── Encode / Decode ────────────────────────────────────────────────────────

describe("encodeCursor / decodeCursor", () => {
  const payload = { id: "550e8400-e29b-41d4-a716-446655440000", createdAt: "2024-01-15T12:00:00.000Z" };

  it("round-trips a cursor payload", () => {
    const cursor = encodeCursor(payload);
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual(payload);
  });

  it("produces a base64url string (no +, /, =)", () => {
    const cursor = encodeCursor(payload);
    expect(cursor).not.toMatch(/[+/=]/);
  });

  it("throws for invalid cursor strings", () => {
    expect(() => decodeCursor("not-valid-base64!!!")).toThrow();
    expect(() => decodeCursor(Buffer.from("{}").toString("base64url"))).toThrow("Invalid cursor structure");
  });

  it("throws for cursors with missing fields", () => {
    const partial = Buffer.from(JSON.stringify({ id: "abc" })).toString("base64url");
    expect(() => decodeCursor(partial)).toThrow();
  });
});

// ── encodeCursorFromRow ────────────────────────────────────────────────────

describe("encodeCursorFromRow", () => {
  it("accepts a Date object", () => {
    const row = { id: "abc-123", createdAt: new Date("2024-06-01T00:00:00Z") };
    const cursor = encodeCursorFromRow(row);
    const decoded = decodeCursor(cursor);
    expect(decoded.id).toBe("abc-123");
    expect(decoded.createdAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("accepts an ISO string", () => {
    const row = { id: "xyz", createdAt: "2024-01-01T00:00:00.000Z" };
    const cursor = encodeCursorFromRow(row);
    const decoded = decodeCursor(cursor);
    expect(decoded.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });
});

// ── buildPageInfo ──────────────────────────────────────────────────────────

describe("buildPageInfo", () => {
  const makeItems = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      createdAt: new Date(2024, 0, i + 1),
    }));

  it("returns hasNextPage=true when items exceed requested", () => {
    const items = makeItems(11);
    const { pageInfo, items: paged } = buildPageInfo(items, 10);
    expect(pageInfo.hasNextPage).toBe(true);
    expect(paged).toHaveLength(10);
  });

  it("returns hasNextPage=false when items equal requested", () => {
    const items = makeItems(10);
    const { pageInfo } = buildPageInfo(items, 10);
    expect(pageInfo.hasNextPage).toBe(false);
  });

  it("returns hasNextPage=false when items fewer than requested", () => {
    const items = makeItems(5);
    const { pageInfo } = buildPageInfo(items, 10);
    expect(pageInfo.hasNextPage).toBe(false);
  });

  it("sets startCursor and endCursor from first and last items", () => {
    const items = makeItems(3);
    const { pageInfo } = buildPageInfo(items, 10);
    expect(pageInfo.startCursor).not.toBeNull();
    expect(pageInfo.endCursor).not.toBeNull();

    const start = decodeCursor(pageInfo.startCursor!);
    const end = decodeCursor(pageInfo.endCursor!);
    expect(start.id).toBe("id-0");
    expect(end.id).toBe("id-2");
  });

  it("returns null cursors for empty result", () => {
    const { pageInfo } = buildPageInfo([], 10);
    expect(pageInfo.startCursor).toBeNull();
    expect(pageInfo.endCursor).toBeNull();
    expect(pageInfo.hasNextPage).toBe(false);
  });

  it("propagates hasPreviousPage flag", () => {
    const items = makeItems(3);
    const { pageInfo } = buildPageInfo(items, 10, true);
    expect(pageInfo.hasPreviousPage).toBe(true);
  });

  it("trims the extra item when hasNextPage is detected", () => {
    const items = makeItems(6);
    const { items: paged } = buildPageInfo(items, 5);
    expect(paged).toHaveLength(5);
    expect(paged[paged.length - 1]?.id).toBe("id-4");
  });
});

// ── normalizeLimit ─────────────────────────────────────────────────────────

describe("normalizeLimit", () => {
  it("returns DEFAULT_PAGE_SIZE for undefined", () => {
    expect(normalizeLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("returns DEFAULT_PAGE_SIZE for 0", () => {
    expect(normalizeLimit(0)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("returns DEFAULT_PAGE_SIZE for negative", () => {
    expect(normalizeLimit(-5)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("returns DEFAULT_PAGE_SIZE for NaN", () => {
    expect(normalizeLimit("abc")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps to MAX_PAGE_SIZE", () => {
    expect(normalizeLimit(999)).toBe(MAX_PAGE_SIZE);
    expect(normalizeLimit(MAX_PAGE_SIZE)).toBe(MAX_PAGE_SIZE);
  });

  it("returns the provided value when within range", () => {
    expect(normalizeLimit(50)).toBe(50);
    expect(normalizeLimit("25")).toBe(25);
  });

  it("returns 1 for input 1", () => {
    expect(normalizeLimit(1)).toBe(1);
  });
});
