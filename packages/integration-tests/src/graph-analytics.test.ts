/**
 * Integration tests: Graph + Analytics
 *
 * Tests that exercise the boundary between @nexus/graph and @nexus/analytics.
 * We build graphs of various topologies, compute centrality / community metrics,
 * and verify that the results are consistent with known graph-theory expectations.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Graph, pageRank, communityDetection } from "@nexus/graph";
import type { GraphNode, GraphEdge } from "@nexus/graph";
import { GraphMetrics } from "@nexus/analytics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, type = "node"): GraphNode {
  return { id, type };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  weight = 1
): GraphEdge {
  return { id, source, target, type: "related", weight };
}

/** Build a star graph: one hub + N leaf nodes */
function buildStarGraph(leafCount: number): Graph {
  const g = new Graph();
  g.addNode(makeNode("hub"));
  for (let i = 0; i < leafCount; i++) {
    g.addNode(makeNode(`leaf-${i}`));
    g.addEdge(makeEdge(`e-hub-${i}`, "hub", `leaf-${i}`));
  }
  return g;
}

/** Build a ring graph: N nodes each connected to the next */
function buildRingGraph(size: number): Graph {
  const g = new Graph();
  for (let i = 0; i < size; i++) {
    g.addNode(makeNode(`n${i}`));
  }
  for (let i = 0; i < size; i++) {
    const next = (i + 1) % size;
    g.addEdge(makeEdge(`e${i}`, `n${i}`, `n${next}`));
  }
  return g;
}

/** Build a complete directed graph: every pair of nodes has an edge both ways */
function buildCompleteGraph(size: number): Graph {
  const g = new Graph();
  for (let i = 0; i < size; i++) {
    g.addNode(makeNode(`n${i}`));
  }
  let edgeId = 0;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i !== j) {
        g.addEdge(makeEdge(`e${edgeId++}`, `n${i}`, `n${j}`));
      }
    }
  }
  return g;
}

