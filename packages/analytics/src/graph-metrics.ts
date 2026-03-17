// Graph metrics and centrality algorithms for the Nexus knowledge graph

import type { GraphNode, GraphEdge } from "@nexus/graph";
import { UnionFind } from "./union-find.js";
import { mean } from "./statistics.js";

export interface DegreeDistribution {
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
  totalDegree: Map<string, number>;
  /** Frequency map: degree → number of nodes with that degree */
  distribution: Map<number, number>;
  max: number;
  avg: number;
}

export interface ClusteringResult {
  /** Local clustering coefficient per node */
  local: Map<string, number>;
  /** Global clustering coefficient (average of local) */
  global: number;
}

export interface CentralityScores {
  scores: Map<string, number>;
  /** Top k nodes sorted by score descending */
  top(k: number): Array<{ nodeId: string; score: number }>;
}

export interface SCCResult {
  components: string[][];
  count: number;
  largestSize: number;
}

export interface WCCResult {
  components: string[][];
  count: number;
  largestSize: number;
}

export interface HITSResult {
  hubs: Map<string, number>;
  authorities: Map<string, number>;
}

function makeCentralityScores(scores: Map<string, number>): CentralityScores {
  return {
    scores,
    top(k: number) {
      return [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([nodeId, score]) => ({ nodeId, score }));
    },
  };
}

export class GraphMetrics {
  private nodes: GraphNode[];
  private edges: GraphEdge[];

  // Cached adjacency structures
  private _outAdj: Map<string, Set<string>> | null = null;
  private _inAdj: Map<string, Set<string>> | null = null;
  private _undirAdj: Map<string, Set<string>> | null = null;

  constructor(nodes: GraphNode[], edges: GraphEdge[]) {
    this.nodes = nodes;
    this.edges = edges;
  }

  private get outAdj(): Map<string, Set<string>> {
    if (!this._outAdj) {
      this._outAdj = new Map(this.nodes.map((n) => [n.id, new Set<string>()]));
      for (const e of this.edges) {
        let s = this._outAdj.get(e.source);
        if (!s) { s = new Set(); this._outAdj.set(e.source, s); }
        s.add(e.target);
      }
    }
    return this._outAdj;
  }

  private get inAdj(): Map<string, Set<string>> {
    if (!this._inAdj) {
      this._inAdj = new Map(this.nodes.map((n) => [n.id, new Set<string>()]));
      for (const e of this.edges) {
        let s = this._inAdj.get(e.target);
        if (!s) { s = new Set(); this._inAdj.set(e.target, s); }
        s.add(e.source);
      }
    }
    return this._inAdj;
  }

  private get undirAdj(): Map<string, Set<string>> {
    if (!this._undirAdj) {
      this._undirAdj = new Map(this.nodes.map((n) => [n.id, new Set<string>()]));
      for (const e of this.edges) {
        let s = this._undirAdj.get(e.source);
        if (!s) { s = new Set(); this._undirAdj.set(e.source, s); }
        s.add(e.target);

        let t = this._undirAdj.get(e.target);
        if (!t) { t = new Set(); this._undirAdj.set(e.target, t); }
        t.add(e.source);
      }
    }
    return this._undirAdj;
  }

  // ─── Basic metrics ────────────────────────────────────────────────────────

  /** Number of nodes */
  get nodeCount(): number {
    return this.nodes.length;
  }

  /** Number of edges */
  get edgeCount(): number {
    return this.edges.length;
  }

  /**
   * Graph density: ratio of actual edges to maximum possible edges.
   * For a directed graph: E / (N*(N-1))
   */
  density(): number {
    const n = this.nodes.length;
    if (n < 2) return 0;
    return this.edges.length / (n * (n - 1));
  }

  // ─── Degree distribution ─────────────────────────────────────────────────

  degreeDistribution(): DegreeDistribution {
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    const totalDeg = new Map<string, number>();

    for (const n of this.nodes) {
      inDeg.set(n.id, 0);
      outDeg.set(n.id, 0);
    }

    for (const e of this.edges) {
      outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    }

    let maxDeg = 0;
    const distribution = new Map<number, number>();

    for (const n of this.nodes) {
      const total = (inDeg.get(n.id) ?? 0) + (outDeg.get(n.id) ?? 0);
      totalDeg.set(n.id, total);
      if (total > maxDeg) maxDeg = total;
      distribution.set(total, (distribution.get(total) ?? 0) + 1);
    }

    const allDegrees = [...totalDeg.values()];
    const avg = allDegrees.length > 0 ? mean(allDegrees) : 0;

    return { inDegree: inDeg, outDegree: outDeg, totalDegree: totalDeg, distribution, max: maxDeg, avg };
  }

