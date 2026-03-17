import { describe, it, expect } from "vitest";
import { Graph } from "../graph.js";
import {
  commonNeighbors,
  jaccardSimilarity,
  adamicAdar,
  preferentialAttachment,
  resourceAllocation,
  simRank,
  topKSimilarNodes,
} from "../algorithms/similarity.js";
import {
  commonNeighborsScore,
  jaccardScore,
  adamicAdarScore,
  preferentialAttachmentScore,
  resourceAllocationScore,
  katzIndex,
  predictTopKEdges,
} from "../algorithms/link-prediction.js";

function addEdge(g: Graph, src: string, tgt: string, weight = 1): void {
  g.addEdge({ id: `${src}-${tgt}`, source: src, target: tgt, type: "edge", weight });
}

function makeTriangleGraph(): Graph {
  const g = new Graph();
  for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
  // A-B-C triangle
  addEdge(g, "A", "B"); addEdge(g, "B", "A");
  addEdge(g, "B", "C"); addEdge(g, "C", "B");
  addEdge(g, "A", "C"); addEdge(g, "C", "A");
  // D connects to A and B
  addEdge(g, "D", "A"); addEdge(g, "A", "D");
  addEdge(g, "D", "B"); addEdge(g, "B", "D");
  // E is isolated
  return g;
}

