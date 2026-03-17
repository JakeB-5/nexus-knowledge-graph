/**
 * Betweenness centrality using Brandes' algorithm.
 * O(VE) for unweighted graphs, O(VE + V^2 log V) for weighted.
 */
import type { Graph } from "../graph.js";

export interface BetweennessResult {
  scores: Map<string, number>;
  normalized: boolean;
}

/**
 * Compute betweenness centrality for all nodes using Brandes' algorithm.
 * For directed graphs, counts directed shortest paths.
 */
export function betweennessCentrality(
  graph: Graph,
  options: { normalized?: boolean; directed?: boolean } = {},
): BetweennessResult {
  const { normalized = true, directed = true } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;

  // Initialize centrality scores
  const cb = new Map<string, number>();
  for (const v of nodes) cb.set(v, 0);

  for (const s of nodes) {
    // Stack of visited nodes in order of non-increasing distance
    const stack: string[] = [];
    // Predecessors on shortest paths from s
    const pred = new Map<string, string[]>();
    for (const v of nodes) pred.set(v, []);

    // Number of shortest paths from s to v
    const sigma = new Map<string, number>();
    for (const v of nodes) sigma.set(v, 0);
    sigma.set(s, 1);

    // Distance from s to v
    const dist = new Map<string, number>();
    for (const v of nodes) dist.set(v, -1);
    dist.set(s, 0);

    // BFS queue
    const queue: string[] = [s];

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);

      const neighbors = directed
        ? graph.getNeighbors(v, "outgoing")
        : graph.getNeighbors(v, "both");

      for (const w of neighbors) {
        // First time visiting w?
        if (dist.get(w) === -1) {
          queue.push(w);
          dist.set(w, dist.get(v)! + 1);
        }
        // Is this a shortest path to w via v?
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    // Accumulation: back-propagate dependency
    const delta = new Map<string, number>();
    for (const v of nodes) delta.set(v, 0);

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        const coeff =
          (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + coeff);
      }
      if (w !== s) {
        cb.set(w, cb.get(w)! + delta.get(w)!);
      }
    }
  }

  // Normalization factor
  if (normalized && n > 2) {
    const factor = directed ? (n - 1) * (n - 2) : ((n - 1) * (n - 2)) / 2;
    for (const [v, score] of cb) {
      cb.set(v, score / factor);
    }
  }

  return { scores: cb, normalized };
}

/**
 * Return top-K nodes by betweenness centrality score.
 */
export function topKByBetweenness(
  graph: Graph,
  k: number,
  options: { normalized?: boolean; directed?: boolean } = {},
): Array<{ nodeId: string; score: number }> {
  const { scores } = betweennessCentrality(graph, options);
  return Array.from(scores.entries())
    .map(([nodeId, score]) => ({ nodeId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Approximate betweenness centrality using k random pivot nodes (faster for large graphs).
 */
export function approximateBetweenness(
  graph: Graph,
  pivots: number,
  options: { normalized?: boolean; directed?: boolean; seed?: number } = {},
): BetweennessResult {
  const { normalized = true, directed = true } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;
  const cb = new Map<string, number>();
  for (const v of nodes) cb.set(v, 0);

  // Simple deterministic pivot selection (every n/pivots-th node)
  const step = Math.max(1, Math.floor(n / pivots));
  const selectedPivots = nodes.filter((_, i) => i % step === 0);

  for (const s of selectedPivots) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    for (const v of nodes) {
      pred.set(v, []);
      sigma.set(v, 0);
      dist.set(v, -1);
    }
    sigma.set(s, 1);
    dist.set(s, 0);

    const queue: string[] = [s];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      const neighbors = directed
        ? graph.getNeighbors(v, "outgoing")
        : graph.getNeighbors(v, "both");
      for (const w of neighbors) {
        if (dist.get(w) === -1) {
          queue.push(w);
          dist.set(w, dist.get(v)! + 1);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    const delta = new Map<string, number>();
    for (const v of nodes) delta.set(v, 0);
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        const coeff = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + coeff);
      }
      if (w !== s) cb.set(w, cb.get(w)! + delta.get(w)!);
    }
  }

  // Scale by n / pivots to approximate full betweenness
  const scale = n / selectedPivots.length;
  for (const [v, score] of cb) cb.set(v, score * scale);

  if (normalized && n > 2) {
    const factor = directed ? (n - 1) * (n - 2) : ((n - 1) * (n - 2)) / 2;
    for (const [v, score] of cb) cb.set(v, score / factor);
  }

  return { scores: cb, normalized };
}