  // ─── Clustering coefficient ───────────────────────────────────────────────

  /**
   * Local clustering coefficient for each node (undirected interpretation).
   * C(v) = triangles(v) / (degree(v) * (degree(v) - 1) / 2)
   */
  clusteringCoefficient(): ClusteringResult {
    const local = new Map<string, number>();

    for (const node of this.nodes) {
      const neighbors = this.undirAdj.get(node.id) ?? new Set<string>();
      const k = neighbors.size;
      if (k < 2) {
        local.set(node.id, 0);
        continue;
      }

      const neighborArr = [...neighbors];
      let triangles = 0;

      for (let i = 0; i < neighborArr.length; i++) {
        for (let j = i + 1; j < neighborArr.length; j++) {
          const ni = neighborArr[i]!;
          const nj = neighborArr[j]!;
          const niNeighbors = this.undirAdj.get(ni) ?? new Set<string>();
          if (niNeighbors.has(nj)) triangles++;
        }
      }

      local.set(node.id, (2 * triangles) / (k * (k - 1)));
    }

    const values = [...local.values()];
    const global = values.length > 0 ? mean(values) : 0;

    return { local, global };
  }

  // ─── Path length / diameter ───────────────────────────────────────────────

  /**
   * BFS from a single source; returns distances to all reachable nodes.
   */
  private bfs(source: string, directed = true): Map<string, number> {
    const dist = new Map<string, number>();
    dist.set(source, 0);
    const queue: string[] = [source];
    const adj = directed ? this.outAdj : this.undirAdj;

    while (queue.length > 0) {
      const node = queue.shift()!;
      const d = dist.get(node)!;
      const neighbors = adj.get(node) ?? new Set<string>();
      for (const nb of neighbors) {
        if (!dist.has(nb)) {
          dist.set(nb, d + 1);
          queue.push(nb);
        }
      }
    }

    return dist;
  }

  /**
   * Approximate average path length using sampling (BFS from sampleSize nodes).
   * For large graphs, full computation is O(N*(N+E)) which is prohibitive.
   */
  averagePathLength(sampleSize = 50): number {
    const nodeIds = this.nodes.map((n) => n.id);
    if (nodeIds.length < 2) return 0;

    const sample = nodeIds.length <= sampleSize
      ? nodeIds
      : this.randomSample(nodeIds, sampleSize);

    let totalDist = 0;
    let pairCount = 0;

    for (const src of sample) {
      const dists = this.bfs(src, false);
      for (const [tgt, d] of dists) {
        if (tgt !== src && d > 0) {
          totalDist += d;
          pairCount++;
        }
      }
    }

    return pairCount === 0 ? 0 : totalDist / pairCount;
  }

  /**
   * Estimate graph diameter using sampling.
   */
  diameterEstimate(sampleSize = 50): number {
    const nodeIds = this.nodes.map((n) => n.id);
    if (nodeIds.length < 2) return 0;

    const sample = nodeIds.length <= sampleSize
      ? nodeIds
      : this.randomSample(nodeIds, sampleSize);

    let maxDist = 0;

    for (const src of sample) {
      const dists = this.bfs(src, false);
      for (const d of dists.values()) {
        if (d > maxDist) maxDist = d;
      }
    }

    return maxDist;
  }

  // ─── Centrality algorithms ────────────────────────────────────────────────

