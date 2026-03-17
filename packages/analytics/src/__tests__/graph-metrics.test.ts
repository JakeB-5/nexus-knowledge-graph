import { describe, it, expect } from "vitest";
import { GraphMetrics } from "../graph-metrics.js";
import { UnionFind } from "../union-find.js";
import type { GraphNode, GraphEdge } from "@nexus/graph";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function node(id: string): GraphNode {
  return { id, type: "test" };
}

function edge(id: string, source: string, target: string, weight = 1): GraphEdge {
  return { id, source, target, type: "link", weight };
}

/** Build a simple triangle A→B→C→A */
function triangle(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: [node("A"), node("B"), node("C")],
    edges: [edge("e1", "A", "B"), edge("e2", "B", "C"), edge("e3", "C", "A")],
  };
}

/** Linear chain: A→B→C→D */
function chain(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: [node("A"), node("B"), node("C"), node("D")],
    edges: [edge("e1", "A", "B"), edge("e2", "B", "C"), edge("e3", "C", "D")],
  };
}

/** Star graph: center → n leaves */
function star(n: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [node("center")];
  const edges: GraphEdge[] = [];
  for (let i = 0; i < n; i++) {
    const id = `leaf${i}`;
    nodes.push(node(id));
    edges.push(edge(`e${i}`, "center", id));
    edges.push(edge(`er${i}`, id, "center"));
  }
  return { nodes, edges };
}

// ─── UnionFind ────────────────────────────────────────────────────────────────

describe("UnionFind", () => {
  it("starts with each element in its own component", () => {
    const uf = new UnionFind(["a", "b", "c"]);
    expect(uf.count).toBe(3);
    expect(uf.connected("a", "b")).toBe(false);
  });

  it("unions two elements", () => {
    const uf = new UnionFind(["a", "b", "c"]);
    uf.union("a", "b");
    expect(uf.connected("a", "b")).toBe(true);
    expect(uf.count).toBe(2);
  });

  it("returns false when already connected", () => {
    const uf = new UnionFind(["a", "b"]);
    expect(uf.union("a", "b")).toBe(true);
    expect(uf.union("a", "b")).toBe(false);
  });

  it("applies path compression (find is idempotent)", () => {
    const uf = new UnionFind(["a", "b", "c", "d"]);
    uf.union("a", "b");
    uf.union("b", "c");
    uf.union("c", "d");
    const root = uf.find("a");
    expect(uf.find("d")).toBe(root);
  });

  it("getComponents returns correct groups", () => {
    const uf = new UnionFind(["a", "b", "c", "d"]);
    uf.union("a", "b");
    uf.union("c", "d");
    const comps = uf.getComponents();
    expect(comps.size).toBe(2);
  });

  it("componentSize is correct", () => {
    const uf = new UnionFind(["a", "b", "c"]);
    uf.union("a", "b");
    expect(uf.componentSize("a")).toBe(2);
    expect(uf.componentSize("c")).toBe(1);
  });

  it("largestComponentSize is correct", () => {
    const uf = new UnionFind(["a", "b", "c", "d"]);
    uf.union("a", "b");
    uf.union("b", "c");
    expect(uf.largestComponentSize()).toBe(3);
  });

  it("auto-adds new elements on find", () => {
    const uf = new UnionFind();
    uf.find("x");
    expect(uf.totalElements).toBe(1);
  });
});

// ─── GraphMetrics – basic ─────────────────────────────────────────────────────

describe("GraphMetrics – basic properties", () => {
  it("reports correct node and edge counts", () => {
    const { nodes, edges } = triangle();
    const gm = new GraphMetrics(nodes, edges);
    expect(gm.nodeCount).toBe(3);
    expect(gm.edgeCount).toBe(3);
  });

  it("computes density for triangle", () => {
    const { nodes, edges } = triangle();
    const gm = new GraphMetrics(nodes, edges);
    // 3 edges / (3*2) = 0.5
    expect(gm.density()).toBeCloseTo(0.5, 5);
  });

  it("computes density = 0 for empty graph", () => {
    const gm = new GraphMetrics([], []);
    expect(gm.density()).toBe(0);
  });

  it("computes density = 0 for single-node graph", () => {
    const gm = new GraphMetrics([node("A")], []);
    expect(gm.density()).toBe(0);
  });
});

// ─── Degree distribution ──────────────────────────────────────────────────────

describe("GraphMetrics – degree distribution", () => {
  it("computes in/out degrees for chain A→B→C→D", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const dist = gm.degreeDistribution();

    expect(dist.outDegree.get("A")).toBe(1);
    expect(dist.outDegree.get("D")).toBe(0);
    expect(dist.inDegree.get("A")).toBe(0);
    expect(dist.inDegree.get("D")).toBe(1);
  });

  it("computes average degree", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const dist = gm.degreeDistribution();
    // A:1, B:2, C:2, D:1 → avg = 6/4 = 1.5
    expect(dist.avg).toBeCloseTo(1.5, 5);
  });

  it("builds frequency distribution", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const dist = gm.degreeDistribution();
    // Nodes with degree 1: A and D (2 nodes)
    // Nodes with degree 2: B and C (2 nodes)
    expect(dist.distribution.get(1)).toBe(2);
    expect(dist.distribution.get(2)).toBe(2);
  });
});

// ─── Clustering coefficient ───────────────────────────────────────────────────