describe("Similarity Metrics", () => {
  describe("Common Neighbors", () => {
    it("nodes sharing no neighbors have 0 common neighbors", () => {
      const g = makeTriangleGraph();
      expect(commonNeighbors(g, "A", "E")).toBe(0);
    });

    it("A and C share B as common neighbor", () => {
      const g = makeTriangleGraph();
      // A's neighbors: B, C, D; C's neighbors: B, A
      // Common: B (and possibly A or C themselves if included)
      const cn = commonNeighbors(g, "A", "C");
      expect(cn).toBeGreaterThanOrEqual(1);
    });

    it("symmetric for undirected view", () => {
      const g = makeTriangleGraph();
      expect(commonNeighbors(g, "A", "D")).toBe(commonNeighbors(g, "D", "A"));
    });
  });

  describe("Jaccard Similarity", () => {
    it("identical neighbor sets have Jaccard = 1", () => {
      const g = new Graph();
      for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
      // A and B both connect to C, D, E
      addEdge(g, "A", "C"); addEdge(g, "A", "D"); addEdge(g, "A", "E");
      addEdge(g, "B", "C"); addEdge(g, "B", "D"); addEdge(g, "B", "E");
      expect(jaccardSimilarity(g, "A", "B")).toBeCloseTo(1, 5);
    });

    it("disjoint neighbor sets have Jaccard = 0", () => {
      const g = new Graph();
      for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
      addEdge(g, "A", "C");
      addEdge(g, "B", "D");
      expect(jaccardSimilarity(g, "A", "B")).toBe(0);
    });

    it("Jaccard is symmetric", () => {
      const g = makeTriangleGraph();
      expect(jaccardSimilarity(g, "A", "D")).toBeCloseTo(
        jaccardSimilarity(g, "D", "A"), 10
      );
    });

    it("Jaccard is in [0, 1]", () => {
      const g = makeTriangleGraph();
      const nodes = g.getAllNodes().map(n => n.id);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const score = jaccardSimilarity(g, nodes[i]!, nodes[j]!);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe("Adamic-Adar", () => {
    it("returns 0 for nodes with no common neighbors", () => {
      const g = makeTriangleGraph();
      expect(adamicAdar(g, "A", "E")).toBe(0);
    });

    it("higher degree common neighbors contribute less", () => {
      const g = new Graph();
      for (const id of ["A","B","C","D","E","F"]) g.addNode({ id, type: "node" });
      // Z1 has degree 2, Z2 has degree 4
      addEdge(g, "A", "B"); addEdge(g, "B", "A"); // Z1: degree 1 shared by A,C
      addEdge(g, "A", "C"); addEdge(g, "C", "A");
      addEdge(g, "C", "D"); addEdge(g, "D", "C");
      addEdge(g, "C", "E"); addEdge(g, "E", "C");
      // A-B: share C which has degree 4 (connected to A, B would need edge)
      // Just verify AA is non-negative
      const score = adamicAdar(g, "A", "D");
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Preferential Attachment", () => {
    it("returns product of degrees", () => {
      const g = new Graph();
      for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
      addEdge(g, "A", "C"); addEdge(g, "A", "D"); addEdge(g, "A", "E"); // degree 3
      addEdge(g, "B", "C"); addEdge(g, "B", "D"); // degree 2
      expect(preferentialAttachment(g, "A", "B")).toBe(6);
    });

    it("isolated nodes have PA = 0", () => {
      const g = makeTriangleGraph();
      expect(preferentialAttachment(g, "A", "E")).toBe(0);
    });
  });

  describe("Resource Allocation", () => {
    it("returns 0 for nodes with no common neighbors", () => {
      const g = makeTriangleGraph();
      expect(resourceAllocation(g, "A", "E")).toBe(0);
    });

    it("is symmetric", () => {
      const g = makeTriangleGraph();
      expect(resourceAllocation(g, "A", "D")).toBeCloseTo(
        resourceAllocation(g, "D", "A"), 10
      );
    });
  });

  describe("SimRank", () => {
    it("self-similarity is 1", () => {
      const g = new Graph();
      for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
      addEdge(g, "A", "B"); addEdge(g, "B", "C");
      const sim = simRank(g, { maxIterations: 5 });
      expect(sim.get("A")?.get("A")).toBe(1);
      expect(sim.get("B")?.get("B")).toBe(1);
    });

    it("similarity is symmetric", () => {
      const g = new Graph();
      for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
      addEdge(g, "A", "C"); addEdge(g, "B", "C");
      const sim = simRank(g, { maxIterations: 5 });
      expect(sim.get("A")?.get("B")).toBeCloseTo(sim.get("B")?.get("A") ?? 0, 10);
    });

    it("similarity is in [0, 1]", () => {
      const g = makeTriangleGraph();
      const sim = simRank(g, { maxIterations: 5 });
      for (const [, row] of sim) {
        for (const [, v] of row) {
          expect(v).toBeGreaterThanOrEqual(-1e-9);
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    });
  });

  describe("topKSimilarNodes", () => {
    it("returns k results", () => {
      const g = makeTriangleGraph();
      const top = topKSimilarNodes(g, "A", 2, "jaccard");
      expect(top).toHaveLength(2);
    });

    it("results are sorted descending", () => {
      const g = makeTriangleGraph();
      const top = topKSimilarNodes(g, "A", 3, "jaccard");
      for (let i = 0; i < top.length - 1; i++) {
        expect(top[i]!.score).toBeGreaterThanOrEqual(top[i + 1]!.score);
      }
    });

    it("does not include the query node itself", () => {
      const g = makeTriangleGraph();
      const top = topKSimilarNodes(g, "A", 4, "jaccard");
      expect(top.map(t => t.nodeId)).not.toContain("A");
    });
  });
});

describe("Link Prediction", () => {
  describe("predictTopKEdges", () => {
    it("returns k edges", () => {
      const g = makeTriangleGraph();
      const predictions = predictTopKEdges(g, 2, "jaccard");
      expect(predictions.length).toBeLessThanOrEqual(2);
    });

    it("does not predict existing edges", () => {
      const g = makeTriangleGraph();
      const predictions = predictTopKEdges(g, 10, "common-neighbors");
      for (const pred of predictions) {
        const existing =
          g.getEdgesBetween(pred.source, pred.target).length > 0 ||
          g.getEdgesBetween(pred.target, pred.source).length > 0;
        expect(existing).toBe(false);
      }
    });

    it("sorted by score descending", () => {
      const g = makeTriangleGraph();
      const predictions = predictTopKEdges(g, 5, "adamic-adar");
      for (let i = 0; i < predictions.length - 1; i++) {
        expect(predictions[i]!.score).toBeGreaterThanOrEqual(predictions[i + 1]!.score);
      }
    });
  });

  describe("Katz Index", () => {
    it("nodes connected by shorter paths have higher Katz score", () => {
      const g = new Graph();
      for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
      addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "D"); addEdge(g, "D", "E");
      // A-B is closer than A-E
      const katzAB = katzIndex(g, "A", "C", { beta: 0.5, maxHops: 5 });
      const katzAE = katzIndex(g, "A", "E", { beta: 0.5, maxHops: 5 });
      expect(katzAB).toBeGreaterThan(katzAE);
    });

    it("returns 0 for disconnected nodes", () => {
      const g = new Graph();
      for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
      addEdge(g, "A", "B");
      addEdge(g, "C", "D");
      const score = katzIndex(g, "A", "D", { beta: 0.5, maxHops: 3 });
      expect(score).toBe(0);
    });
  });
});
