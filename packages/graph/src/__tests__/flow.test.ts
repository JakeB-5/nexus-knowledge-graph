import { describe, it, expect } from "vitest";
import { Graph } from "../graph.js";
import { maxFlow, flowDecomposition, totalFlowFrom } from "../algorithms/max-flow.js";

function makeFlowGraph(): Graph {
  const g = new Graph();
  for (const id of ["S", "A", "B", "C", "D", "T"]) {
    g.addNode({ id, type: "node" });
  }
  return g;
}

function addEdge(g: Graph, src: string, tgt: string, weight: number): void {
  g.addEdge({ id: `${src}-${tgt}`, source: src, target: tgt, type: "edge", weight });
}

describe("Max Flow (Edmonds-Karp)", () => {
  it("simple path: max flow equals bottleneck capacity", () => {
    const g = makeFlowGraph();
    addEdge(g, "S", "A", 5);
    addEdge(g, "A", "T", 3);
    const { maxFlow: flow } = maxFlow(g, "S", "T");
    expect(flow).toBe(3);
  });

  it("two parallel paths: max flow is sum of capacities", () => {
    const g = new Graph();
    for (const id of ["S", "A", "B", "T"]) g.addNode({ id, type: "node" });
    addEdge(g, "S", "A", 5);
    addEdge(g, "S", "B", 3);
    addEdge(g, "A", "T", 5);
    addEdge(g, "B", "T", 3);
    const { maxFlow: flow } = maxFlow(g, "S", "T");
    expect(flow).toBe(8);
  });

  it("classic max flow network", () => {
    // Standard example: max flow = 23
    const g = new Graph();
    for (const id of ["S","A","B","C","D","T"]) g.addNode({ id, type: "node" });
    addEdge(g, "S", "A", 16);
    addEdge(g, "S", "C", 13);
    addEdge(g, "A", "B", 12);
    addEdge(g, "C", "A", 4);
    addEdge(g, "B", "C", 9);
    addEdge(g, "C", "D", 14);
    addEdge(g, "B", "T", 20);
    addEdge(g, "D", "B", 7);
    addEdge(g, "D", "T", 4);
    const { maxFlow: flow } = maxFlow(g, "S", "T");
    expect(flow).toBe(23);
  });

  it("no path between source and sink: flow is 0", () => {
    const g = new Graph();
    for (const id of ["S","A","T"]) g.addNode({ id, type: "node" });
    addEdge(g, "S", "A", 10);
    // No edge to T
    const { maxFlow: flow } = maxFlow(g, "S", "T");
    expect(flow).toBe(0);
  });

  it("source equals sink: flow is 0", () => {
    const g = new Graph();
    g.addNode({ id: "S", type: "node" });
    const { maxFlow: flow } = maxFlow(g, "S", "S");
    expect(flow).toBe(0);
  });

  it("min-cut cuts the right edges", () => {
    const g = new Graph();
    for (const id of ["S","A","B","T"]) g.addNode({ id, type: "node" });
    addEdge(g, "S", "A", 10);
    addEdge(g, "S", "B", 5);
    addEdge(g, "A", "T", 3);
    addEdge(g, "B", "T", 5);
    const { maxFlow: flow, minCut } = maxFlow(g, "S", "T");
    expect(flow).toBe(8);
    expect(minCut.sourceSet.has("S")).toBe(true);
    expect(minCut.sinkSet.has("T")).toBe(true);
    // Total cut capacity equals max flow
    const cutCapacity = minCut.cutEdges.reduce((s, e) => s + e.capacity, 0);
    expect(cutCapacity).toBeGreaterThanOrEqual(flow);
  });

  it("flow graph respects edge capacities", () => {
    const g = new Graph();
    for (const id of ["S","A","T"]) g.addNode({ id, type: "node" });
    addEdge(g, "S", "A", 5);
    addEdge(g, "A", "T", 5);
    const { flowGraph, maxFlow: flow } = maxFlow(g, "S", "T");
    expect(flow).toBe(5);
    expect(flowGraph.get("S")?.get("A")).toBe(5);
    expect(flowGraph.get("A")?.get("T")).toBe(5);
  });

  it("flow decomposition produces valid paths", () => {
    const g = new Graph();
    for (const id of ["S","A","B","T"]) g.addNode({ id, type: "node" });
    addEdge(g, "S", "A", 4);
    addEdge(g, "S", "B", 3);
    addEdge(g, "A", "T", 4);
    addEdge(g, "B", "T", 3);
    const { flowGraph, maxFlow: flow } = maxFlow(g, "S", "T");
    const paths = flowDecomposition("S", "T", flowGraph);
    const totalDecomposed = paths.reduce((s, p) => s + p.flow, 0);
    expect(Math.abs(totalDecomposed - flow)).toBeLessThan(1e-9);
    for (const fp of paths) {
      expect(fp.path[0]).toBe("S");
      expect(fp.path[fp.path.length - 1]).toBe("T");
      expect(fp.flow).toBeGreaterThan(0);
    }
  });

  it("totalFlowFrom matches max flow value", () => {
    const g = new Graph();
    for (const id of ["S","A","T"]) g.addNode({ id, type: "node" });
    addEdge(g, "S", "A", 7);
    addEdge(g, "A", "T", 7);
    const { flowGraph, maxFlow: flow } = maxFlow(g, "S", "T");
    expect(totalFlowFrom("S", flowGraph)).toBe(flow);
  });
});
