import { describe, it, expect, vi } from "vitest";
import { gunzipSync } from "zlib";
import { BackupExporter } from "../exporter.js";
import { BackupFormat, BackupStatus } from "../types.js";
import type { BackupNode, BackupEdge, BackupUser, BackupOptions } from "../types.js";

function makeNode(id: string, type = "concept"): BackupNode {
  return {
    id,
    type,
    properties: { title: `Node ${id}` },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeEdge(id: string, sourceId: string, targetId: string): BackupEdge {
  return {
    id,
    sourceId,
    targetId,
    type: "relates_to",
    properties: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeUser(id: string): BackupUser {
  return { id, email: `${id}@example.com`, name: id, role: "member", createdAt: new Date().toISOString() };
}

const defaultOptions: BackupOptions = { compression: false };

describe("BackupExporter", () => {
  const exporter = new BackupExporter();

  describe("export()", () => {
    it("produces valid JSON backup", async () => {
      const nodes = [makeNode("n1"), makeNode("n2")];
      const edges = [makeEdge("e1", "n1", "n2")];
      const users = [makeUser("u1")];

      const result = await exporter.export({ nodes, edges, users }, defaultOptions);

      expect(result.metadata.nodeCount).toBe(2);
      expect(result.metadata.edgeCount).toBe(1);
      expect(result.metadata.userCount).toBe(1);
      expect(result.metadata.format).toBe(BackupFormat.Json);
      expect(result.metadata.status).toBe(BackupStatus.Completed);
      expect(result.content).toBeInstanceOf(Buffer);
    });

    it("content is parseable JSON", async () => {
      const nodes = [makeNode("n1")];
      const result = await exporter.export({ nodes, edges: [], users: [] }, defaultOptions);
      const parsed = JSON.parse(result.content.toString("utf-8")) as Record<string, unknown>;
      expect(parsed.nodes).toBeDefined();
      expect(parsed.edges).toBeDefined();
    });

    it("compresses when compression is enabled", async () => {
      const nodes = [makeNode("n1")];
      const result = await exporter.export({ nodes, edges: [], users: [] }, { compression: true });

      expect(result.metadata.format).toBe(BackupFormat.JsonGzip);
      expect(result.metadata.compressedSize).toBeDefined();

      // Should decompress successfully
      const decompressed = gunzipSync(result.content);
      const parsed = JSON.parse(decompressed.toString("utf-8")) as Record<string, unknown>;
      expect(parsed.nodes).toBeDefined();
    });

    it("compressed size is less than uncompressed for repeated content", async () => {
      // Highly compressible data
      const nodes = Array.from({ length: 100 }, (_, i) => makeNode(`n${i}`));
      const resultUncompressed = await exporter.export({ nodes, edges: [], users: [] }, { compression: false });
      const resultCompressed = await exporter.export({ nodes, edges: [], users: [] }, { compression: true });

      expect(resultCompressed.content.length).toBeLessThan(resultUncompressed.content.length);
    });

    it("generates a checksum", async () => {
      const result = await exporter.export({ nodes: [makeNode("n1")], edges: [], users: [] }, defaultOptions);
      expect(result.metadata.checksum).toBeTruthy();
      expect(result.metadata.checksum).toHaveLength(64); // SHA-256 hex
    });

    it("checksum is reproducible", async () => {
      const data = { nodes: [makeNode("n1")], edges: [], users: [] };
      const r1 = await exporter.export(data, defaultOptions);
      const checksum1 = exporter.computeChecksum(r1.content);
      const checksum2 = exporter.computeChecksum(r1.content);
      expect(checksum1).toBe(checksum2);
    });

    it("excludes nodes matching exclude patterns", async () => {
      const nodes = [makeNode("n1", "concept"), makeNode("n2", "temp_cache")];
      const result = await exporter.export(
        { nodes, edges: [], users: [] },
        { compression: false, excludePatterns: ["temp_"] }
      );
      expect(result.metadata.nodeCount).toBe(1);
    });

    it("excludes edges whose endpoints are excluded", async () => {
      const nodes = [makeNode("n1", "concept"), makeNode("n2", "temp_cache")];
      const edges = [makeEdge("e1", "n1", "n2")]; // n2 is excluded
      const result = await exporter.export(
        { nodes, edges, users: [] },
        { compression: false, excludePatterns: ["temp_"] }
      );
      expect(result.metadata.edgeCount).toBe(0);
    });

    it("attaches label and tags", async () => {
      const result = await exporter.export(
        { nodes: [], edges: [], users: [] },
        { compression: false, label: "prod-backup", tags: ["production", "weekly"] }
      );
      expect(result.metadata.label).toBe("prod-backup");
      expect(result.metadata.tags).toContain("production");
    });

    it("splits into chunks when chunkSizeBytes is set", async () => {
      const nodes = Array.from({ length: 20 }, (_, i) => makeNode(`n${i}`));
      const result = await exporter.export(
        { nodes, edges: [], users: [] },
        { compression: false, chunkSizeBytes: 100 }
      );
      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
    });

    it("reports progress", async () => {
      const onProgress = vi.fn();
      const nodes = [makeNode("n1"), makeNode("n2")];
      await exporter.export({ nodes, edges: [], users: [] }, { compression: false, onProgress });
      expect(onProgress).toHaveBeenCalled();
      const calls = onProgress.mock.calls.map((c) => (c as [{ phase: string }])[0].phase);
      expect(calls).toContain("nodes");
    });
  });

  describe("splitIntoChunks()", () => {
    it("splits buffer into correct number of chunks", () => {
      const buf = Buffer.alloc(250);
      const chunks = exporter.splitIntoChunks(buf, 100);
      expect(chunks).toHaveLength(3);
      expect(chunks[0]!.length).toBe(100);
      expect(chunks[1]!.length).toBe(100);
      expect(chunks[2]!.length).toBe(50);
    });

    it("single chunk when content smaller than chunk size", () => {
      const buf = Buffer.from("hello");
      const chunks = exporter.splitIntoChunks(buf, 1000);
      expect(chunks).toHaveLength(1);
    });
  });

  describe("exportStreaming()", () => {
    it("yields chunks and metadata", async () => {
      const nodes = [makeNode("n1")];
      const chunks: string[] = [];
      let metadata = null;

      for await (const item of exporter.exportStreaming({ nodes, edges: [], users: [] }, defaultOptions)) {
        if (item.type === "chunk") chunks.push(item.data);
        else metadata = item.data;
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(metadata).toBeDefined();
    });
  });
});
