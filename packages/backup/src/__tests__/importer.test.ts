import { describe, it, expect, vi } from "vitest";
import { BackupImporter } from "../importer.js";
import { BackupExporter } from "../exporter.js";
import { BackupFormat, BackupStatus } from "../types.js";
import type { BackupNode, BackupEdge, BackupUser, BackupPayload, BackupMetadata, ExistingDataStore } from "../../src/types.js";
import type { ExistingDataStore as ImporterStore } from "../importer.js";

function makeNode(id: string): BackupNode {
  return { id, type: "concept", properties: { title: id }, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" };
}

function makeEdge(id: string, src: string, tgt: string): BackupEdge {
  return { id, sourceId: src, targetId: tgt, type: "relates_to", properties: {}, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" };
}

function makeUser(id: string): BackupUser {
  return { id, email: `${id}@test.com`, name: id, role: "member", createdAt: "2024-01-01T00:00:00Z" };
}

function makeMetadata(overrides: Partial<BackupMetadata> = {}): BackupMetadata {
  return {
    id: "backup-1",
    timestamp: new Date(),
    schemaVersion: 1,
    format: BackupFormat.Json,
    size: 0,
    nodeCount: 0,
    edgeCount: 0,
    userCount: 0,
    status: BackupStatus.Completed,
    checksum: "",
    tags: [],
    ...overrides,
  };
}

function makePayload(nodes: BackupNode[], edges: BackupEdge[], users: BackupUser[]): BackupPayload {
  return {
    metadata: makeMetadata({ nodeCount: nodes.length, edgeCount: edges.length, userCount: users.length }),
    nodes,
    edges,
    users,
  };
}

function makeStore(existingIds: { nodes?: string[]; edges?: string[]; users?: string[] } = {}): ImporterStore {
  const nodeIds = new Set(existingIds.nodes ?? []);
  const edgeIds = new Set(existingIds.edges ?? []);
  const userIds = new Set(existingIds.users ?? []);
  return {
    nodeExists: (id) => nodeIds.has(id),
    edgeExists: (id) => edgeIds.has(id),
    userExists: (id) => userIds.has(id),
  };
}

describe("BackupImporter", () => {
  describe("importPayload()", () => {
    it("imports all data when no conflicts", async () => {
      const importer = new BackupImporter(makeStore());
      const payload = makePayload(
        [makeNode("n1"), makeNode("n2")],
        [makeEdge("e1", "n1", "n2")],
        [makeUser("u1")]
      );

      const result = await importer.importPayload(payload, { conflictResolution: "skip" });

      expect(result.nodesImported).toBe(2);
      expect(result.nodesSkipped).toBe(0);
      expect(result.edgesImported).toBe(1);
      expect(result.usersImported).toBe(1);
    });

    it("skips conflicting nodes when resolution is 'skip'", async () => {
      const importer = new BackupImporter(makeStore({ nodes: ["n1"] }));
      const payload = makePayload([makeNode("n1"), makeNode("n2")], [], []);

      const result = await importer.importPayload(payload, { conflictResolution: "skip" });

      expect(result.nodesImported).toBe(1);
      expect(result.nodesSkipped).toBe(1);
    });

    it("overwrites conflicting nodes when resolution is 'overwrite'", async () => {
      const importer = new BackupImporter(makeStore({ nodes: ["n1"] }));
      const payload = makePayload([makeNode("n1")], [], []);

      const result = await importer.importPayload(payload, { conflictResolution: "overwrite" });

      expect(result.nodesImported).toBe(1);
      expect(result.nodesSkipped).toBe(0);
    });

    it("dry run does not persist but returns accurate counts", async () => {
      const importer = new BackupImporter(makeStore());
      const payload = makePayload([makeNode("n1"), makeNode("n2")], [], []);

      const result = await importer.importPayload(payload, { conflictResolution: "skip", dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.nodesImported).toBe(2);
    });

    it("remaps IDs when remapIds is true", async () => {
      const importer = new BackupImporter(makeStore());
      const payload = makePayload([makeNode("n1")], [], []);

      const result = await importer.importPayload(payload, { conflictResolution: "skip", remapIds: true });

      expect(result.idMappings.has("n1")).toBe(true);
      expect(result.idMappings.get("n1")).not.toBe("n1");
    });

    it("throws for unsupported schema version", async () => {
      const importer = new BackupImporter(makeStore());
      const payload = makePayload([], [], []);
      payload.metadata.schemaVersion = 999;

      await expect(importer.importPayload(payload, { conflictResolution: "skip" })).rejects.toThrow(
        "Unsupported schema version"
      );
    });

    it("throws when referential integrity fails", async () => {
      const importer = new BackupImporter(makeStore());
      const nodes = [makeNode("n1")];
      const edges = [makeEdge("e1", "n1", "NONEXISTENT")]; // bad reference
      const payload = makePayload(nodes, edges, []);

      await expect(importer.importPayload(payload, { conflictResolution: "skip" })).rejects.toThrow(
        "Referential integrity"
      );
    });

    it("reports progress during import", async () => {
      const onProgress = vi.fn();
      const importer = new BackupImporter(makeStore());
      const payload = makePayload([makeNode("n1")], [], [makeUser("u1")]);

      await importer.importPayload(payload, { conflictResolution: "skip", onProgress });

      expect(onProgress).toHaveBeenCalled();
      const phases = onProgress.mock.calls.map((c) => (c as [{ phase: string }])[0].phase);
      expect(phases).toContain("nodes");
    });
  });

  describe("import() from Buffer", () => {
    it("imports from uncompressed JSON buffer", async () => {
      const exporter = new BackupExporter();
      const nodes = [makeNode("n1"), makeNode("n2")];
      const { content } = await exporter.export({ nodes, edges: [], users: [] }, { compression: false });

      const importer = new BackupImporter(makeStore());
      const result = await importer.import(content, BackupFormat.Json, { conflictResolution: "skip" });

      expect(result.nodesImported).toBe(2);
    });

    it("imports from compressed buffer", async () => {
      const exporter = new BackupExporter();
      const nodes = [makeNode("n1")];
      const { content } = await exporter.export({ nodes, edges: [], users: [] }, { compression: true });

      const importer = new BackupImporter(makeStore());
      const result = await importer.import(content, BackupFormat.JsonGzip, { conflictResolution: "skip" });

      expect(result.nodesImported).toBe(1);
    });
  });

  describe("validateReferentialIntegrity()", () => {
    it("returns no errors when all refs are valid", () => {
      const importer = new BackupImporter(makeStore());
      const payload = makePayload(
        [makeNode("n1"), makeNode("n2")],
        [makeEdge("e1", "n1", "n2")],
        []
      );
      expect(importer.validateReferentialIntegrity(payload)).toHaveLength(0);
    });

    it("returns errors for dangling references", () => {
      const importer = new BackupImporter(makeStore());
      const payload = makePayload(
        [makeNode("n1")],
        [makeEdge("e1", "n1", "GHOST")],
        []
      );
      const errors = importer.validateReferentialIntegrity(payload);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("GHOST");
    });
  });

  describe("isCompatible()", () => {
    it("returns true for schema version 1", () => {
      const importer = new BackupImporter(makeStore());
      expect(importer.isCompatible(1)).toBe(true);
    });

    it("returns false for unknown schema version", () => {
      const importer = new BackupImporter(makeStore());
      expect(importer.isCompatible(99)).toBe(false);
    });
  });
});