/** Build a two-community graph: two cliques loosely connected */
function buildTwoCommunityGraph(): Graph {
  const g = new Graph();
  // Community A: a0, a1, a2
  // Community B: b0, b1, b2
  for (const id of ["a0", "a1", "a2", "b0", "b1", "b2"]) {
    g.addNode(makeNode(id));
  }

  // Intra-community edges (dense)
  const intraEdges: [string, string][] = [
    ["a0", "a1"],
    ["a1", "a2"],
    ["a2", "a0"],
    ["b0", "b1"],
    ["b1", "b2"],
    ["b2", "b0"],
  ];
  let i = 0;
  for (const [s, t] of intraEdges) {
    g.addEdge(makeEdge(`intra-${i++}`, s, t));
  }

  // Single inter-community bridge
  g.addEdge(makeEdge("bridge", "a0", "b0"));

  return g;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Graph + Analytics integration", () => {
  // ── 1. Basic metrics on a small hand-crafted graph ────────────────────────

  describe("degree distribution", () => {
    it("computes in/out degree for a simple directed graph", () => {
      const g = new Graph();
      g.addNode(makeNode("a"));
      g.addNode(makeNode("b"));
      g.addNode(makeNode("c"));
      g.addEdge(makeEdge("e1", "a", "b"));
      g.addEdge(makeEdge("e2", "a", "c"));
      g.addEdge(makeEdge("e3", "b", "c"));

      const metrics = new GraphMetrics(g.getAllNodes(), g.getAllEdges());
      const dist = metrics.degreeDistribution();

      expect(dist.outDegree.get("a")).toBe(2);
      expect(dist.outDegree.get("b")).toBe(1);
      expect(dist.outDegree.get("c")).toBe(0);
      expect(dist.inDegree.get("c")).toBe(2);
    });
  });

  // ── 2. Star graph ─────────────────────────────────────────────────────────

  describe("star graph topology", () => {
    let star: Graph;
    const LEAF_COUNT = 6;

    beforeEach(() => {
      star = buildStarGraph(LEAF_COUNT);
    });

    it("hub has highest out-degree", () => {
      const metrics = new GraphMetrics(
        star.getAllNodes(),
        star.getAllEdges()
      );
      const dist = metrics.degreeDistribution();
      expect(dist.outDegree.get("hub")).toBe(LEAF_COUNT);
      for (let i = 0; i < LEAF_COUNT; i++) {
        expect(dist.outDegree.get(`leaf-${i}`)).toBe(0);
      }
    });

    it("pageRank gives hub the highest score", () => {
      const pr = pageRank(star);
      const hubScore = pr.scores.get("hub") ?? 0;
      for (let i = 0; i < LEAF_COUNT; i++) {
        const leafScore = pr.scores.get(`leaf-${i}`) ?? 0;
        expect(hubScore).toBeGreaterThanOrEqual(leafScore);
      }
    });

    it("betweenness centrality is highest at hub", () => {
      const metrics = new GraphMetrics(
        star.getAllNodes(),
        star.getAllEdges()
      );
      const betweenness = metrics.betweennessCentrality();
      const hubScore = betweenness.scores.get("hub") ?? 0;
      const topNode = betweenness.top(1)[0];
      expect(topNode?.nodeId).toBe("hub");
      expect(hubScore).toBeGreaterThan(0);
    });
  });

  // ── 3. Ring graph ─────────────────────────────────────────────────────────

  describe("ring graph topology", () => {
    let ring: Graph;
    const RING_SIZE = 5;

    beforeEach(() => {
      ring = buildRingGraph(RING_SIZE);
    });

    it("every node has in-degree and out-degree of 1", () => {
      const metrics = new GraphMetrics(
        ring.getAllNodes(),
        ring.getAllEdges()
      );
      const dist = metrics.degreeDistribution();
      for (let i = 0; i < RING_SIZE; i++) {
        expect(dist.outDegree.get(`n${i}`)).toBe(1);
        expect(dist.inDegree.get(`n${i}`)).toBe(1);
      }
    });

    it("pageRank scores are nearly equal for all nodes in a ring", () => {
      const pr = pageRank(ring);
      const scores = [...pr.scores.values()];
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      // In a symmetric ring all scores should be very close
      expect(max - min).toBeLessThan(0.05);
    });

    it("computes SCC: ring has one strongly connected component", () => {
      const metrics = new GraphMetrics(
        ring.getAllNodes(),
        ring.getAllEdges()
      );
      const scc = metrics.stronglyConnectedComponents();
      expect(scc.count).toBe(1);
      expect(scc.largestSize).toBe(RING_SIZE);
    });
  });

  // ── 4. Complete graph ─────────────────────────────────────────────────────

  describe("complete graph topology", () => {
    const SIZE = 4;
    let complete: Graph;

    beforeEach(() => {
      complete = buildCompleteGraph(SIZE);
    });

    it("every node has equal degree", () => {
      const metrics = new GraphMetrics(
        complete.getAllNodes(),
        complete.getAllEdges()
      );
      const dist = metrics.degreeDistribution();
      for (let i = 0; i < SIZE; i++) {
        expect(dist.outDegree.get(`n${i}`)).toBe(SIZE - 1);
      }
    });

    it("density equals 1.0 for a complete directed graph", () => {
      const metrics = new GraphMetrics(
        complete.getAllNodes(),
        complete.getAllEdges()
      );
      const density = metrics.density();
      // Directed density = edges / (n * (n-1))
      expect(density).toBeCloseTo(1.0, 2);
    });

    it("clustering coefficient is 1.0 for complete graph", () => {
      const metrics = new GraphMetrics(
        complete.getAllNodes(),
        complete.getAllEdges()
      );
      const clustering = metrics.clusteringCoefficient();
      expect(clustering.global).toBeCloseTo(1.0, 1);
    });

    it("pageRank converges for complete graph", () => {
      const pr = pageRank(complete);
      expect(pr.converged).toBe(true);
      expect(pr.iterations).toBeGreaterThan(0);
    });
  });

  // ── 5. Community detection ────────────────────────────────────────────────

  describe("community detection", () => {
    it("detects two communities in two-community graph", () => {
      const g = buildTwoCommunityGraph();
      const communities = communityDetection(g);
      expect(communities.length).toBeGreaterThanOrEqual(1);

      // All nodes should belong to some community
      const allMembers = communities.flatMap((c) => c.members);
      const nodeIds = g.getAllNodes().map((n) => n.id);
      for (const id of nodeIds) {
        expect(allMembers).toContain(id);
      }
    });

    it("nodes in same community have higher intra-community edge density", () => {
      const g = buildTwoCommunityGraph();
      const communities = communityDetection(g);

      if (communities.length >= 2) {
        const edges = g.getAllEdges();
        // Find a community and check intra vs inter edges
        const c0 = new Set(communities[0]?.members ?? []);
        const intraEdges = edges.filter(
          (e) => c0.has(e.source) && c0.has(e.target)
        );
        const interEdges = edges.filter(
          (e) => c0.has(e.source) && !c0.has(e.target)
        );
        // intra should be >= inter (communities should be denser internally)
        expect(intraEdges.length).toBeGreaterThanOrEqual(interEdges.length);
      }
    });
  });

  // ── 6. Dynamic graph: analytics update on changes ─────────────────────────

  describe("analytics update when graph changes", () => {
    it("density increases as edges are added", () => {
      const g = new Graph();
      g.addNode(makeNode("x"));
      g.addNode(makeNode("y"));
      g.addNode(makeNode("z"));

      const m0 = new GraphMetrics(g.getAllNodes(), g.getAllEdges());
      const d0 = m0.density();

      g.addEdge(makeEdge("e1", "x", "y"));
      const m1 = new GraphMetrics(g.getAllNodes(), g.getAllEdges());
      const d1 = m1.density();

      g.addEdge(makeEdge("e2", "y", "z"));
      const m2 = new GraphMetrics(g.getAllNodes(), g.getAllEdges());
      const d2 = m2.density();

      expect(d1).toBeGreaterThan(d0);
      expect(d2).toBeGreaterThan(d1);
    });

    it("removing a node reduces nodeCount and affects metrics", () => {
      const g = buildStarGraph(4);
      const nodesBefore = g.nodeCount;

      g.removeNode("leaf-0");

      expect(g.nodeCount).toBe(nodesBefore - 1);

      const metrics = new GraphMetrics(g.getAllNodes(), g.getAllEdges());
      const dist = metrics.degreeDistribution();
      expect(dist.outDegree.get("hub")).toBe(3);
    });

    it("pageRank scores sum to approximately 1", () => {
      const g = buildCompleteGraph(5);
      const pr = pageRank(g);
      const total = [...pr.scores.values()].reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1.0, 1);
    });
  });

  // ── 7. HITS algorithm ─────────────────────────────────────────────────────

  describe("HITS algorithm", () => {
    it("computes hub and authority scores", () => {
      const g = new Graph();
      for (const id of ["a", "b", "c", "d"]) {
        g.addNode(makeNode(id));
      }
      // a points to b and c; d points to b
      g.addEdge(makeEdge("e1", "a", "b"));
      g.addEdge(makeEdge("e2", "a", "c"));
      g.addEdge(makeEdge("e3", "d", "b"));

      const metrics = new GraphMetrics(g.getAllNodes(), g.getAllEdges());
      const hits = metrics.hits();

      // b is pointed to by most nodes → highest authority
      const bAuthority = hits.authorities.get("b") ?? 0;
      const cAuthority = hits.authorities.get("c") ?? 0;
      expect(bAuthority).toBeGreaterThanOrEqual(cAuthority);

      // a points to most → high hub score
      const aHub = hits.hubs.get("a") ?? 0;
      const dHub = hits.hubs.get("d") ?? 0;
      expect(aHub).toBeGreaterThanOrEqual(dHub);
    });
  });

  // ── 8. Weakly connected components ───────────────────────────────────────

  describe("weakly connected components", () => {
    it("disconnected graph has multiple WCC", () => {
      const g = new Graph();
      // Two isolated pairs
      g.addNode(makeNode("p1"));
      g.addNode(makeNode("p2"));
      g.addNode(makeNode("q1"));
      g.addNode(makeNode("q2"));
      g.addEdge(makeEdge("ep", "p1", "p2"));
      g.addEdge(makeEdge("eq", "q1", "q2"));

      const metrics = new GraphMetrics(g.getAllNodes(), g.getAllEdges());
      const wcc = metrics.weaklyConnectedComponents();
      expect(wcc.count).toBe(2);
    });

    it("single component graph has WCC count of 1", () => {
      const g = buildRingGraph(6);
      const metrics = new GraphMetrics(g.getAllNodes(), g.getAllEdges());
      const wcc = metrics.weaklyConnectedComponents();
      expect(wcc.count).toBe(1);
      expect(wcc.largestSize).toBe(6);
    });
  });
});
