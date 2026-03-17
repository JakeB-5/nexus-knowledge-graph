import { describe, it, expect, beforeEach } from "vitest";
import { Graph } from "../graph.js";
import { bfs, dfs, shortestPath } from "../traversal.js";

describe("Traversal", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();
    // Create a simple directed graph:
    // A -> B -> D
    // A -> C -> D
    // D -> E
    graph.addNode({ id: "A", type: "document" });
    graph.addNode({ id: "B", type: "concept" });
    graph.addNode({ id: "C", type: "concept" });
    graph.addNode({ id: "D", type: "tag" });
    graph.addNode({ id: "E", type: "document" });

    graph.addEdge({ id: "e1", source: "A", target: "B", type: "references", weight: 1 });
    graph.addEdge({ id: "e2", source: "A", target: "C", type: "references", weight: 1 });
    graph.addEdge({ id: "e3", source: "B", target: "D", type: "references", weight: 1 });
    graph.addEdge({ id: "e4", source: "C", target: "D", type: "references", weight: 1 });
    graph.addEdge({ id: "e5", source: "D", target: "E", type: "references", weight: 1 });
  });

  describe("bfs", () => {
    it("should traverse all reachable nodes", () => {
      const result = bfs(graph, "A");
      expect(result.visited).toContain("A");
      expect(result.visited).toContain("B");
      expect(result.visited).toContain("C");
      expect(result.visited).toContain("D");
      expect(result.visited).toContain("E");
    });

    it("should respect maxDepth", () => {
      const result = bfs(graph, "A", { maxDepth: 1 });
      expect(result.visited).toContain("A");
      expect(result.visited).toContain("B");
      expect(result.visited).toContain("C");
      expect(result.visited).not.toContain("D");
    });

    it("should return empty for non-existent start node", () => {
      const result = bfs(graph, "MISSING");
      expect(result.visited).toHaveLength(0);
    });

    it("should track correct depths", () => {
      const result = bfs(graph, "A");
      expect(result.depth.get("A")).toBe(0);
      expect(result.depth.get("B")).toBe(1);
      expect(result.depth.get("D")).toBe(2);
      expect(result.depth.get("E")).toBe(3);
    });
  });

  describe("dfs", () => {
    it("should traverse all reachable nodes", () => {
      const result = dfs(graph, "A");
      expect(result.visited).toHaveLength(5);
    });

    it("should respect maxDepth", () => {
      const result = dfs(graph, "A", { maxDepth: 1 });
      expect(result.visited).toContain("A");
      expect(result.visited.length).toBeGreaterThanOrEqual(2);
      expect(result.visited.length).toBeLessThanOrEqual(3);
    });
  });

  describe("shortestPath", () => {
    it("should find shortest path between nodes", () => {
      const path = shortestPath(graph, "A", "E");
      expect(path).not.toBeNull();
      expect(path![0]).toBe("A");
      expect(path![path!.length - 1]).toBe("E");
      // Shortest path is A -> B -> D -> E or A -> C -> D -> E (length 4)
      expect(path!.length).toBe(4);
    });

    it("should return null for unreachable nodes", () => {
      const path = shortestPath(graph, "E", "A");
      expect(path).toBeNull();
    });

    it("should return single node path for same source and target", () => {
      const path = shortestPath(graph, "A", "A");
      expect(path).toEqual(["A"]);
    });
  });
});
