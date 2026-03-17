/**
 * Link prediction algorithms:
 * - Common Neighbors
 * - Jaccard Coefficient
 * - Adamic-Adar
 * - Preferential Attachment
 * - Katz Index (weighted path counting)
 * - Top-K most likely new edges
 */
import type { Graph } from "../graph.js";

export interface LinkScore {
  source: string;
  target: string;
  score: number;
  method: string;
}

/**
 * Get undirected neighbor set for a node.
 */
function neighborSet(graph: Graph, nodeId: string): Set<string> {
  return new Set(graph.getNeighbors(nodeId, "both"));
}

/**
 * Common Neighbors: |N(u) ∩ N(v)|
 */
export function commonNeighborsScore(
  graph: Graph,
  u: string,
  v: string,
): number {
  const nu = neighborSet(graph, u);
  const nv = neighborSet(graph, v);
  let count = 0;
  for (const n of nu) if (nv.has(n)) count++;
  return count;
}

/**
 * Jaccard Coefficient: |N(u) ∩ N(v)| / |N(u) ∪ N(v)|
 */
export function jaccardScore(graph: Graph, u: string, v: string): number {
  const nu = neighborSet(graph, u);
  const nv = neighborSet(graph, v);
  let intersection = 0;
  for (const n of nu) if (nv.has(n)) intersection++;
  const union = nu.size + nv.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Adamic-Adar: sum of 1/log(|N(z)|) for z in N(u) ∩ N(v)
 */
export function adamicAdarScore(graph: Graph, u: string, v: string): number {
  const nu = neighborSet(graph, u);
  const nv = neighborSet(graph, v);
  let score = 0;
  for (const z of nu) {
    if (nv.has(z)) {
      const degree = graph.getNeighbors(z, "both").length;
      if (degree > 1) score += 1 / Math.log(degree);
    }
  }
  return score;
}

/**
 * Preferential Attachment: |N(u)| * |N(v)|
 */
export function preferentialAttachmentScore(
  graph: Graph,
  u: string,
  v: string,
): number {
  return (
    graph.getNeighbors(u, "both").length * graph.getNeighbors(v, "both").length
  );
}

/**
 * Resource Allocation: sum of 1/|N(z)| for z in N(u) ∩ N(v)
 */
export function resourceAllocationScore(
  graph: Graph,
  u: string,
  v: string,
): number {
  const nu = neighborSet(graph, u);
  const nv = neighborSet(graph, v);
  let score = 0;
  for (const z of nu) {
    if (nv.has(z)) {
      const degree = graph.getNeighbors(z, "both").length;
      if (degree > 0) score += 1 / degree;
    }
  }
  return score;
}

/**
 * Katz Index: sum over all paths of beta^|path| weighted count.
 * beta < 1 penalizes longer paths.
 * Computed via matrix powers (approximated up to maxHops).
 */
export function katzIndex(
  graph: Graph,
  u: string,
  v: string,
  options: { beta?: number; maxHops?: number } = {},
): number {
  const { beta = 0.005, maxHops = 5 } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node.id, graph.getNeighbors(node.id, "both"));
  }

  // BFS-style path counting up to maxHops
  // paths[hop][node] = number of paths of length hop from u to node
  let currentPaths = new Map<string, number>();
  currentPaths.set(u, 1);

  let katzScore = 0;

  for (let hop = 1; hop <= maxHops; hop++) {
    const nextPaths = new Map<string, number>();
    for (const [node, count] of currentPaths) {
      for (const neighbor of adj.get(node) ?? []) {
        nextPaths.set(neighbor, (nextPaths.get(neighbor) ?? 0) + count);
      }
    }
    katzScore += Math.pow(beta, hop) * (nextPaths.get(v) ?? 0);
    currentPaths = nextPaths;
  }

  return katzScore;
}

/**
 * Score all non-existing edges using a given metric.
 */