  /**
   * Betweenness centrality (Brandes algorithm).
   * Counts for each node the fraction of shortest paths passing through it.
   */
  betweennessCentrality(normalized = true): CentralityScores {
    const nodeIds = this.nodes.map((n) => n.id);
    const bc = new Map<string, number>(nodeIds.map((id) => [id, 0]));

    for (const src of nodeIds) {
      // Stack of nodes in reverse BFS order
      const stack: string[] = [];
      // Predecessors on shortest paths
      const pred = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
      // Number of shortest paths from src to each node
      const sigma = new Map<string, number>(nodeIds.map((id) => [id, 0]));
      sigma.set(src, 1);
      const dist = new Map<string, number>(nodeIds.map((id) => [id, -1]));
      dist.set(src, 0);

      const queue: string[] = [src];

      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);
        const neighbors = this.outAdj.get(v) ?? new Set<string>();
        for (const w of neighbors) {
          // First visit?
          if ((dist.get(w) ?? -1) < 0) {
            queue.push(w);
            dist.set(w, (dist.get(v) ?? 0) + 1);
          }
          // Is this a shortest path?
          if ((dist.get(w) ?? -1) === (dist.get(v) ?? -1) + 1) {
            sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
            pred.get(w)!.push(v);
          }
        }
      }

