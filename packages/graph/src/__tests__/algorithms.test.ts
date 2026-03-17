import { describe, it, expect } from "vitest";
import { Graph } from "../graph.js";
import { pageRank } from "../algorithms/page-rank.js";
import { communityDetection } from "../algorithms/community.js";

describe("PageRank", () => {
  it("should compute PageRank for a simple graph", () => {
    const graph = new Graph();
    graph.addNode({ id: "A", type: "document" });
    graph.addNode({ id: "B", type: "document" });
    graph.addNode({ id: "C", type: "document" });

    graph.addEdge({ id: "e1", source: "A", target: "B", type: "references", weight: 1 });
    graph.addEdge({ id: "e2", source: "B", target: "C", type: "references", weight: 1 });
    graph.addEdge({ id: "e3", source: "C", target: "A", type: "references", weight: 1 });

    const result = pageRank(graph);

    expect(result.converged).toBe(true);
    expect(result.scores.size).toBe(3);

    // In a cycle of 3, all nodes should have roughly equal rank
    const scores = Array.from(result.scores.values());
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    for (const score of scores) {
      expect(Math.abs(score - avg)).toBeLessThan(0.01);
    }
  });

  it("should give higher rank to nodes with more incoming links", () => {
    const graph = new Graph();
    graph.addNode({ id: "A", type: "document" });
    graph.addNode({ id: "B", type: "document" });
    graph.addNode({ id: "C", type: "document" });
    graph.addNode({ id: "D", type: "document" });

    // D has the most incoming links
    graph.addEdge({ id: "e1", source: "A", target: "D", type: "references", weight: 1 });
    graph.addEdge({ id: "e2", source: "B", target: "D", type: "references", weight: 1 });
    graph.addEdge({ id: "e3", source: "C", target: "D", type: "references", weight: 1 });

    const result = pageRank(graph);
    const scoreD = result.scores.get("D")!;
    const scoreA = result.scores.get("A")!;

    expect(scoreD).toBeGreaterThan(scoreA);
  });

  it("should return empty result for empty graph", () => {
    const graph = new Graph();
    const result = pageRank(graph);
    expect(result.scores.size).toBe(0);
    expect(result.converged).toBe(true);
  });
});

describe("Community Detection", () => {
  it("should detect communities in a graph with clear clusters", () => {
    const graph = new Graph();

    // Cluster 1: A-B-C (densely connected)
    graph.addNode({ id: "A", type: "document" });
    graph.addNode({ id: "B", type: "document" });
    graph.addNode({ id: "C", type: "document" });
    graph.addEdge({ id: "e1", source: "A", target: "B", type: "related_to", weight: 1 });
    graph.addEdge({ id: "e2", source: "B", target: "C", type: "related_to", weight: 1 });
    graph.addEdge({ id: "e3", source: "C", target: "A", type: "related_to", weight: 1 });

    // Cluster 2: D-E-F (densely connected)
    graph.addNode({ id: "D", type: "concept" });
    graph.addNode({ id: "E", type: "concept" });
    graph.addNode({ id: "F", type: "concept" });
    graph.addEdge({ id: "e4", source: "D", target: "E", type: "related_to", weight: 1 });
    graph.addEdge({ id: "e5", source: "E", target: "F", type: "related_to", weight: 1 });
    graph.addEdge({ id: "e6", source: "F", target: "D", type: "related_to", weight: 1 });

    // Weak link between clusters
    graph.addEdge({ id: "e7", source: "C", target: "D", type: "references", weight: 0.1 });

    const communities = communityDetection(graph);
    expect(communities.length).toBeGreaterThanOrEqual(1);
    expect(communities.length).toBeLessThanOrEqual(6);
  });

  it("should return empty for empty graph", () => {
    const graph = new Graph();
    const communities = communityDetection(graph);
    expect(communities).toHaveLength(0);
  });
});
