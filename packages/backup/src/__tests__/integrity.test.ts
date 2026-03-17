import { describe, it, expect } from "vitest";
import { IntegrityChecker } from "../integrity.js";
import { BackupExporter } from "../exporter.js";
import { BackupFormat, BackupStatus } from "../types.js";
import type { BackupMetadata, BackupNode, BackupEdge, BackupPayload } from "../types.js";

function makeNode(id: string): BackupNode {
  return { id, type: "concept", properties: {}, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" };
}

function makeEdge(id: string, src: string, tgt: string): BackupEdge {
  return { id, sourceId: src, targetId: tgt, type: "relates_to", properties: {}, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" };
}

function makeMetadata(content: Buffer, overrides: Partial<BackupMetadata> = {}): BackupMetadata {
  const checker = new IntegrityChecker();
  return {
    id: "bk-1",
    timestamp: new Date(),
    schemaVersion: 1,
    format: BackupFormat.Json,
    size: content.length,
    nodeCount: 0,
    edgeCount: 0,
    userCount: 0,
    status: BackupStatus.Completed,
    checksum: checker.verifyChecksum(content, "") ? "" : checker["computeChecksum"]?.(content) ?? "",
    tags: [],
    ...overrides,
  };
}

describe("IntegrityChecker", () => {
  const checker = new IntegrityChecker();
  const exporter = new BackupExporter();

  async function makeValidBackup(nodes: BackupNode[] = [], edges: BackupEdge[] = []) {
    const result = await exporter.export({ nodes, edges, users: [] }, { compression: false });
    const metadata = result.metadata;
    return { content: result.content, metadata };
  }

  describe("verifyChecksum()", () => {
    it("returns true for correct checksum", async () => {
      const { content, metadata } = await makeValidBackup([makeNode("n1")]);
      expect(checker.verifyChecksum(content, metadata.checksum)).toBe(true);
    });

    it("returns false for incorrect checksum", async () => {
      const { content } = await makeValidBackup([makeNode("n1")]);
      expect(checker.verifyChecksum(content, "deadbeef")).toBe(false);
    });

    it("returns false when content is tampered", async () => {
      const { content, metadata } = await makeValidBackup([makeNode("n1")]);
      const tampered = Buffer.from(content.toString("utf-8").replace("concept", "hacked"), "utf-8");
      expect(checker.verifyChecksum(tampered, metadata.checksum)).toBe(false);
    });
  });

  describe("check()", () => {
    it("returns valid for correct backup", async () => {
      const nodes = [makeNode("n1"), makeNode("n2")];
      const edges = [makeEdge("e1", "n1", "n2")];
      const { content, metadata } = await makeValidBackup(nodes, edges);
      const metaWithCounts = { ...metadata, nodeCount: 2, edgeCount: 1 };

      const report = checker.check(content, metaWithCounts);
      expect(report.valid).toBe(true);
      expect(report.checksumValid).toBe(true);
      expect(report.schemaCompatible).toBe(true);
      expect(report.referentialIntegrityValid).toBe(true);
    });

    it("fails on checksum mismatch", async () => {
      const { content, metadata } = await makeValidBackup([makeNode("n1")]);
      const badMeta = { ...metadata, checksum: "badhash" };

      const report = checker.check(content, badMeta);
      expect(report.valid).toBe(false);
      expect(report.checksumValid).toBe(false);
      expect(report.issues.some((i) => i.code === "CHECKSUM_MISMATCH")).toBe(true);
    });

    it("fails for unsupported schema version", async () => {
      const { content, metadata } = await makeValidBackup();
      const badMeta = { ...metadata, schemaVersion: 999 };

      const report = checker.check(content, badMeta);
      expect(report.schemaCompatible).toBe(false);
      expect(report.issues.some((i) => i.code === "UNSUPPORTED_SCHEMA")).toBe(true);
    });

    it("warns on node/edge count mismatch", async () => {
      const nodes = [makeNode("n1")];
      const { content, metadata } = await makeValidBackup(nodes);
      const badMeta = { ...metadata, nodeCount: 99 }; // wrong count

      const report = checker.check(content, badMeta);
      expect(report.issues.some((i) => i.code === "COUNT_MISMATCH_NODES")).toBe(true);
    });
  });

  describe("validateReferentialIntegrity()", () => {
    it("passes for valid payload", () => {
      const payload: BackupPayload = {
        metadata: {} as BackupMetadata,
        nodes: [makeNode("n1"), makeNode("n2")],
        edges: [makeEdge("e1", "n1", "n2")],
        users: [],
      };
      const issues = checker.validateReferentialIntegrity(payload);
      expect(issues).toHaveLength(0);
    });

    it("reports dangling source reference", () => {
      const payload: BackupPayload = {
        metadata: {} as BackupMetadata,
        nodes: [makeNode("n1")],
        edges: [makeEdge("e1", "GHOST", "n1")],
        users: [],
      };
      const issues = checker.validateReferentialIntegrity(payload);
      expect(issues.some((i) => i.code === "DANGLING_SOURCE_REF")).toBe(true);
    });

    it("reports dangling target reference", () => {
      const payload: BackupPayload = {
        metadata: {} as BackupMetadata,
        nodes: [makeNode("n1")],
        edges: [makeEdge("e1", "n1", "GHOST")],
        users: [],
      };
      const issues = checker.validateReferentialIntegrity(payload);
      expect(issues.some((i) => i.code === "DANGLING_TARGET_REF")).toBe(true);
    });

    it("detects duplicate node IDs", () => {
      const payload: BackupPayload = {
        metadata: {} as BackupMetadata,
        nodes: [makeNode("n1"), makeNode("n1")],
        edges: [],
        users: [],
      };
      const issues = checker.validateReferentialIntegrity(payload);
      expect(issues.some((i) => i.code === "DUPLICATE_NODE_ID")).toBe(true);
    });
  });

  describe("validateStructure()", () => {
    it("returns no issues for valid payload", async () => {
      const { content, metadata } = await makeValidBackup([makeNode("n1")]);
      const payload = checker.parsePayload(content, metadata.format);
      const issues = checker.validateStructure(payload);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });

    it("errors when nodes array is missing", () => {
      const payload = { metadata: {}, edges: [], users: [] } as unknown as BackupPayload;
      const issues = checker.validateStructure(payload);
      expect(issues.some((i) => i.code === "INVALID_NODES")).toBe(true);
    });
  });
});
