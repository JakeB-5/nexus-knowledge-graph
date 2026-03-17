/**
 * Closeness centrality and harmonic closeness centrality.
 * Harmonic closeness handles disconnected graphs gracefully.
 */
import type { Graph } from "../graph.js";

export interface ClosenessResult {
  scores: Map<string, number>;
  type: "closeness" | "harmonic";
}

/**
 * BFS from a source node, returns distance map.
 */
function bfsDistances(
  graph: Graph,
  source: string,
  directed: boolean,
): Map<string, number> {
  const dist = new Map<string, number>();
  dist.set(source, 0);
  const queue: string[] = [source];

  while (queue.length > 0) {
    const v = queue.shift()!;
    const neighbors = directed
      ? graph.getNeighbors(v, "outgoing")
      : graph.getNeighbors(v, "both");

    for (const w of neighbors) {
      if (!dist.has(w)) {
        dist.set(w, dist.get(v)! + 1);
        queue.push(w);
      }
    }
  }

  return dist;
}

/**
 * Classical closeness centrality.
 * C(v) = (n-1) / sum of distances to all reachable nodes.
 * For disconnected graphs, only considers reachable nodes (Wasserman-Faust variant).
 */
export function closenessCentrality(
  graph: Graph,
  options: { directed?: boolean; normalized?: boolean } = {},
): ClosenessResult {
  const { directed = true, normalized = true } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;
  const scores = new Map<string, number>();

  for (const v of nodes) {
    const dist = bfsDistances(graph, v, directed);
    // Sum distances to all reachable nodes (excluding self)
    let totalDist = 0;
    let reachable = 0;
    for (const [w, d] of dist) {
      if (w !== v) {
        totalDist += d;
        reachable++;
      }
    }

    if (totalDist === 0 || reachable === 0) {
      scores.set(v, 0);
    } else {
      let score = reachable / totalDist;
      // Normalize by (reachable / (n-1)) to account for disconnected components
      if (normalized && n > 1) {
        score = score * (reachable / (n - 1));
      }
      scores.set(v, score);
    }
  }

  return { scores, type: "closeness" };
}

/**
 * Harmonic closeness centrality.
 * H(v) = sum of 1/d(v,w) for all w != v (where 1/inf = 0).
 * Handles disconnected graphs naturally.
 */
export function harmonicClosenessCentrality(
  graph: Graph,
  options: { directed?: boolean; normalized?: boolean } = {},
): ClosenessResult {
  const { directed = true, normalized = true } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;
  const scores = new Map<string, number>();

  for (const v of nodes) {
    const dist = bfsDistances(graph, v, directed);
    let harmonicSum = 0;

    for (const [w, d] of dist) {
      if (w !== v && d > 0) {
        harmonicSum += 1 / d;
      }
    }

    let score = harmonicSum;
    if (normalized && n > 1) {
      score = harmonicSum / (n - 1);
    }
    scores.set(v, score);
  }

  return { scores, type: "harmonic" };
}

/**
 * Return top-K nodes by closeness centrality.
 */
export function topKByCloseness(
  graph: Graph,
  k: number,
  options: { directed?: boolean; normalized?: boolean; harmonic?: boolean } = {},
): Array<{ nodeId: string; score: number }> {
  const { harmonic = false, ...rest } = options;
  const result = harmonic
    ? harmonicClosenessCentrality(graph, rest)
    : closenessCentrality(graph, rest);

  return Array.from(result.scores.entries())
    .map(([nodeId, score]) => ({ nodeId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Lin's closeness for disconnected graphs.
 * L(v) = reachable(v)^2 / ((n-1) * sum(distances)).
 */
export function linCloseness(
  graph: Graph,
  options: { directed?: boolean } = {},
): ClosenessResult {
  const { directed = true } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;
  const scores = new Map<string, number>();

  for (const v of nodes) {
    const dist = bfsDistances(graph, v, directed);
    let totalDist = 0;
    let reachable = 0;
    for (const [w, d] of dist) {
      if (w !== v) {
        totalDist += d;
        reachable++;
      }
    }

    if (totalDist === 0 || reachable === 0) {
      scores.set(v, 0);
    } else {
      scores.set(v, (reachable * reachable) / ((n - 1) * totalDist));
    }
  }

  return { scores, type: "closeness" };
}
