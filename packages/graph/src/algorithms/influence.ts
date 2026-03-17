/**
 * Influence maximization algorithms:
 * - Independent Cascade (IC) model
 * - Linear Threshold (LT) model
 * - Greedy influence maximization
 * - Monte Carlo influence spread estimation
 * - Seed set selection
 */
import type { Graph } from "../graph.js";

export interface InfluenceOptions {
  numSimulations?: number;
  propagationProbability?: number;
  seed?: number;
}

export interface InfluenceResult {
  seedSet: string[];
  estimatedSpread: number;
  marginalGains: number[];
}

/** Simple seeded PRNG */
function makePRNG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Simulate one run of the Independent Cascade model.
 * Each edge (u,v) propagates influence from u to v with probability p.
 * Returns the set of activated nodes.
 */
function simulateIC(
  graph: Graph,
  seeds: string[],
  propagationProb: number,
  rng: () => number,
): Set<string> {
  const activated = new Set<string>(seeds);
  const queue: string[] = [...seeds];

  while (queue.length > 0) {
    const v = queue.shift()!;
    for (const w of graph.getNeighbors(v, "outgoing")) {
      if (!activated.has(w)) {
        // Use edge weight as probability if available, else use propagationProb
        const edges = graph.getEdgesBetween(v, w);
        const prob = edges.length > 0
          ? Math.min(edges[0]!.weight, 1)
          : propagationProb;
        if (rng() < prob) {
          activated.add(w);
          queue.push(w);
        }
      }
    }
  }

  return activated;
}

/**
 * Simulate one run of the Linear Threshold model.
 * Each node v has a threshold theta(v) (uniform random).
 * v is activated if sum of influence from active neighbors >= theta(v).
 */
function simulateLT(
  graph: Graph,
  seeds: string[],
  rng: () => number,
): Set<string> {
  const nodes = graph.getAllNodes().map((n) => n.id);

  // Assign random thresholds
  const threshold = new Map<string, number>();
  for (const v of nodes) threshold.set(v, rng());

  // Compute total in-weight for each node (for normalization)
  const totalInWeight = new Map<string, number>();
  for (const v of nodes) {
    let w = 0;
    for (const u of graph.getNeighbors(v, "incoming")) {
      const edges = graph.getEdgesBetween(u, v);
      w += edges.length > 0 ? edges[0]!.weight : 1;
    }
    totalInWeight.set(v, w || 1);
  }

  const activated = new Set<string>(seeds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const v of nodes) {
      if (activated.has(v)) continue;

      // Compute influence from active neighbors
      let influence = 0;
      for (const u of graph.getNeighbors(v, "incoming")) {
        if (activated.has(u)) {
          const edges = graph.getEdgesBetween(u, v);
          const w = edges.length > 0 ? edges[0]!.weight : 1;
          influence += w / totalInWeight.get(v)!;
        }
      }

      if (influence >= threshold.get(v)!) {
        activated.add(v);
        changed = true;
      }
    }
  }

  return activated;
}

/**
 * Estimate influence spread of a seed set via Monte Carlo simulation.
 */
export function estimateInfluenceSpread(
  graph: Graph,
  seeds: string[],
  options: InfluenceOptions & { model?: "ic" | "lt" } = {},
): number {
  const {
    numSimulations = 100,
    propagationProbability = 0.1,
    seed = 42,
    model = "ic",
  } = options;

  const rng = makePRNG(seed);
  let totalActivated = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    const activated =
      model === "ic"
        ? simulateIC(graph, seeds, propagationProbability, rng)
        : simulateLT(graph, seeds, rng);
    totalActivated += activated.size;
  }

  return totalActivated / numSimulations;
}

/**
 * Greedy influence maximization.
 * At each step, adds the node with maximum marginal gain in influence spread.
 * O(k * V * numSimulations) time.
 */
