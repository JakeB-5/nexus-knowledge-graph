import { describe, it, expect, beforeEach } from "vitest";
import { Graph } from "../graph.js";

describe("Graph", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();
  });

  describe("nodes", () => {
    it("should add and retrieve nodes", () => {
      graph.addNode({ id: "1", type: "document" });
      expect(graph.getNode("1")).toEqual({ id: "1", type: "document" });
      expect(graph.nodeCount).toBe(1);
    });

    it("should remove nodes and connected edges", () => {
      graph.addNode({ id: "1", type: "document" });
      graph.addNode({ id: "2", type: "concept" });
      graph.addEdge({ id: "e1", source: "1", target: "2", type: "references", weight: 1 });

      graph.removeNode("1");
      expect(graph.hasNode("1")).toBe(false);
      expect(graph.edgeCount).toBe(0);
    });

    it("should return false when removing non-existent node", () => {
      expect(graph.removeNode("nonexistent")).toBe(false);
    });
  });

  describe("edges", () => {
    beforeEach(() => {
      graph.addNode({ id: "a", type: "document" });
      graph.addNode({ id: "b", type: "concept" });
      graph.addNode({ id: "c", type: "tag" });
    });

    it("should add and retrieve edges", () => {
      graph.addEdge({ id: "e1", source: "a", target: "b", type: "references", weight: 0.8 });
      expect(graph.getEdge("e1")).toBeDefined();
      expect(graph.edgeCount).toBe(1);
    });

    it("should throw when adding edge with missing node", () => {
      expect(() =>
        graph.addEdge({ id: "e1", source: "a", target: "missing", type: "references", weight: 1 }),
      ).toThrow("Target node missing not found");
    });

    it("should find edges between nodes", () => {
      graph.addEdge({ id: "e1", source: "a", target: "b", type: "references", weight: 1 });
      graph.addEdge({ id: "e2", source: "a", target: "b", type: "related_to", weight: 0.5 });

      const edges = graph.getEdgesBetween("a", "b");
      expect(edges).toHaveLength(2);
    });

    it("should remove edges correctly", () => {
      graph.addEdge({ id: "e1", source: "a", target: "b", type: "references", weight: 1 });
      expect(graph.removeEdge("e1")).toBe(true);
      expect(graph.edgeCount).toBe(0);
    });
  });

  describe("neighbors", () => {
    beforeEach(() => {
      graph.addNode({ id: "a", type: "document" });
      graph.addNode({ id: "b", type: "concept" });
      graph.addNode({ id: "c", type: "tag" });
      graph.addEdge({ id: "e1", source: "a", target: "b", type: "references", weight: 1 });
      graph.addEdge({ id: "e2", source: "c", target: "a", type: "tagged_with", weight: 1 });
    });

    it("should return outgoing neighbors", () => {
      expect(graph.getNeighbors("a", "outgoing")).toEqual(["b"]);
    });

    it("should return incoming neighbors", () => {
      expect(graph.getNeighbors("a", "incoming")).toEqual(["c"]);
    });

    it("should return all neighbors with both direction", () => {
      const neighbors = graph.getNeighbors("a", "both");
      expect(neighbors).toContain("b");
      expect(neighbors).toContain("c");
    });
  });

  describe("serialization", () => {
    it("should serialize and deserialize", () => {
      graph.addNode({ id: "1", type: "document" });
      graph.addNode({ id: "2", type: "concept" });
      graph.addEdge({ id: "e1", source: "1", target: "2", type: "references", weight: 1 });

      const json = graph.toJSON();
      const restored = Graph.fromJSON(json);

      expect(restored.nodeCount).toBe(2);
      expect(restored.edgeCount).toBe(1);
      expect(restored.getNode("1")).toEqual({ id: "1", type: "document" });
    });
  });
});
