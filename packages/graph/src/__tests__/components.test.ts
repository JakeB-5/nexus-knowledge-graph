import { describe, it, expect } from "vitest";
import { Graph } from "../graph.js";
import {
  stronglyConnectedComponents,
  weaklyConnectedComponents,
  largestSCC,
  largestWCC,
  isStronglyConnected,
  isWeaklyConnected,
} from "../algorithms/connected-components.js";

function addEdge(g: Graph, src: string, tgt: string, weight = 1): void {
  g.addEdge({ id: `${src}-${tgt}`, source: src, target: tgt, type: "edge", weight });
}

describe("Strongly Connected Components (Tarjan's)", () => {
  it("single node is its own SCC", () => {
    const g = new Graph();
    g.addNode({ id: "A", type: "node" });
    const { components, count } = stronglyConnectedComponents(g);
    expect(count).toBe(1);
    expect(components[0]).toContain("A");
  });

  it("two nodes with mutual edges form one SCC", () => {
    const g = new Graph();
    g.addNode({ id: "A", type: "node" });
    g.addNode({ id: "B", type: "node" });
    addEdge(g, "A", "B");
    addEdge(g, "B", "A");
    const { count } = stronglyConnectedComponents(g);
    expect(count).toBe(1);
  });

  it("two nodes with one-way edge form two SCCs", () => {
    const g = new Graph();
    g.addNode({ id: "A", type: "node" });
    g.addNode({ id: "B", type: "node" });
    addEdge(g, "A", "B");
    const { count } = stronglyConnectedComponents(g);
    expect(count).toBe(2);
  });

  it("cycle graph is one SCC", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "D"); addEdge(g, "D", "A");
    const { count } = stronglyConnectedComponents(g);
    expect(count).toBe(1);
  });

  it("DAG: each node is its own SCC", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "A", "C"); addEdge(g, "B", "D"); addEdge(g, "C", "D");
    const { count } = stronglyConnectedComponents(g);
    expect(count).toBe(4);
  });

  it("complex graph with multiple SCCs", () => {
    // Classic example: 0->1->2->0, 3->4->5->3, 2->3
    const g = new Graph();
    for (const id of ["0","1","2","3","4","5"]) g.addNode({ id, type: "node" });
    addEdge(g, "0", "1"); addEdge(g, "1", "2"); addEdge(g, "2", "0"); // SCC1
    addEdge(g, "3", "4"); addEdge(g, "4", "5"); addEdge(g, "5", "3"); // SCC2
    addEdge(g, "2", "3"); // bridge
    const { count } = stronglyConnectedComponents(g);
    expect(count).toBe(2);
  });

  it("componentMap assigns correct component indices", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "A"); // A,B same SCC
    addEdge(g, "B", "C"); // C is separate
    const { componentMap } = stronglyConnectedComponents(g);
    expect(componentMap.get("A")).toBe(componentMap.get("B"));
    expect(componentMap.get("A")).not.toBe(componentMap.get("C"));
  });

  it("isStronglyConnected returns true for strongly connected graph", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "A");
    expect(isStronglyConnected(g)).toBe(true);
  });

  it("isStronglyConnected returns false for DAG", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C");
    expect(isStronglyConnected(g)).toBe(false);
  });

  it("largestSCC returns the biggest component", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "A"); // SCC of 3
    addEdge(g, "D", "E"); // SCC of 1 each
    const largest = largestSCC(g);
    expect(largest.length).toBe(3);
    expect(largest).toContain("A");
    expect(largest).toContain("B");
    expect(largest).toContain("C");
  });
});

describe("Weakly Connected Components (Union-Find)", () => {
  it("isolated nodes are separate components", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    const { count } = weaklyConnectedComponents(g);
    expect(count).toBe(3);
  });

  it("directed edge makes two nodes weakly connected", () => {
    const g = new Graph();
    g.addNode({ id: "A", type: "node" });
    g.addNode({ id: "B", type: "node" });
    addEdge(g, "A", "B");
    const { count } = weaklyConnectedComponents(g);
    expect(count).toBe(1);
  });

  it("chain graph is one weak component", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "D"); addEdge(g, "D", "E");
    const { count } = weaklyConnectedComponents(g);
    expect(count).toBe(1);
  });

  it("two disconnected chains are two components", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B");
    addEdge(g, "C", "D");
    const { count } = weaklyConnectedComponents(g);
    expect(count).toBe(2);
  });

  it("largestWCC identifies the biggest component", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D","E","F"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "D"); addEdge(g, "D", "E");
    addEdge(g, "F", "F"); // self-loop to keep F in graph (will be single node)
    g.removeEdge("F-F"); // just add F as isolated
    const largest = largestWCC(g);
    expect(largest.length).toBe(5);
    expect(largest).toContain("A");
  });

  it("sizeDistribution counts correctly", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D","E","F"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); // component of size 3
    addEdge(g, "D", "E"); // component of size 2
    // F is isolated
    const { sizeDistribution } = weaklyConnectedComponents(g);
    expect(sizeDistribution.get(3)).toBe(1);
    expect(sizeDistribution.get(2)).toBe(1);
    expect(sizeDistribution.get(1)).toBe(1);
  });

  it("isWeaklyConnected returns true for connected graph", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C");
    expect(isWeaklyConnected(g)).toBe(true);
  });

  it("isWeaklyConnected returns false for disconnected graph", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B");
    addEdge(g, "C", "D");
    expect(isWeaklyConnected(g)).toBe(false);
  });

  it("empty graph has zero components", () => {
    const g = new Graph();
    const { count } = weaklyConnectedComponents(g);
    expect(count).toBe(0);
  });

  it("componentMap maps nodes to correct component index", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B");
    addEdge(g, "C", "D");
    const { componentMap } = weaklyConnectedComponents(g);
    expect(componentMap.get("A")).toBe(componentMap.get("B"));
    expect(componentMap.get("C")).toBe(componentMap.get("D"));
    expect(componentMap.get("A")).not.toBe(componentMap.get("C"));
  });
});