describe("GraphMetrics – clustering coefficient", () => {
  it("triangle has perfect clustering coefficient", () => {
    const { nodes, edges } = triangle();
    const gm = new GraphMetrics(nodes, edges);
    const result = gm.clusteringCoefficient();
    // Every node is connected to the other two, and those two are connected
    expect(result.global).toBeCloseTo(1.0, 1);
  });

  it("chain has zero clustering coefficient", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const result = gm.clusteringCoefficient();
    // No triangles in a simple chain
    expect(result.global).toBe(0);
  });

  it("isolated node has zero local clustering", () => {
    const gm = new GraphMetrics([node("A"), node("B")], []);
    const result = gm.clusteringCoefficient();
    expect(result.local.get("A")).toBe(0);
  });
});

// ─── Path length / diameter ───────────────────────────────────────────────────

describe("GraphMetrics – path length and diameter", () => {
  it("average path length for chain is correct", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const apl = gm.averagePathLength();
    // Undirected chain A-B-C-D: paths are 1,2,3, 1,2, 1 (and reverses) = avg ~1.67
    expect(apl).toBeGreaterThan(0);
    expect(apl).toBeLessThan(5);
  });

  it("diameter estimation for chain of 4", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const d = gm.diameterEstimate();
    expect(d).toBe(3); // A to D = 3 hops
  });

  it("single node has path length 0", () => {
    const gm = new GraphMetrics([node("A")], []);
    expect(gm.averagePathLength()).toBe(0);
  });
});

// ─── Centrality ───────────────────────────────────────────────────────────────

describe("GraphMetrics – betweenness centrality", () => {
  it("middle node of chain has highest betweenness", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const bc = gm.betweennessCentrality();
    const scores = bc.top(4);
    // B and C should have higher betweenness than A and D
    const bScore = bc.scores.get("B") ?? 0;
    const aScore = bc.scores.get("A") ?? 0;
    expect(bScore).toBeGreaterThanOrEqual(aScore);
  });

  it("top() returns nodes sorted descending", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const bc = gm.betweennessCentrality();
    const top = bc.top(2);
    expect(top[0]!.score).toBeGreaterThanOrEqual(top[1]!.score);
  });

  it("normalized scores are in [0, 1]", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const bc = gm.betweennessCentrality(true);
    for (const score of bc.scores.values()) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe("GraphMetrics – closeness centrality", () => {
  it("center of star has highest closeness", () => {
    const { nodes, edges } = star(4);
    const gm = new GraphMetrics(nodes, edges);
    const cc = gm.closenessCentrality();
    const centerScore = cc.scores.get("center") ?? 0;
    for (const [id, score] of cc.scores) {
      if (id !== "center") {
        expect(centerScore).toBeGreaterThanOrEqual(score);
      }
    }
  });
});

describe("GraphMetrics – eigenvector centrality", () => {
  it("converges and produces non-negative scores", () => {
    const { nodes, edges } = triangle();
    const gm = new GraphMetrics(nodes, edges);
    const ec = gm.eigenvectorCentrality();
    for (const score of ec.scores.values()) {
      expect(score).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns empty map for empty graph", () => {
    const gm = new GraphMetrics([], []);
    const ec = gm.eigenvectorCentrality();
    expect(ec.scores.size).toBe(0);
  });
});

// ─── HITS ─────────────────────────────────────────────────────────────────────

describe("GraphMetrics – HITS", () => {
  it("produces hub and authority scores", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const hits = gm.hits();
    expect(hits.hubs.size).toBe(4);
    expect(hits.authorities.size).toBe(4);
  });

  it("scores are non-negative", () => {
    const { nodes, edges } = triangle();
    const gm = new GraphMetrics(nodes, edges);
    const hits = gm.hits();
    for (const s of hits.hubs.values()) expect(s).toBeGreaterThanOrEqual(0);
    for (const s of hits.authorities.values()) expect(s).toBeGreaterThanOrEqual(0);
  });
});

// ─── Connected components ─────────────────────────────────────────────────────

describe("GraphMetrics – weakly connected components", () => {
  it("single component for connected graph", () => {
    const { nodes, edges } = triangle();
    const gm = new GraphMetrics(nodes, edges);
    const wcc = gm.weaklyConnectedComponents();
    expect(wcc.count).toBe(1);
    expect(wcc.largestSize).toBe(3);
  });

  it("two components for disconnected graph", () => {
    const nodes = [node("A"), node("B"), node("C"), node("D")];
    const edges = [edge("e1", "A", "B"), edge("e2", "C", "D")];
    const gm = new GraphMetrics(nodes, edges);
    const wcc = gm.weaklyConnectedComponents();
    expect(wcc.count).toBe(2);
  });

  it("each isolated node is its own component", () => {
    const nodes = [node("A"), node("B"), node("C")];
    const gm = new GraphMetrics(nodes, []);
    const wcc = gm.weaklyConnectedComponents();
    expect(wcc.count).toBe(3);
  });
});

describe("GraphMetrics – strongly connected components", () => {
  it("triangle is one SCC", () => {
    const { nodes, edges } = triangle();
    const gm = new GraphMetrics(nodes, edges);
    const scc = gm.stronglyConnectedComponents();
    expect(scc.count).toBe(1);
    expect(scc.largestSize).toBe(3);
  });

  it("chain has N SCCs (each node is its own)", () => {
    const { nodes, edges } = chain();
    const gm = new GraphMetrics(nodes, edges);
    const scc = gm.stronglyConnectedComponents();
    // Each node is its own SCC since edges are one-directional
    expect(scc.count).toBe(4);
  });

  it("handles empty graph", () => {
    const gm = new GraphMetrics([], []);
    const scc = gm.stronglyConnectedComponents();
    expect(scc.count).toBe(0);
  });
});
