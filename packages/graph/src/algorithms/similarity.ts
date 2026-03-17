/**
 * Node similarity metrics:
 * - Jaccard similarity
 * - Adamic-Adar index
 * - Common neighbors
 * - Preferential attachment
 * - Resource allocation index
 * - SimRank (recursive structural similarity)
 * - Top-K similar nodes
 */
import type { Graph } from "../graph.js";

export interface SimilarityResult {
  nodeA: string;
  nodeB: string;
  score: number;
  metric: string;
}

/**
 * Get the set of neighbors for a node (undirected view).
 */
function getNeighborSet(graph: Graph, nodeId: string): Set<string> {
  return new Set(graph.getNeighbors(nodeId, "both"));
}

/**
 * Common neighbors count between two nodes.
 */
export function commonNeighbors(
  graph: Graph,
  nodeA: string,
  nodeB: string,
): number {
  const neighborsA = getNeighborSet(graph, nodeA);
  const neighborsB = getNeighborSet(graph, nodeB);
  let count = 0;
  for (const n of neighborsA) {
    if (neighborsB.has(n)) count++;
  }
  return count;
}

/**
 * Jaccard similarity: |N(u) ∩ N(v)| / |N(u) ∪ N(v)|
 */
export function jaccardSimilarity(
  graph: Graph,
  nodeA: string,
  nodeB: string,
): number {
  const neighborsA = getNeighborSet(graph, nodeA);
  const neighborsB = getNeighborSet(graph, nodeB);

  let intersection = 0;
  for (const n of neighborsA) {
    if (neighborsB.has(n)) intersection++;
  }

  const union = neighborsA.size + neighborsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Adamic-Adar index: sum of 1/log(|N(z)|) for z in N(u) ∩ N(v)
 */
export function adamicAdar(
  graph: Graph,
  nodeA: string,
  nodeB: string,
): number {
  const neighborsA = getNeighborSet(graph, nodeA);
  const neighborsB = getNeighborSet(graph, nodeB);

  let score = 0;
  for (const z of neighborsA) {
    if (neighborsB.has(z)) {
      const degree = graph.getNeighbors(z, "both").length;
      if (degree > 1) {
        score += 1 / Math.log(degree);
      }
    }
  }
  return score;
}

/**
 * Preferential attachment: |N(u)| * |N(v)|
 */
export function preferentialAttachment(
  graph: Graph,
  nodeA: string,
  nodeB: string,
): number {
  const degreeA = graph.getNeighbors(nodeA, "both").length;
  const degreeB = graph.getNeighbors(nodeB, "both").length;
  return degreeA * degreeB;
}

/**
 * Resource allocation index: sum of 1/|N(z)| for z in N(u) ∩ N(v)
 */
export function resourceAllocation(
  graph: Graph,
  nodeA: string,
  nodeB: string,
): number {
  const neighborsA = getNeighborSet(graph, nodeA);
  const neighborsB = getNeighborSet(graph, nodeB);

  let score = 0;
  for (const z of neighborsA) {
    if (neighborsB.has(z)) {
      const degree = graph.getNeighbors(z, "both").length;
      if (degree > 0) score += 1 / degree;
    }
  }
  return score;
}

/**
 * SimRank: recursive structural similarity.
 * SimRank(u, v) = C * sum_i sum_j SimRank(in(u)[i], in(v)[j]) / (|in(u)| * |in(v)|)
 * where in(u) are in-neighbors of u.
 */
export function simRank(
  graph: Graph,
  options: {
    decayFactor?: number;
    maxIterations?: number;
    tolerance?: number;
  } = {},
): Map<string, Map<string, number>> {
  const { decayFactor = 0.8, maxIterations = 10, tolerance = 1e-4 } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;

  // Initialize SimRank matrix: sim[u][v] = 1 if u==v else 0
  let sim = new Map<string, Map<string, number>>();
  for (const u of nodes) {
    sim.set(u, new Map());
    for (const v of nodes) {
      sim.get(u)!.set(v, u === v ? 1 : 0);
    }
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    const newSim = new Map<string, Map<string, number>>();
    for (const u of nodes) {
      newSim.set(u, new Map());
      for (const v of nodes) {
        newSim.get(u)!.set(v, u === v ? 1 : 0);
      }
    }

    let maxChange = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const u = nodes[i]!;
        const v = nodes[j]!;

        const inU = graph.getNeighbors(u, "incoming");
        const inV = graph.getNeighbors(v, "incoming");

        if (inU.length === 0 || inV.length === 0) {
          newSim.get(u)!.set(v, 0);
          newSim.get(v)!.set(u, 0);
          continue;
        }

        let sum = 0;
        for (const a of inU) {
          for (const b of inV) {
            sum += sim.get(a)?.get(b) ?? 0;
          }
        }

        const score = (decayFactor / (inU.length * inV.length)) * sum;
        newSim.get(u)!.set(v, score);
        newSim.get(v)!.set(u, score);

        maxChange = Math.max(maxChange, Math.abs(score - (sim.get(u)?.get(v) ?? 0)));
      }
    }

    sim = newSim;
    if (maxChange < tolerance) break;
  }

  return sim;
}

/**
 * Return top-K most similar nodes to a given node using Jaccard similarity.
 */
export function topKSimilarNodes(
  graph: Graph,
  nodeId: string,
  k: number,
  metric: "jaccard" | "adamic-adar" | "resource-allocation" | "common-neighbors" | "preferential" = "jaccard",
): Array<{ nodeId: string; score: number }> {
  const nodes = graph.getAllNodes().map((n) => n.id).filter((id) => id !== nodeId);
  const scores: Array<{ nodeId: string; score: number }> = [];

  for (const other of nodes) {
    let score: number;
    switch (metric) {
      case "jaccard":
        score = jaccardSimilarity(graph, nodeId, other);
        break;
      case "adamic-adar":
        score = adamicAdar(graph, nodeId, other);
        break;
      case "resource-allocation":
        score = resourceAllocation(graph, nodeId, other);
        break;
      case "common-neighbors":
        score = commonNeighbors(graph, nodeId, other);
        break;
      case "preferential":
        score = preferentialAttachment(graph, nodeId, other);
        break;
    }
    scores.push({ nodeId: other, score });
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * Compute pairwise similarity matrix for all node pairs.
 */
export function similarityMatrix(
  graph: Graph,
  metric: "jaccard" | "adamic-adar" | "resource-allocation" = "jaccard",
): Map<string, Map<string, number>> {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const matrix = new Map<string, Map<string, number>>();

  for (const u of nodes) {
    matrix.set(u, new Map());
    for (const v of nodes) {
      let score: number;
      if (u === v) {
        score = 1;
      } else {
        switch (metric) {
          case "jaccard":
            score = jaccardSimilarity(graph, u, v);
            break;
          case "adamic-adar":
            score = adamicAdar(graph, u, v);
            break;
          case "resource-allocation":
            score = resourceAllocation(graph, u, v);
            break;
        }
      }
      matrix.get(u)!.set(v, score);
    }
  }

  return matrix;
}
