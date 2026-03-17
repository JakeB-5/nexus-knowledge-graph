import type { Graph } from "../graph.js";
import type { PageRankResult } from "../types.js";

export interface PageRankOptions {
  dampingFactor?: number;
  maxIterations?: number;
  tolerance?: number;
}

export function pageRank(
  graph: Graph,
  options: PageRankOptions = {},
): PageRankResult {
  const {
    dampingFactor = 0.85,
    maxIterations = 100,
    tolerance = 1e-6,
  } = options;

  const nodes = graph.getAllNodes();
  const n = nodes.length;

  if (n === 0) {
    return { scores: new Map(), iterations: 0, converged: true };
  }

  const initialScore = 1 / n;
  let scores = new Map<string, number>();
  let newScores = new Map<string, number>();

  // Initialize scores
  for (const node of nodes) {
    scores.set(node.id, initialScore);
  }

  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let maxDelta = 0;

    for (const node of nodes) {
      const incomingNeighbors = graph.getNeighbors(node.id, "incoming");
      let sum = 0;

      for (const neighborId of incomingNeighbors) {
        const outDegree = graph.getNeighbors(neighborId, "outgoing").length;
        if (outDegree > 0) {
          sum += (scores.get(neighborId) ?? 0) / outDegree;
        }
      }

      const newScore = (1 - dampingFactor) / n + dampingFactor * sum;
      newScores.set(node.id, newScore);

      const delta = Math.abs(newScore - (scores.get(node.id) ?? 0));
      if (delta > maxDelta) maxDelta = delta;
    }

    // Swap
    [scores, newScores] = [newScores, scores];

    if (maxDelta < tolerance) {
      converged = true;
      break;
    }
  }

  return { scores, iterations, converged };
}
