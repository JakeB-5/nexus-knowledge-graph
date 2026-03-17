import { describe, it, expect, beforeEach } from "vitest";
import { Graph } from "../graph.js";
import { betweennessCentrality, topKByBetweenness } from "../algorithms/betweenness.js";
import { closenessCentrality, harmonicClosenessCentrality, topKByCloseness } from "../algorithms/closeness.js";
import { hits, topKHubs, topKAuthorities } from "../algorithms/hits.js";

function makeGraph(): Graph {
  const g = new Graph();
  const nodes = ["A", "B", "C", "D", "E"];
  for (const id of nodes) g.addNode({ id, type: "node" });
  return g;
}

function addEdge(g: Graph, src: string, tgt: string, weight = 1): void {
  g.addEdge({ id: `${src}-${tgt}`, source: src, target: tgt, type: "edge", weight });
}

describe("Betweenness Centrality", () => {
  it("returns zero for disconnected graph", () => {
    const g = makeGraph();
    const { scores } = betweennessCentrality(g);
    for (const s of scores.values()) expect(s).toBe(0);
  });

  it("star graph: center has highest betweenness", () => {
    const g = new Graph();
    for (const id of ["center", "a", "b", "c", "d"]) {
      g.addNode({ id, type: "node" });
    }
    for (const leaf of ["a", "b", "c", "d"]) {
      addEdge(g, "center", leaf);
      addEdge(g, leaf, "center");
    }
    const { scores } = betweennessCentrality(g, { directed: false });
    const centerScore = scores.get("center") ?? 0;
    for (const [id, s] of scores) {
      if (id !== "center") expect(centerScore).toBeGreaterThanOrEqual(s);
    }
  });

  it("path graph: middle nodes have higher betweenness", () => {
    const g = new Graph();
    for (const id of ["1", "2", "3", "4", "5"]) g.addNode({ id, type: "node" });
    addEdge(g, "1", "2"); addEdge(g, "2", "1");
    addEdge(g, "2", "3"); addEdge(g, "3", "2");
    addEdge(g, "3", "4"); addEdge(g, "4", "3");
    addEdge(g, "4", "5"); addEdge(g, "5", "4");

    const { scores } = betweennessCentrality(g, { directed: false });
    const s3 = scores.get("3") ?? 0;
    const s1 = scores.get("1") ?? 0;
    const s5 = scores.get("5") ?? 0;
    expect(s3).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s5);
  });

  it("normalized scores are non-negative", () => {
    const g = makeGraph();
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "D"); addEdge(g, "D", "E");
    addEdge(g, "B", "A"); addEdge(g, "C", "B"); addEdge(g, "D", "C"); addEdge(g, "E", "D");
    const { scores } = betweennessCentrality(g, { normalized: true, directed: true });
    for (const s of scores.values()) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("topKByBetweenness returns k nodes sorted descending", () => {
    const g = makeGraph();
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "D"); addEdge(g, "D", "E");
    addEdge(g, "B", "A"); addEdge(g, "C", "B"); addEdge(g, "D", "C"); addEdge(g, "E", "D");
    const top3 = topKByBetweenness(g, 3, { directed: false });
    expect(top3).toHaveLength(3);
    for (let i = 0; i < top3.length - 1; i++) {
      expect(top3[i]!.score).toBeGreaterThanOrEqual(top3[i + 1]!.score);
    }
  });

  it("single node graph", () => {
    const g = new Graph();
    g.addNode({ id: "solo", type: "node" });
    const { scores } = betweennessCentrality(g);
    expect(scores.get("solo")).toBe(0);
  });

  it("complete graph: all nodes have equal betweenness", () => {
    const g = new Graph();
    const ids = ["A", "B", "C", "D"];
    for (const id of ids) g.addNode({ id, type: "node" });
    for (const u of ids) {
      for (const v of ids) {
        if (u !== v) addEdge(g, u, v);
      }
    }
    const { scores } = betweennessCentrality(g, { normalized: true, directed: false });
    const vals = Array.from(scores.values());
    for (const v of vals) expect(v).toBeCloseTo(vals[0]!, 5);
  });
});