export function greedyInfluenceMaximization(
  graph: Graph,
  k: number,
  options: InfluenceOptions & { model?: "ic" | "lt" } = {},
): InfluenceResult {
  const {
    numSimulations = 100,
    propagationProbability = 0.1,
    seed = 42,
    model = "ic",
  } = options;

  const nodes = graph.getAllNodes().map((n) => n.id);
  const seedSet: string[] = [];
  const marginalGains: number[] = [];
  let currentSpread = 0;

  for (let i = 0; i < k && i < nodes.length; i++) {
    let bestNode = "";
    let bestMarginalGain = -Infinity;

    for (const v of nodes) {
      if (seedSet.includes(v)) continue;

      const candidateSet = [...seedSet, v];
      const spread = estimateInfluenceSpread(graph, candidateSet, {
        numSimulations,
        propagationProbability,
        seed: seed + i * nodes.length + nodes.indexOf(v),
        model,
      });

      const marginalGain = spread - currentSpread;
      if (marginalGain > bestMarginalGain) {
        bestMarginalGain = marginalGain;
        bestNode = v;
      }
    }

    if (!bestNode) break;

    seedSet.push(bestNode);
    marginalGains.push(bestMarginalGain);
    currentSpread += bestMarginalGain;
  }

  return {
    seedSet,
    estimatedSpread: currentSpread,
    marginalGains,
  };
}

/**
 * Degree-heuristic seed selection (fast approximation).
 * Selects k nodes with highest out-degree as seeds.
 */
export function degreeHeuristicSeeds(
  graph: Graph,
  k: number,
): string[] {
  return graph
    .getAllNodes()
    .map((n) => ({
      id: n.id,
      degree: graph.getNeighbors(n.id, "outgoing").length,
    }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, k)
    .map((n) => n.id);
}

/**
 * PageRank-based seed selection.
 * Uses PageRank scores to identify influential nodes.
 */
export function pageRankSeeds(
  graph: Graph,
  k: number,
  options: { dampingFactor?: number; maxIterations?: number } = {},
): string[] {
  const { dampingFactor = 0.85, maxIterations = 50 } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;
  if (n === 0) return [];

  let scores = new Map<string, number>();
  for (const v of nodes) scores.set(v, 1 / n);

  for (let iter = 0; iter < maxIterations; iter++) {
    const newScores = new Map<string, number>();
    for (const v of nodes) newScores.set(v, (1 - dampingFactor) / n);

    for (const v of nodes) {
      const outNeighbors = graph.getNeighbors(v, "outgoing");
      if (outNeighbors.length === 0) {
        // Dangling node: distribute to all
        const share = dampingFactor * scores.get(v)! / n;
        for (const w of nodes) newScores.set(w, newScores.get(w)! + share);
      } else {
        const share = dampingFactor * scores.get(v)! / outNeighbors.length;
        for (const w of outNeighbors) {
          newScores.set(w, newScores.get(w)! + share);
        }
      }
    }

    scores = newScores;
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id]) => id);
}

/**
 * Simulate Independent Cascade and return full activation trace.
 */
export function traceICPropagation(
  graph: Graph,
  seeds: string[],
  options: InfluenceOptions = {},
): { activatedByRound: string[][]; totalActivated: number } {
  const { propagationProbability = 0.1, seed = 42 } = options;
  const rng = makePRNG(seed);

  const activated = new Set<string>(seeds);
  const activatedByRound: string[][] = [seeds];
  let frontier = [...seeds];

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const v of frontier) {
      for (const w of graph.getNeighbors(v, "outgoing")) {
        if (!activated.has(w)) {
          const edges = graph.getEdgesBetween(v, w);
          const prob = edges.length > 0
            ? Math.min(edges[0]!.weight, 1)
            : propagationProbability;
          if (rng() < prob) {
            activated.add(w);
            nextFrontier.push(w);
          }
        }
      }
    }
    if (nextFrontier.length > 0) activatedByRound.push(nextFrontier);
    frontier = nextFrontier;
  }

  return { activatedByRound, totalActivated: activated.size };
}
