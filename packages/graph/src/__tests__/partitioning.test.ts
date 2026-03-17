import { describe, it, expect } from "vitest";
import { Graph } from "../graph.js";
import {
  kernighanLin,
  multiWayPartition,
  computeCutSize,
  computeBalance,
  partitionQuality,
} from "../algorithms/graph-partitioning.js";

function addEdge(g: Graph, src: string, tgt: string, weight = 1): void {
  g.addEdge({ id: `${src}-${tgt}`, source: src, target: tgt, type: "edge", weight });
}

function makeClusteredGraph(): Graph {
  // Two dense clusters with a bridge
  const g = new Graph();
  for (const id of ["A","B","C","D","E","F","G","H"]) g.addNode({ id, type: "node" });
  // Cluster 1: A-B-C-D fully connected
  for (const u of ["A","B","C","D"]) {
    for (const v of ["A","B","C","D"]) {
      if (u !== v) addEdge(g, u, v, 10);
    }
  }
  // Cluster 2: E-F-G-H fully connected
  for (const u of ["E","F","G","H"]) {
    for (const v of ["E","F","G","H"]) {
      if (u !== v) addEdge(g, u, v, 10);
    }
  }
  // Bridge between clusters (weak)
  addEdge(g, "D", "E", 1);
  addEdge(g, "E", "D", 1);
  return g;
}

describe("Kernighan-Lin Bisection", () => {
  it("produces two partitions", () => {
    const g = makeClusteredGraph();
    const result = kernighanLin(g);
    expect(result.partitions.size).toBe(2);
  });

  it("every node is assigned to a partition", () => {
    const g = makeClusteredGraph();
    const result = kernighanLin(g);
    const totalAssigned = Array.from(result.partitions.values())
      .reduce((s, p) => s + p.size, 0);
    expect(totalAssigned).toBe(g.getAllNodes().length);
  });

  it("cut size is non-negative", () => {
    const g = makeClusteredGraph();
    const result = kernighanLin(g);
    expect(result.cutSize).toBeGreaterThanOrEqual(0);
  });

  it("partitions natural clusters better than random", () => {
    const g = makeClusteredGraph();
    const result = kernighanLin(g);
    // The cut through the bridge should be small relative to intra-cluster edges
    expect(result.cutSize).toBeLessThanOrEqual(50);
  });

  it("balance is close to 1 for balanced split", () => {
    const g = makeClusteredGraph();
    const result = kernighanLin(g);
    // Balance should be reasonable (not wildly uneven)
    expect(result.balance).toBeLessThanOrEqual(2);
    expect(result.balance).toBeGreaterThanOrEqual(0.5);
  });

  it("empty graph produces empty partitions", () => {
    const g = new Graph();
    const result = kernighanLin(g);
    expect(result.cutSize).toBe(0);
  });

  it("nodePartition is consistent with partitions", () => {
    const g = makeClusteredGraph();
    const { partitions, nodePartition } = kernighanLin(g);
    for (const [node, partId] of nodePartition) {
      expect(partitions.get(partId)?.has(node)).toBe(true);
    }
  });
});

describe("Multi-way Partitioning", () => {
  it("produces correct number of partitions", () => {
    const g = makeClusteredGraph();
    const result = multiWayPartition(g, { numPartitions: 4 });
    expect(result.partitions.size).toBe(4);
  });

  it("all nodes assigned exactly once", () => {
    const g = makeClusteredGraph();
    const result = multiWayPartition(g, { numPartitions: 3 });
    const seen = new Set<string>();
    for (const part of result.partitions.values()) {
      for (const node of part) {
        expect(seen.has(node)).toBe(false);
        seen.add(node);
      }
    }
    expect(seen.size).toBe(g.getAllNodes().length);
  });

  it("single partition contains all nodes", () => {
    const g = makeClusteredGraph();
    const result = multiWayPartition(g, { numPartitions: 1 });
    expect(result.partitions.get(0)?.size).toBe(g.getAllNodes().length);
    expect(result.cutSize).toBe(0);
  });

  it("cut size is computed correctly", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B", 5); addEdge(g, "C", "D", 3);
    addEdge(g, "B", "C", 1); // the bridge

    const nodePartition = new Map([["A",0],["B",0],["C",1],["D",1]]);
    const cut = computeCutSize(g, nodePartition);
    expect(cut).toBe(1); // only B-C edge crosses
  });

  it("nodePartition is consistent with partitions", () => {
    const g = makeClusteredGraph();
    const result = multiWayPartition(g, { numPartitions: 2 });
    for (const [node, partId] of result.nodePartition) {
      expect(result.partitions.get(partId)?.has(node)).toBe(true);
    }
  });
});

describe("computeBalance", () => {
  it("perfectly balanced partitions have balance = 1", () => {
    const partitions = new Map([
      [0, new Set(["A","B"])],
      [1, new Set(["C","D"])],
    ]);
    expect(computeBalance(partitions, 4)).toBe(1);
  });

  it("completely imbalanced partitions have balance > 1", () => {
    const partitions = new Map([
      [0, new Set(["A","B","C"])],
      [1, new Set(["D"])],
    ]);
    expect(computeBalance(partitions, 4)).toBeGreaterThan(1);
  });
});

describe("Partition Quality Metrics", () => {
  it("computes all metrics without error", () => {
    const g = makeClusteredGraph();
    const partition = kernighanLin(g);
    const quality = partitionQuality(g, partition);
    expect(quality.cutSize).toBeGreaterThanOrEqual(0);
    expect(quality.balance).toBeGreaterThan(0);
    expect(typeof quality.modularity).toBe("number");
    expect(quality.conductance).toBeGreaterThanOrEqual(0);
  });

  it("perfect partition of clustered graph has low conductance", () => {
    const g = makeClusteredGraph();
    // Force the correct partition manually
    const nodePartition = new Map([
      ["A",0],["B",0],["C",0],["D",0],
      ["E",1],["F",1],["G",1],["H",1],
    ]);
    const partitions = new Map([
      [0, new Set(["A","B","C","D"])],
      [1, new Set(["E","F","G","H"])],
    ]);
    const cut = computeCutSize(g, nodePartition);
    const bal = computeBalance(partitions, 8);
    const partition = { partitions, nodePartition, cutSize: cut, balance: bal };
    const quality = partitionQuality(g, partition);
    // With bridge weight=2 total, conductance should be very small
    expect(quality.conductance).toBeLessThan(0.2);
  });
});
