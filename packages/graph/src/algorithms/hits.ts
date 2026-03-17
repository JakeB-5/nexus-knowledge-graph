/**
 * HITS (Hyperlink-Induced Topic Search) algorithm.
 * Computes hub and authority scores for nodes in a directed graph.
 */
import type { Graph } from "../graph.js";

export interface HITSResult {
  hubs: Map<string, number>;
  authorities: Map<string, number>;
  iterations: number;
  converged: boolean;
}

export interface HITSOptions {
  maxIterations?: number;
  tolerance?: number;
  normalized?: boolean;
}

/**
 * Run the HITS algorithm on the given graph.
 * Hub score: how well the node points to good authorities.
 * Authority score: how well the node is pointed to by good hubs.
 */
export function hits(graph: Graph, options: HITSOptions = {}): HITSResult {
  const { maxIterations = 100, tolerance = 1e-6, normalized = true } = options;

  const nodes = graph.getAllNodes().map((n) => n.id);
  if (nodes.length === 0) {
    return {
      hubs: new Map(),
      authorities: new Map(),
      iterations: 0,
      converged: true,
    };
  }

  // Initialize all hub and authority scores to 1
  let hubs = new Map<string, number>();
  let authorities = new Map<string, number>();
  for (const v of nodes) {
    hubs.set(v, 1);
    authorities.set(v, 1);
  }

  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;

    // Update authority scores: auth(v) = sum of hub(u) for all u->v
    const newAuth = new Map<string, number>();
    for (const v of nodes) {
      const inNeighbors = graph.getNeighbors(v, "incoming");
      let authScore = 0;
      for (const u of inNeighbors) {
        authScore += hubs.get(u) ?? 0;
      }
      newAuth.set(v, authScore);
    }

    // Update hub scores: hub(v) = sum of auth(w) for all v->w
    const newHub = new Map<string, number>();
    for (const v of nodes) {
      const outNeighbors = graph.getNeighbors(v, "outgoing");
      let hubScore = 0;
      for (const w of outNeighbors) {
        hubScore += newAuth.get(w) ?? 0;
      }
      newHub.set(v, hubScore);
    }

    // Normalize scores to unit vector (L2 norm)
    const authNorm = l2Norm(newAuth);
    const hubNorm = l2Norm(newHub);

    for (const v of nodes) {
      newAuth.set(v, authNorm > 0 ? (newAuth.get(v) ?? 0) / authNorm : 0);
      newHub.set(v, hubNorm > 0 ? (newHub.get(v) ?? 0) / hubNorm : 0);
    }

    // Check convergence
    const authDiff = maxDiff(authorities, newAuth);
    const hubDiff = maxDiff(hubs, newHub);

    authorities = newAuth;
    hubs = newHub;

    if (authDiff < tolerance && hubDiff < tolerance) {
      converged = true;
      break;
    }
  }

  return { hubs, authorities, iterations, converged };
}

function l2Norm(scores: Map<string, number>): number {
  let sumSq = 0;
  for (const v of scores.values()) sumSq += v * v;
  return Math.sqrt(sumSq);
}

function maxDiff(a: Map<string, number>, b: Map<string, number>): number {
  let maxD = 0;
  for (const [k, va] of a) {
    const diff = Math.abs(va - (b.get(k) ?? 0));
    if (diff > maxD) maxD = diff;
  }
  return maxD;
}

/**
 * Return top-K nodes by hub score.
 */
export function topKHubs(
  graph: Graph,
  k: number,
  options: HITSOptions = {},
): Array<{ nodeId: string; score: number }> {
  const { hubs } = hits(graph, options);
  return Array.from(hubs.entries())
    .map(([nodeId, score]) => ({ nodeId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Return top-K nodes by authority score.
 */
export function topKAuthorities(
  graph: Graph,
  k: number,
  options: HITSOptions = {},
): Array<{ nodeId: string; score: number }> {
  const { authorities } = hits(graph, options);
  return Array.from(authorities.entries())
    .map(([nodeId, score]) => ({ nodeId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Weighted HITS that uses edge weights for score propagation.
 */
export function weightedHITS(
  graph: Graph,
  options: HITSOptions = {},
): HITSResult {
  const { maxIterations = 100, tolerance = 1e-6 } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);

  if (nodes.length === 0) {
    return { hubs: new Map(), authorities: new Map(), iterations: 0, converged: true };
  }

  let hubs = new Map<string, number>();
  let authorities = new Map<string, number>();
  for (const v of nodes) {
    hubs.set(v, 1);
    authorities.set(v, 1);
  }

  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;

    const newAuth = new Map<string, number>();
    for (const v of nodes) {
      const inEdges = graph.getEdgesForNode(v).filter((e) => e.target === v);
      let authScore = 0;
      for (const e of inEdges) {
        authScore += (hubs.get(e.source) ?? 0) * e.weight;
      }
      newAuth.set(v, authScore);
    }

    const newHub = new Map<string, number>();
    for (const v of nodes) {
      const outEdges = graph.getEdgesForNode(v).filter((e) => e.source === v);
      let hubScore = 0;
      for (const e of outEdges) {
        hubScore += (newAuth.get(e.target) ?? 0) * e.weight;
      }
      newHub.set(v, hubScore);
    }

    const authNorm = l2Norm(newAuth);
    const hubNorm = l2Norm(newHub);
    for (const v of nodes) {
      newAuth.set(v, authNorm > 0 ? (newAuth.get(v) ?? 0) / authNorm : 0);
      newHub.set(v, hubNorm > 0 ? (newHub.get(v) ?? 0) / hubNorm : 0);
    }

    const authDiff = maxDiff(authorities, newAuth);
    const hubDiff = maxDiff(hubs, newHub);
    authorities = newAuth;
    hubs = newHub;

    if (authDiff < tolerance && hubDiff < tolerance) {
      converged = true;
      break;
    }
  }

  return { hubs, authorities, iterations, converged };
}