function scoreAllNonEdges(
  graph: Graph,
  method: "common-neighbors" | "jaccard" | "adamic-adar" | "preferential" | "resource-allocation" | "katz",
  options: { beta?: number; maxHops?: number; directed?: boolean } = {},
): LinkScore[] {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const scores: LinkScore[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const u = nodes[i]!;
      const v = nodes[j]!;

      // Skip existing edges
      const hasEdge =
        graph.getEdgesBetween(u, v).length > 0 ||
        graph.getEdgesBetween(v, u).length > 0;
      if (hasEdge) continue;

      let score: number;
      switch (method) {
        case "common-neighbors":
          score = commonNeighborsScore(graph, u, v);
          break;
        case "jaccard":
          score = jaccardScore(graph, u, v);
          break;
        case "adamic-adar":
          score = adamicAdarScore(graph, u, v);
          break;
        case "preferential":
          score = preferentialAttachmentScore(graph, u, v);
          break;
        case "resource-allocation":
          score = resourceAllocationScore(graph, u, v);
          break;
        case "katz":
          score = katzIndex(graph, u, v, options);
          break;
      }

      scores.push({ source: u, target: v, score, method });
    }
  }

  return scores;
}

/**
 * Predict top-K most likely new edges using the specified method.
 */
export function predictTopKEdges(
  graph: Graph,
  k: number,
  method: "common-neighbors" | "jaccard" | "adamic-adar" | "preferential" | "resource-allocation" | "katz" = "jaccard",
  options: { beta?: number; maxHops?: number } = {},
): LinkScore[] {
  const allScores = scoreAllNonEdges(graph, method, options);
  return allScores
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Ensemble link prediction: average scores from multiple methods.
 */
export function ensembleLinkPrediction(
  graph: Graph,
  k: number,
  methods: Array<"common-neighbors" | "jaccard" | "adamic-adar" | "preferential" | "resource-allocation"> = [
    "jaccard",
    "adamic-adar",
    "resource-allocation",
  ],
): LinkScore[] {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const ensembleScores = new Map<string, number>();

  for (const method of methods) {
    const scores = scoreAllNonEdges(graph, method);
    // Normalize scores to [0,1] for each method
    const maxScore = scores.reduce((m, s) => Math.max(m, s.score), 0);
    for (const { source, target, score } of scores) {
      const key = `${source}:${target}`;
      ensembleScores.set(
        key,
        (ensembleScores.get(key) ?? 0) + (maxScore > 0 ? score / maxScore : 0),
      );
    }
  }

  return Array.from(ensembleScores.entries())
    .map(([key, score]) => {
      const [source, target] = key.split(":");
      return { source: source!, target: target!, score: score / methods.length, method: "ensemble" };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Evaluate link prediction quality using leave-one-out on existing edges.
 * Returns AUC approximation.
 */
export function evaluateLinkPrediction(
  graph: Graph,
  method: "common-neighbors" | "jaccard" | "adamic-adar" | "preferential" | "resource-allocation" = "jaccard",
  sampleSize: number = 100,
): { auc: number; method: string } {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const allEdges = graph.getAllNodes()
    .flatMap((n) => graph.getEdgesForNode(n.id).filter((e) => e.source === n.id));

  if (allEdges.length === 0) return { auc: 0.5, method };

  let positiveRank = 0;
  let comparisons = 0;

  // Sample positive edges
  const sampleEdges = allEdges.slice(0, Math.min(sampleSize, allEdges.length));

  for (const edge of sampleEdges) {
    const posScore = (() => {
      switch (method) {
        case "common-neighbors": return commonNeighborsScore(graph, edge.source, edge.target);
        case "jaccard": return jaccardScore(graph, edge.source, edge.target);
        case "adamic-adar": return adamicAdarScore(graph, edge.source, edge.target);
        case "preferential": return preferentialAttachmentScore(graph, edge.source, edge.target);
        case "resource-allocation": return resourceAllocationScore(graph, edge.source, edge.target);
      }
    })();

    // Compare against a random non-edge
    const u = nodes[Math.floor(Math.random() * nodes.length)]!;
    const v = nodes[Math.floor(Math.random() * nodes.length)]!;
    if (u === v || graph.getEdgesBetween(u, v).length > 0) continue;

    const negScore = (() => {
      switch (method) {
        case "common-neighbors": return commonNeighborsScore(graph, u, v);
        case "jaccard": return jaccardScore(graph, u, v);
        case "adamic-adar": return adamicAdarScore(graph, u, v);
        case "preferential": return preferentialAttachmentScore(graph, u, v);
        case "resource-allocation": return resourceAllocationScore(graph, u, v);
      }
    })();

    if (posScore > negScore) positiveRank++;
    else if (posScore === negScore) positiveRank += 0.5;
    comparisons++;
  }

  return { auc: comparisons > 0 ? positiveRank / comparisons : 0.5, method };
}
