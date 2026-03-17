import { describe, it, expect } from "vitest";
import { BackupDiff } from "../diff.js";
import { BackupFormat, BackupStatus } from "../types.js";
import type { BackupNode, BackupEdge, BackupUser, BackupPayload, BackupMetadata } from "../types.js";

function makeNode(id: string, props: Record<string, unknown> = {}): BackupNode {
  return {
    id,
    type: "concept",
    properties: props,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
}

function makeEdge(id: string, src: string, tgt: string): BackupEdge {
  return {
    id,
    sourceId: src,
    targetId: tgt,
    type: "relates_to",
    properties: {},
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
}

function makeUser(id: string, name = id): BackupUser {
  return { id, email: `${id}@test.com`, name, role: "member", createdAt: "2024-01-01T00:00:00Z" };
}

function makeMetadata(id = "bk"): BackupMetadata {
  return {
    id,
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
  };
}

function makePayload(
  nodes: BackupNode[],
  edges: BackupEdge[],
  users: BackupUser[],
  id = "bk"
): BackupPayload {
  return { metadata: makeMetadata(id), nodes, edges, users };
}

describe("BackupDiff", () => {
  const differ = new BackupDiff();

  describe("compare()", () => {
    it("detects no changes between identical payloads", () => {
      const nodes = [makeNode("n1"), makeNode("n2")];
      const edges = [makeEdge("e1", "n1", "n2")];
      const base = makePayload(nodes, edges, []);
      const current = makePayload([...nodes], [...edges], []);

      const diff = differ.compare(base, current);
      expect(diff.summary.totalChanges).toBe(0);
    });

    it("detects added nodes", () => {
      const base = makePayload([makeNode("n1")], [], []);
      const current = makePayload([makeNode("n1"), makeNode("n2")], [], []);

      const diff = differ.compare(base, current);
      expect(diff.summary.nodesAdded).toBe(1);
      expect(diff.nodes.find((d) => d.id === "n2")?.type).toBe("added");
    });

    it("detects removed nodes", () => {
      const base = makePayload([makeNode("n1"), makeNode("n2")], [], []);
      const current = makePayload([makeNode("n1")], [], []);

      const diff = differ.compare(base, current);
      expect(diff.summary.nodesRemoved).toBe(1);
      expect(diff.nodes.find((d) => d.id === "n2")?.type).toBe("removed");
    });

    it("detects modified nodes", () => {
      const base = makePayload([makeNode("n1", { title: "Old" })], [], []);
      const current = makePayload([makeNode("n1", { title: "New" })], [], []);

      const diff = differ.compare(base, current);
      expect(diff.summary.nodesModified).toBe(1);
      const nodeDiff = diff.nodes.find((d) => d.id === "n1");
      expect(nodeDiff?.type).toBe("modified");
      expect(nodeDiff?.changedFields).toContain("title");
    });

    it("detects added edges", () => {
      const nodes = [makeNode("n1"), makeNode("n2")];
      const base = makePayload(nodes, [], []);
      const current = makePayload(nodes, [makeEdge("e1", "n1", "n2")], []);

      const diff = differ.compare(base, current);
      expect(diff.summary.edgesAdded).toBe(1);
    });

    it("detects removed edges", () => {
      const nodes = [makeNode("n1"), makeNode("n2")];
      const base = makePayload(nodes, [makeEdge("e1", "n1", "n2")], []);
      const current = makePayload(nodes, [], []);

      const diff = differ.compare(base, current);
      expect(diff.summary.edgesRemoved).toBe(1);
    });

    it("detects added and removed users", () => {
      const base = makePayload([], [], [makeUser("u1")]);
      const current = makePayload([], [], [makeUser("u2")]);

      const diff = differ.compare(base, current);
      expect(diff.summary.usersAdded).toBe(1);
      expect(diff.summary.usersRemoved).toBe(1);
    });

    it("detects modified users", () => {
      const base = makePayload([], [], [makeUser("u1", "Alice")]);
      const current = makePayload([], [], [makeUser("u1", "Alice B")]);

      const diff = differ.compare(base, current);
      expect(diff.summary.usersModified).toBe(1);
    });
  });

  describe("generateIncremental()", () => {
    it("generates incremental with only changes", () => {
      const base = makePayload([makeNode("n1")], [], [], "bk1");
      const current = makePayload([makeNode("n1"), makeNode("n2")], [], [], "bk2");

      const incremental = differ.generateIncremental(base, current);

      expect(incremental.baseBackupId).toBe("bk1");
      expect(incremental.addedNodes).toHaveLength(1);
      expect(incremental.addedNodes[0]!.id).toBe("n2");
      expect(incremental.removedNodeIds).toHaveLength(0);
      expect(incremental.modifiedNodes).toHaveLength(0);
    });

    it("records removed nodes in incremental", () => {
      const base = makePayload([makeNode("n1"), makeNode("n2")], [], [], "bk1");
      const current = makePayload([makeNode("n1")], [], [], "bk2");

      const incremental = differ.generateIncremental(base, current);

      expect(incremental.removedNodeIds).toContain("n2");
    });

    it("records modified nodes in incremental", () => {
      const base = makePayload([makeNode("n1", { title: "Old" })], [], [], "bk1");
      const current = makePayload([makeNode("n1", { title: "New" })], [], [], "bk2");

      const incremental = differ.generateIncremental(base, current);

      expect(incremental.modifiedNodes).toHaveLength(1);
      expect(incremental.modifiedNodes[0]!.properties.title).toBe("New");
    });
  });

  describe("applyIncremental()", () => {
    it("applies added nodes", () => {
      const base = makePayload([makeNode("n1")], [], [], "bk1");
      const current = makePayload([makeNode("n1"), makeNode("n2")], [], [], "bk2");

      const incremental = differ.generateIncremental(base, current);
      const restored = differ.applyIncremental(base, incremental);

      expect(restored.nodes).toHaveLength(2);
      expect(restored.nodes.map((n) => n.id)).toContain("n2");
    });

    it("applies removed nodes", () => {
      const base = makePayload([makeNode("n1"), makeNode("n2")], [], [], "bk1");
      const current = makePayload([makeNode("n1")], [], [], "bk2");

      const incremental = differ.generateIncremental(base, current);
      const restored = differ.applyIncremental(base, incremental);

      expect(restored.nodes).toHaveLength(1);
      expect(restored.nodes[0]!.id).toBe("n1");
    });

    it("applies modified nodes", () => {
      const base = makePayload([makeNode("n1", { title: "Old" })], [], [], "bk1");
      const current = makePayload([makeNode("n1", { title: "New" })], [], [], "bk2");

      const incremental = differ.generateIncremental(base, current);
      const restored = differ.applyIncremental(base, incremental);

      expect(restored.nodes[0]!.properties.title).toBe("New");
    });

    it("round-trips through incremental correctly", () => {
      const base = makePayload(
        [makeNode("n1", { x: 1 }), makeNode("n2", { x: 2 })],
        [makeEdge("e1", "n1", "n2")],
        [makeUser("u1")],
        "bk1"
      );
      const current = makePayload(
        [makeNode("n1", { x: 99 }), makeNode("n3", { x: 3 })],
        [makeEdge("e2", "n1", "n3")],
        [makeUser("u2")],
        "bk2"
      );

      const incremental = differ.generateIncremental(base, current);
      const restored = differ.applyIncremental(base, incremental);

      const restoredIds = restored.nodes.map((n) => n.id).sort();
      const currentIds = current.nodes.map((n) => n.id).sort();
      expect(restoredIds).toEqual(currentIds);
    });
  });

  describe("mergeIncrementals()", () => {
    it("throws when given empty list", () => {
      expect(() => differ.mergeIncrementals([])).toThrow();
    });

    it("merges two incrementals into one", () => {
      const base = makePayload([makeNode("n1")], [], [], "bk1");
      const v2 = makePayload([makeNode("n1"), makeNode("n2")], [], [], "bk2");
      const v3 = makePayload([makeNode("n1"), makeNode("n2"), makeNode("n3")], [], [], "bk3");

      const inc1 = differ.generateIncremental(base, v2);
      const inc2 = differ.generateIncremental(v2, v3);

      const merged = differ.mergeIncrementals([inc1, inc2]);

      expect(merged.addedNodes.map((n) => n.id).sort()).toEqual(["n2", "n3"]);
      expect(merged.baseBackupId).toBe(inc1.baseBackupId);
    });

    it("collapses add-then-remove into no change", () => {
      const base = makePayload([makeNode("n1")], [], [], "bk1");
      const v2 = makePayload([makeNode("n1"), makeNode("n2")], [], [], "bk2");
      const v3 = makePayload([makeNode("n1")], [], [], "bk3"); // n2 removed

      const inc1 = differ.generateIncremental(base, v2);
      const inc2 = differ.generateIncremental(v2, v3);

      const merged = differ.mergeIncrementals([inc1, inc2]);

      expect(merged.addedNodes.map((n) => n.id)).not.toContain("n2");
      expect(merged.removedNodeIds).not.toContain("n2");
    });
  });
});
