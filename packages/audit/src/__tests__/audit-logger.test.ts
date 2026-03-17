import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuditLogger } from "../audit-logger.js";
import { InMemoryAuditStore } from "../audit-store.js";
import { AuditAction } from "../types.js";
import type { AuditActor, AuditEntry, AuditResource } from "../types.js";

const actor: AuditActor = { id: "user-1", type: "user", name: "Alice", email: "alice@example.com" };
const resource: AuditResource = { type: "node", id: "node-1", name: "Project Plan" };

function makeLogger(store?: InMemoryAuditStore, bufferSize = 100) {
  return new AuditLogger({
    store: store ?? new InMemoryAuditStore(),
    bufferSize,
    flushIntervalMs: 60_000, // don't auto-flush in tests
  });
}

describe("AuditLogger", () => {
  let store: InMemoryAuditStore;
  let logger: AuditLogger;

  beforeEach(() => {
    store = new InMemoryAuditStore();
    logger = makeLogger(store);
  });

  afterEach(async () => {
    await logger.shutdown();
  });

  describe("log()", () => {
    it("creates an entry with required fields", async () => {
      await logger.log(AuditAction.Create, actor, resource);
      await logger.flush();

      const { entries } = await store.query({});
      expect(entries).toHaveLength(1);
      const entry = entries[0]!;
      expect(entry.action).toBe(AuditAction.Create);
      expect(entry.actor.id).toBe("user-1");
      expect(entry.resource.type).toBe("node");
      expect(entry.outcome).toBe("success");
      expect(entry.id).toBeTruthy();
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it("stores metadata", async () => {
      await logger.log(AuditAction.Update, actor, resource, {
        metadata: { reason: "scheduled" },
      });
      await logger.flush();

      const { entries } = await store.query({});
      expect(entries[0]!.metadata.reason).toBe("scheduled");
    });

    it("records failure outcome", async () => {
      await logger.failure(AuditAction.Delete, actor, resource, "permission denied");
      await logger.flush();

      const { entries } = await store.query({});
      const entry = entries[0]!;
      expect(entry.outcome).toBe("failure");
      expect(entry.errorMessage).toBe("permission denied");
    });

    it("propagates context fields", async () => {
      logger.setContext({ requestId: "req-123", sessionId: "ses-456", ip: "1.2.3.4" });
      await logger.log(AuditAction.Read, actor, resource);
      await logger.flush();

      const { entries } = await store.query({});
      const entry = entries[0]!;
      expect(entry.requestId).toBe("req-123");
      expect(entry.sessionId).toBe("ses-456");
      expect(entry.ip).toBe("1.2.3.4");
    });

    it("per-call context overrides global context", async () => {
      logger.setContext({ requestId: "global-req" });
      await logger.log(AuditAction.Read, actor, resource, {
        context: { requestId: "local-req" },
      });
      await logger.flush();

      const { entries } = await store.query({});
      expect(entries[0]!.requestId).toBe("local-req");
    });
  });

  describe("sensitive field redaction", () => {
    it("redacts password in metadata", async () => {
      await logger.log(AuditAction.Update, actor, resource, {
        metadata: { password: "hunter2", username: "alice" },
      });
      await logger.flush();

      const { entries } = await store.query({});
      expect(entries[0]!.metadata.password).toBe("[REDACTED]");
      expect(entries[0]!.metadata.username).toBe("alice");
    });

    it("redacts nested sensitive fields", async () => {
      await logger.log(AuditAction.Create, actor, resource, {
        metadata: { credentials: { apiKey: "sk-12345", label: "prod" } },
      });
      await logger.flush();

      const { entries } = await store.query({});
      const creds = entries[0]!.metadata.credentials as Record<string, unknown>;
      expect(creds.apiKey).toBe("[REDACTED]");
      expect(creds.label).toBe("prod");
    });

    it("redacts sensitive fields in diff", async () => {
      await logger.log(AuditAction.Update, actor, resource, {
        oldValue: { password: "old", name: "Alice" },
        newValue: { password: "new", name: "Alice B" },
      });
      await logger.flush();

      const { entries } = await store.query({});
      const diff = entries[0]!.diff!;
      const passwordDiff = diff.find((d) => d.field === "password");
      expect(passwordDiff!.oldValue).toBe("[REDACTED]");
      expect(passwordDiff!.newValue).toBe("[REDACTED]");
    });
  });

  describe("diff generation", () => {
    it("generates diff for update events", async () => {
      await logger.log(AuditAction.Update, actor, resource, {
        oldValue: { title: "Old Title", count: 1 },
        newValue: { title: "New Title", count: 1 },
      });
      await logger.flush();

      const { entries } = await store.query({});
      const diff = entries[0]!.diff!;
      expect(diff).toHaveLength(1);
      expect(diff[0]!.field).toBe("title");
      expect(diff[0]!.oldValue).toBe("Old Title");
      expect(diff[0]!.newValue).toBe("New Title");
    });

    it("captures added fields in diff", async () => {
      await logger.log(AuditAction.Update, actor, resource, {
        oldValue: { title: "Test" },
        newValue: { title: "Test", tags: ["a"] },
      });
      await logger.flush();

      const { entries } = await store.query({});
      const diff = entries[0]!.diff!;
      const tagsDiff = diff.find((d) => d.field === "tags");
      expect(tagsDiff).toBeDefined();
      expect(tagsDiff!.oldValue).toBeUndefined();
    });

    it("produces no diff when nothing changed", async () => {
      await logger.log(AuditAction.Update, actor, resource, {
        oldValue: { x: 1 },
        newValue: { x: 1 },
      });
      await logger.flush();

      const { entries } = await store.query({});
      expect(entries[0]!.diff).toBeUndefined();
    });
  });

  describe("buffering", () => {
    it("auto-flushes when buffer size is reached", async () => {
      const tinyStore = new InMemoryAuditStore();
      const tinyLogger = new AuditLogger({
        store: tinyStore,
        bufferSize: 3,
        flushIntervalMs: 60_000,
      });

      await tinyLogger.log(AuditAction.Read, actor, resource);
      await tinyLogger.log(AuditAction.Read, actor, resource);
      expect(await tinyStore.size()).toBe(0); // not flushed yet

      await tinyLogger.log(AuditAction.Read, actor, resource);
      // 3rd entry triggers flush
      expect(await tinyStore.size()).toBe(3);

      await tinyLogger.shutdown();
    });
  });

  describe("middleware hooks", () => {
    it("applies middleware hooks to entries", async () => {
      logger.use((entry: AuditEntry) => ({
        ...entry,
        metadata: { ...entry.metadata, enriched: true },
      }));

      await logger.log(AuditAction.Create, actor, resource);
      await logger.flush();

      const { entries } = await store.query({});
      expect(entries[0]!.metadata.enriched).toBe(true);
    });

    it("runs multiple hooks in order", async () => {
      logger.use((entry: AuditEntry) => ({
        ...entry,
        metadata: { ...entry.metadata, step: 1 },
      }));
      logger.use((entry: AuditEntry) => ({
        ...entry,
        metadata: { ...entry.metadata, step: (entry.metadata.step as number) + 1 },
      }));

      await logger.log(AuditAction.Create, actor, resource);
      await logger.flush();

      const { entries } = await store.query({});
      expect(entries[0]!.metadata.step).toBe(2);
    });
  });

  describe("describeAction()", () => {
    it("describes create action", async () => {
      await logger.log(AuditAction.Create, actor, resource);
      await logger.flush();

      const { entries } = await store.query({});
      const desc = AuditLogger.describeAction(entries[0]!);
      expect(desc).toBe("Alice created node 'Project Plan'");
    });

    it("appends failure info", async () => {
      await logger.failure(AuditAction.Login, actor, resource, "bad credentials");
      await logger.flush();

      const { entries } = await store.query({});
      const desc = AuditLogger.describeAction(entries[0]!);
      expect(desc).toContain("FAILED");
      expect(desc).toContain("bad credentials");
    });
  });

  describe("shutdown()", () => {
    it("flushes remaining entries on shutdown", async () => {
      await logger.log(AuditAction.Read, actor, resource);
      expect(await store.size()).toBe(0);

      await logger.shutdown();
      expect(await store.size()).toBe(1);
    });
  });
});
