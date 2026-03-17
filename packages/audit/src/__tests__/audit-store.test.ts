import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryAuditStore } from "../audit-store.js";
import { AuditAction } from "../types.js";
import type { AuditEntry } from "../types.js";

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    action: AuditAction.Read,
    actor: { id: "user-1", type: "user", name: "Alice" },
    resource: { type: "node", id: "node-1", name: "Plan" },
    timestamp: new Date(),
    metadata: {},
    outcome: "success",
    ...overrides,
  };
}

describe("InMemoryAuditStore", () => {
  let store: InMemoryAuditStore;

  beforeEach(() => {
    store = new InMemoryAuditStore();
  });

  describe("append()", () => {
    it("stores entries", async () => {
      await store.append(makeEntry());
      expect(await store.size()).toBe(1);
    });

    it("stores multiple entries", async () => {
      await store.append(makeEntry());
      await store.append(makeEntry());
      expect(await store.size()).toBe(2);
    });

    it("rotates when maxSize exceeded", async () => {
      const small = new InMemoryAuditStore({ maxSize: 5, rotateBy: 2 });
      for (let i = 0; i < 6; i++) await small.append(makeEntry());
      // After exceeding 5, removes 2 oldest → 4 remain
      expect(await small.size()).toBe(4);
    });
  });

  describe("query() - filters", () => {
    beforeEach(async () => {
      await store.append(makeEntry({ actor: { id: "user-1", type: "user" }, action: AuditAction.Create }));
      await store.append(makeEntry({ actor: { id: "user-2", type: "user" }, action: AuditAction.Delete }));
      await store.append(makeEntry({ actor: { id: "user-1", type: "user" }, action: AuditAction.Read, resource: { type: "edge", id: "e-1" } }));
    });

    it("filters by actorId", async () => {
      const { entries } = await store.query({ actorId: "user-1" });
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.actor.id === "user-1")).toBe(true);
    });

    it("filters by action", async () => {
      const { entries } = await store.query({ action: AuditAction.Delete });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.action).toBe(AuditAction.Delete);
    });

    it("filters by multiple actions", async () => {
      const { entries } = await store.query({ action: [AuditAction.Create, AuditAction.Delete] });
      expect(entries).toHaveLength(2);
    });

    it("filters by resourceType", async () => {
      const { entries } = await store.query({ resourceType: "edge" });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.resource.type).toBe("edge");
    });

    it("filters by time range", async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10_000);
      const future = new Date(now.getTime() + 10_000);

      const { entries } = await store.query({ startTime: past, endTime: future });
      expect(entries).toHaveLength(3);
    });

    it("returns empty when no match", async () => {
      const { entries } = await store.query({ actorId: "nobody" });
      expect(entries).toHaveLength(0);
    });
  });

  describe("query() - pagination", () => {
    beforeEach(async () => {
      for (let i = 0; i < 10; i++) {
        await store.append(makeEntry({ id: `e-${i}` }));
      }
    });

    it("respects limit", async () => {
      const { entries } = await store.query({ limit: 3 });
      expect(entries).toHaveLength(3);
    });

    it("provides nextCursor when more results exist", async () => {
      const { entries, nextCursor } = await store.query({ limit: 3 });
      expect(entries).toHaveLength(3);
      expect(nextCursor).toBeTruthy();
    });

    it("returns undefined cursor on last page", async () => {
      const { nextCursor } = await store.query({ limit: 100 });
      expect(nextCursor).toBeUndefined();
    });

    it("cursor-based pagination returns next page", async () => {
      const page1 = await store.query({ limit: 4 });
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await store.query({ limit: 4, cursor: page1.nextCursor });
      expect(page2.entries).toHaveLength(4);

      // pages should not overlap
      const ids1 = new Set(page1.entries.map((e) => e.id));
      const ids2 = new Set(page2.entries.map((e) => e.id));
      const overlap = [...ids1].filter((id) => ids2.has(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe("aggregate()", () => {
    beforeEach(async () => {
      const day1 = new Date("2024-01-01T10:00:00Z");
      const day2 = new Date("2024-01-02T10:00:00Z");

      await store.append(makeEntry({ timestamp: day1, actor: { id: "u1", type: "user" }, action: AuditAction.Create }));
      await store.append(makeEntry({ timestamp: day1, actor: { id: "u1", type: "user" }, action: AuditAction.Delete }));
      await store.append(makeEntry({ timestamp: day2, actor: { id: "u2", type: "user" }, action: AuditAction.Create }));
    });

    it("aggregates events per day", async () => {
      const agg = await store.aggregate({});
      expect(agg.eventsPerDay["2024-01-01"]).toBe(2);
      expect(agg.eventsPerDay["2024-01-02"]).toBe(1);
    });

    it("aggregates events per user", async () => {
      const agg = await store.aggregate({});
      expect(agg.eventsPerUser["u1"]).toBe(2);
      expect(agg.eventsPerUser["u2"]).toBe(1);
    });

    it("aggregates events per action", async () => {
      const agg = await store.aggregate({});
      expect(agg.eventsPerAction[AuditAction.Create]).toBe(2);
      expect(agg.eventsPerAction[AuditAction.Delete]).toBe(1);
    });
  });

  describe("export()", () => {
    beforeEach(async () => {
      await store.append(makeEntry({ id: "exp-1", action: AuditAction.Read }));
      await store.append(makeEntry({ id: "exp-2", action: AuditAction.Create }));
    });

    it("exports valid JSON", async () => {
      const json = await store.export("json");
      const parsed = JSON.parse(json) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
    });

    it("exports CSV with header", async () => {
      const csv = await store.export("csv");
      const lines = csv.split("\n");
      expect(lines[0]).toContain("id");
      expect(lines[0]).toContain("action");
      expect(lines).toHaveLength(3); // header + 2 rows
    });

    it("applies query filter to export", async () => {
      const json = await store.export("json", { action: AuditAction.Read });
      const parsed = JSON.parse(json) as unknown[];
      expect(parsed).toHaveLength(1);
    });
  });

  describe("compact()", () => {
    it("removes old entries and replaces with summaries", async () => {
      const old = new Date("2020-01-01");
      const recent = new Date();

      await store.append(makeEntry({ timestamp: old, actor: { id: "u1", type: "user" }, action: AuditAction.Read }));
      await store.append(makeEntry({ timestamp: old, actor: { id: "u1", type: "user" }, action: AuditAction.Read }));
      await store.append(makeEntry({ timestamp: recent }));

      const cutoff = new Date("2021-01-01");
      await store.compact(cutoff);

      // Should have 1 compacted summary + 1 recent
      expect(await store.size()).toBe(2);
    });
  });
});