      // Accumulation
      const delta = new Map<string, number>(nodeIds.map((id) => [id, 0]));
      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of pred.get(w) ?? []) {
          const sigmaV = sigma.get(v) ?? 1;
          const sigmaW = sigma.get(w) ?? 1;
          const deltaW = delta.get(w) ?? 0;
          delta.set(v, (delta.get(v) ?? 0) + (sigmaV / sigmaW) * (1 + deltaW));
        }
        if (w !== src) {
          bc.set(w, (bc.get(w) ?? 0) + (delta.get(w) ?? 0));
        }
      }
    }

    if (normalized) {
      const n = nodeIds.length;
      const factor = n > 2 ? 1 / ((n - 1) * (n - 2)) : 1;
      for (const [id, val] of bc) {
        bc.set(id, val * factor);
      }
    }

    return makeCentralityScores(bc);
  }

  /**
   * Closeness centrality: reciprocal of the average shortest path distance
   * from a node to all other reachable nodes.
   */
  closenessCentrality(normalized = true): CentralityScores {
    const nodeIds = this.nodes.map((n) => n.id);
    const cc = new Map<string, number>();

    for (const src of nodeIds) {
      const dists = this.bfs(src, false);
      let totalDist = 0;
      let reachable = 0;

      for (const [tgt, d] of dists) {
        if (tgt !== src && d > 0) {
          totalDist += d;
          reachable++;
        }
      }

      if (reachable === 0 || totalDist === 0) {
        cc.set(src, 0);
      } else {
        let closeness = reachable / totalDist;
        if (normalized) {
          // Normalize by fraction of reachable nodes
          closeness *= reachable / (nodeIds.length - 1);
        }
        cc.set(src, closeness);
      }
    }

    return makeCentralityScores(cc);
  }

  /**
   * Eigenvector centrality via power iteration.
   * Converges to the leading eigenvector of the adjacency matrix.
   */
  eigenvectorCentrality(
    maxIterations = 100,
    tolerance = 1e-6
  ): CentralityScores {
    const nodeIds = this.nodes.map((n) => n.id);
    const n = nodeIds.length;
    if (n === 0) return makeCentralityScores(new Map());

    // Initialize scores uniformly
    let scores = new Map<string, number>(nodeIds.map((id) => [id, 1 / n]));

    for (let iter = 0; iter < maxIterations; iter++) {
      const newScores = new Map<string, number>(nodeIds.map((id) => [id, 0]));

      for (const nodeId of nodeIds) {
        const neighbors = this.inAdj.get(nodeId) ?? new Set<string>();
        let sum = 0;
        for (const nb of neighbors) {
          sum += scores.get(nb) ?? 0;
        }
        newScores.set(nodeId, sum);
      }

      // Normalize by L2 norm
      let norm = 0;
      for (const v of newScores.values()) norm += v * v;
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (const [id, val] of newScores) {
          newScores.set(id, val / norm);
        }
      }

      // Check convergence
      let diff = 0;
      for (const id of nodeIds) {
        diff += Math.abs((newScores.get(id) ?? 0) - (scores.get(id) ?? 0));
      }

      scores = newScores;
      if (diff < tolerance) break;
    }

    return makeCentralityScores(scores);
  }

  // ─── HITS algorithm ───────────────────────────────────────────────────────

  /**
   * Hyperlink-Induced Topic Search (HITS) algorithm.
   * Returns hub and authority scores.
   */
  hits(maxIterations = 100, tolerance = 1e-6): HITSResult {
    const nodeIds = this.nodes.map((n) => n.id);
    const n = nodeIds.length;
    if (n === 0) return { hubs: new Map(), authorities: new Map() };

    let hubs = new Map<string, number>(nodeIds.map((id) => [id, 1 / n]));
    let authorities = new Map<string, number>(nodeIds.map((id) => [id, 1 / n]));

    for (let iter = 0; iter < maxIterations; iter++) {
      // Update authorities: a(v) = sum of hub scores of all nodes pointing to v
      const newAuth = new Map<string, number>(nodeIds.map((id) => [id, 0]));
      for (const nodeId of nodeIds) {
        const inNeighbors = this.inAdj.get(nodeId) ?? new Set<string>();
        let sum = 0;
        for (const nb of inNeighbors) {
          sum += hubs.get(nb) ?? 0;
        }
        newAuth.set(nodeId, sum);
      }

      // Update hubs: h(v) = sum of authority scores of all nodes v points to
      const newHubs = new Map<string, number>(nodeIds.map((id) => [id, 0]));
      for (const nodeId of nodeIds) {
        const outNeighbors = this.outAdj.get(nodeId) ?? new Set<string>();
        let sum = 0;
        for (const nb of outNeighbors) {
          sum += newAuth.get(nb) ?? 0;
        }
        newHubs.set(nodeId, sum);
      }

      // Normalize
      let authNorm = 0;
      let hubNorm = 0;
      for (const v of newAuth.values()) authNorm += v * v;
      for (const v of newHubs.values()) hubNorm += v * v;
      authNorm = Math.sqrt(authNorm);
      hubNorm = Math.sqrt(hubNorm);

      if (authNorm > 0) {
        for (const [id, val] of newAuth) newAuth.set(id, val / authNorm);
      }
      if (hubNorm > 0) {
        for (const [id, val] of newHubs) newHubs.set(id, val / hubNorm);
      }

      // Check convergence
      let diff = 0;
      for (const id of nodeIds) {
        diff += Math.abs((newAuth.get(id) ?? 0) - (authorities.get(id) ?? 0));
        diff += Math.abs((newHubs.get(id) ?? 0) - (hubs.get(id) ?? 0));
      }

      authorities = newAuth;
      hubs = newHubs;
      if (diff < tolerance) break;
    }

    return { hubs, authorities };
  }

  // ─── Connected components ─────────────────────────────────────────────────

  /**
   * Strongly connected components using Tarjan's algorithm.
   */
  stronglyConnectedComponents(): SCCResult {
    const nodeIds = this.nodes.map((n) => n.id);
    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Map<string, boolean>();
    const stack: string[] = [];
    const components: string[][] = [];
    let counter = 0;

    const strongConnect = (v: string): void => {
      index.set(v, counter);
      lowlink.set(v, counter);
      counter++;
      stack.push(v);
      onStack.set(v, true);

      const neighbors = this.outAdj.get(v) ?? new Set<string>();
      for (const w of neighbors) {
        if (!index.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.get(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
        }
      }

      // Root of SCC
      if (lowlink.get(v) === index.get(v)) {
        const component: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.set(w, false);
          component.push(w);
        } while (w !== v);
        components.push(component);
      }
    };

    for (const nodeId of nodeIds) {
      if (!index.has(nodeId)) {
        strongConnect(nodeId);
      }
    }

    const largestSize = components.reduce((max, c) => Math.max(max, c.length), 0);
    return { components, count: components.length, largestSize };
  }

  /**
   * Weakly connected components using Union-Find.
   * Treats the graph as undirected.
   */
  weaklyConnectedComponents(): WCCResult {
    const uf = new UnionFind(this.nodes.map((n) => n.id));

    for (const e of this.edges) {
      uf.union(e.source, e.target);
    }

    const componentMap = uf.getComponents();
    const components = [...componentMap.values()];
    const largestSize = components.reduce((max, c) => Math.max(max, c.length), 0);

    return { components, count: components.length, largestSize };
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private randomSample<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy.slice(0, n);
  }

  /** Invalidate cached adjacency structures (call after adding nodes/edges) */
  invalidateCache(): void {
    this._outAdj = null;
    this._inAdj = null;
    this._undirAdj = null;
  }

  /** Update the graph data */
  update(nodes: GraphNode[], edges: GraphEdge[]): void {
    this.nodes = nodes;
    this.edges = edges;
    this.invalidateCache();
  }
}