describe("Closeness Centrality", () => {
  it("returns zero for isolated nodes", () => {
    const g = makeGraph();
    const { scores } = closenessCentrality(g);
    for (const s of scores.values()) expect(s).toBe(0);
  });

  it("path graph: middle has higher closeness", () => {
    const g = new Graph();
    for (const id of ["1", "2", "3", "4", "5"]) g.addNode({ id, type: "node" });
    const edges = [["1","2"],["2","3"],["3","4"],["4","5"],["2","1"],["3","2"],["4","3"],["5","4"]];
    for (const [s, t] of edges) addEdge(g, s!, t!);
    const { scores } = closenessCentrality(g, { directed: false });
    const s3 = scores.get("3") ?? 0;
    expect(s3).toBeGreaterThan(scores.get("1") ?? 0);
    expect(s3).toBeGreaterThan(scores.get("5") ?? 0);
  });

  it("harmonic closeness handles disconnected graph", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "A");
    // C and D are isolated
    const { scores } = harmonicClosenessCentrality(g, { directed: false });
    expect(scores.get("A")).toBeGreaterThan(0);
    expect(scores.get("C")).toBe(0);
  });

  it("normalized closeness scores are in [0, 1]", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
    const edges = [["A","B"],["B","C"],["C","D"],["D","E"],["B","A"],["C","B"],["D","C"],["E","D"]];
    for (const [s, t] of edges) addEdge(g, s!, t!);
    const { scores } = closenessCentrality(g, { normalized: true, directed: false });
    for (const s of scores.values()) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("topKByCloseness returns sorted results", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
    const edges = [["A","B"],["B","C"],["C","D"],["D","E"],["B","A"],["C","B"],["D","C"],["E","D"]];
    for (const [s, t] of edges) addEdge(g, s!, t!);
    const top2 = topKByCloseness(g, 2, { directed: false });
    expect(top2).toHaveLength(2);
    expect(top2[0]!.score).toBeGreaterThanOrEqual(top2[1]!.score);
  });

  it("single node has zero closeness", () => {
    const g = new Graph();
    g.addNode({ id: "X", type: "node" });
    const { scores } = closenessCentrality(g);
    expect(scores.get("X")).toBe(0);
  });
});

describe("HITS Algorithm", () => {
  it("returns equal scores for undirected complete graph", () => {
    const g = new Graph();
    const ids = ["A","B","C"];
    for (const id of ids) g.addNode({ id, type: "node" });
    for (const u of ids) for (const v of ids) if (u !== v) addEdge(g, u, v);
    const { hubs, authorities } = hits(g);
    const hubVals = Array.from(hubs.values());
    for (const h of hubVals) expect(h).toBeCloseTo(hubVals[0]!, 4);
    const authVals = Array.from(authorities.values());
    for (const a of authVals) expect(a).toBeCloseTo(authVals[0]!, 4);
  });

  it("bipartite graph: hubs and authorities are disjoint", () => {
    const g = new Graph();
    // Hubs: H1, H2; Authorities: A1, A2
    for (const id of ["H1","H2","A1","A2"]) g.addNode({ id, type: "node" });
    addEdge(g, "H1", "A1"); addEdge(g, "H1", "A2");
    addEdge(g, "H2", "A1"); addEdge(g, "H2", "A2");

    const { hubs, authorities } = hits(g);
    // Hub nodes should have higher hub score
    expect(hubs.get("H1")!).toBeGreaterThan(hubs.get("A1")!);
    expect(hubs.get("H2")!).toBeGreaterThan(hubs.get("A2")!);
    // Authority nodes should have higher authority score
    expect(authorities.get("A1")!).toBeGreaterThan(authorities.get("H1")!);
    expect(authorities.get("A2")!).toBeGreaterThan(authorities.get("H2")!);
  });

  it("converges within maxIterations", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "C", "D"); addEdge(g, "A", "C");
    const result = hits(g, { maxIterations: 100, tolerance: 1e-8 });
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(100);
  });

  it("empty graph returns empty maps", () => {
    const g = new Graph();
    const { hubs, authorities } = hits(g);
    expect(hubs.size).toBe(0);
    expect(authorities.size).toBe(0);
  });

  it("topKHubs returns k results sorted descending", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "A", "C"); addEdge(g, "A", "D");
    addEdge(g, "B", "E"); addEdge(g, "C", "E");
    const top3 = topKHubs(g, 3);
    expect(top3).toHaveLength(3);
    expect(top3[0]!.score).toBeGreaterThanOrEqual(top3[1]!.score);
    expect(top3[1]!.score).toBeGreaterThanOrEqual(top3[2]!.score);
  });

  it("topKAuthorities returns k results sorted descending", () => {
    const g = new Graph();
    for (const id of ["A","B","C","D","E"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "E"); addEdge(g, "B", "E"); addEdge(g, "C", "E");
    addEdge(g, "D", "E");
    const top2 = topKAuthorities(g, 2);
    expect(top2).toHaveLength(2);
    // E should be the top authority
    expect(top2[0]!.nodeId).toBe("E");
  });

  it("scores are L2-normalized (sum of squares ≈ 1)", () => {
    const g = new Graph();
    for (const id of ["A","B","C"]) g.addNode({ id, type: "node" });
    addEdge(g, "A", "B"); addEdge(g, "B", "C"); addEdge(g, "A", "C");
    const { hubs, authorities } = hits(g);
    const hubNorm = Array.from(hubs.values()).reduce((s, v) => s + v * v, 0);
    const authNorm = Array.from(authorities.values()).reduce((s, v) => s + v * v, 0);
    if (hubNorm > 0) expect(hubNorm).toBeCloseTo(1, 4);
    if (authNorm > 0) expect(authNorm).toBeCloseTo(1, 4);
  });
});
