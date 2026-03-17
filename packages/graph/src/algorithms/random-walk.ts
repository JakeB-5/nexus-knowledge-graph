/**
 * Random walk algorithms:
 * - Simple random walk
 * - Node2Vec-style biased random walk (p, q parameters)
 * - Walk-based co-occurrence statistics (embedding input)
 * - Hitting time estimation
 */
import type { Graph } from "../graph.js";

export interface RandomWalkOptions {
  walkLength?: number;
  numWalks?: number;
  seed?: number;
}

export interface Node2VecOptions extends RandomWalkOptions {
  /** Return parameter: controls likelihood of revisiting a node */
  p?: number;
  /** In-out parameter: controls BFS vs DFS bias */
  q?: number;
}

export interface WalkResult {
  walks: string[][];
  nodeWalks: Map<string, string[][]>; // node -> walks starting from that node
}

export interface CoOccurrenceResult {
  coOccurrence: Map<string, Map<string, number>>;
  windowSize: number;
}

/**
 * Simple seeded pseudo-random number generator (mulberry32).
 */
function makePRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Perform a simple unbiased random walk from a start node.
 */
export function randomWalk(
  graph: Graph,
  startNode: string,
  options: RandomWalkOptions = {},
): string[] {
  const { walkLength = 20, seed = 42 } = options;
  const rng = makePRNG(seed);
  const walk: string[] = [startNode];
  let current = startNode;

  for (let step = 0; step < walkLength - 1; step++) {
    const neighbors = graph.getNeighbors(current, "outgoing");
    if (neighbors.length === 0) {
      // Dead end: try undirected neighbors
      const undirected = graph.getNeighbors(current, "both");
      if (undirected.length === 0) break;
      current = undirected[Math.floor(rng() * undirected.length)]!;
    } else {
      current = neighbors[Math.floor(rng() * neighbors.length)]!;
    }
    walk.push(current);
  }

  return walk;
}

/**
 * Generate multiple random walks from every node in the graph.
 */
export function generateRandomWalks(
  graph: Graph,
  options: RandomWalkOptions = {},
): WalkResult {
  const { numWalks = 10, walkLength = 20, seed = 42 } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const allWalks: string[][] = [];
  const nodeWalks = new Map<string, string[][]>();

  for (const node of nodes) {
    nodeWalks.set(node, []);
    for (let w = 0; w < numWalks; w++) {
      const walk = randomWalk(graph, node, {
        walkLength,
        seed: seed + nodes.indexOf(node) * numWalks + w,
      });
      allWalks.push(walk);
      nodeWalks.get(node)!.push(walk);
    }
  }

  return { walks: allWalks, nodeWalks };
}

/**
 * Node2Vec biased random walk.
 * p controls return probability, q controls in-out exploration bias.
 * - Low p: likely to return to previous node (DFS-like)
 * - Low q: likely to explore outward (BFS-like)
 */
export function node2VecWalk(
  graph: Graph,
  startNode: string,
  options: Node2VecOptions = {},
): string[] {
  const { walkLength = 20, p = 1, q = 1, seed = 42 } = options;
  const rng = makePRNG(seed);
  const walk: string[] = [startNode];

  // First step: uniform random
  const startNeighbors = graph.getNeighbors(startNode, "both");
  if (startNeighbors.length === 0) return walk;

  let prev = startNode;
  let current = startNeighbors[Math.floor(rng() * startNeighbors.length)]!;
  walk.push(current);

  for (let step = 0; step < walkLength - 2; step++) {
    const neighbors = graph.getNeighbors(current, "both");
    if (neighbors.length === 0) break;

    // Compute unnormalized transition probabilities
    const prevNeighbors = new Set(graph.getNeighbors(prev, "both"));
    const weights: number[] = [];

    for (const neighbor of neighbors) {
      if (neighbor === prev) {
        // Return to previous node
        weights.push(1 / p);
      } else if (prevNeighbors.has(neighbor)) {
        // Common neighbor: stay at distance 1 from prev
        weights.push(1);
      } else {
        // Move away: explore outward
        weights.push(1 / q);
      }
    }

    // Sample next node using weighted random choice
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    let rand = rng() * totalWeight;
    let nextIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      rand -= weights[i]!;
      if (rand <= 0) {
        nextIdx = i;
        break;
      }
    }

    prev = current;
    current = neighbors[nextIdx]!;
    walk.push(current);
  }

  return walk;
}

/**
 * Generate Node2Vec walks from all nodes.
 */
export function generateNode2VecWalks(
  graph: Graph,
  options: Node2VecOptions = {},
): WalkResult {
  const { numWalks = 10, walkLength = 20, p = 1, q = 1, seed = 42 } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const allWalks: string[][] = [];
  const nodeWalks = new Map<string, string[][]>();

  for (const node of nodes) {
    nodeWalks.set(node, []);
    for (let w = 0; w < numWalks; w++) {
      const walk = node2VecWalk(graph, node, {
        walkLength,
        p,
        q,
        seed: seed + nodes.indexOf(node) * numWalks + w,
      });
      allWalks.push(walk);
      nodeWalks.get(node)!.push(walk);
    }
  }

  return { walks: allWalks, nodeWalks };
}

/**
 * Compute co-occurrence statistics from walks.
 * For each pair of nodes appearing within a window, increment count.
 * Used as input to embedding methods like word2vec/skip-gram.
 */
export function walkCoOccurrence(
  walks: string[][],
  windowSize: number = 5,
): CoOccurrenceResult {
  const coOccurrence = new Map<string, Map<string, number>>();

  const addPair = (a: string, b: string) => {
    if (!coOccurrence.has(a)) coOccurrence.set(a, new Map());
    coOccurrence.get(a)!.set(b, (coOccurrence.get(a)!.get(b) ?? 0) + 1);
  };

  for (const walk of walks) {
    for (let i = 0; i < walk.length; i++) {
      const center = walk[i]!;
      const start = Math.max(0, i - windowSize);
      const end = Math.min(walk.length - 1, i + windowSize);

      for (let j = start; j <= end; j++) {
        if (j !== i) {
          addPair(center, walk[j]!);
        }
      }
    }
  }

  return { coOccurrence, windowSize };
}

/**
 * Estimate hitting time from source to target via Monte Carlo simulation.
 * Hitting time H(u,v) = expected number of steps to reach v starting from u.
 */
export function estimateHittingTime(
  graph: Graph,
  source: string,
  target: string,
  options: { numSimulations?: number; maxSteps?: number; seed?: number } = {},
): number {
  const { numSimulations = 1000, maxSteps = 1000, seed = 42 } = options;
  const rng = makePRNG(seed);

  let totalSteps = 0;
  let successCount = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    let current = source;
    let steps = 0;
    let reached = false;

    while (steps < maxSteps) {
      if (current === target) {
        reached = true;
        break;
      }
      const neighbors = graph.getNeighbors(current, "both");
      if (neighbors.length === 0) break;
      current = neighbors[Math.floor(rng() * neighbors.length)]!;
      steps++;
    }

    if (reached) {
      totalSteps += steps;
      successCount++;
    }
  }

  return successCount === 0 ? Infinity : totalSteps / successCount;
}

/**
 * Stationary distribution of random walk via power iteration.
 * For undirected graphs: proportional to node degree.
 */
export function stationaryDistribution(
  graph: Graph,
  options: { maxIterations?: number; tolerance?: number } = {},
): Map<string, number> {
  const { maxIterations = 100, tolerance = 1e-6 } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;
  if (n === 0) return new Map();

  let dist = new Map<string, number>();
  for (const v of nodes) dist.set(v, 1 / n);

  for (let iter = 0; iter < maxIterations; iter++) {
    const newDist = new Map<string, number>();
    for (const v of nodes) newDist.set(v, 0);

    for (const u of nodes) {
      const neighbors = graph.getNeighbors(u, "both");
      if (neighbors.length === 0) continue;
      const prob = (dist.get(u) ?? 0) / neighbors.length;
      for (const w of neighbors) {
        newDist.set(w, (newDist.get(w) ?? 0) + prob);
      }
    }

    // Check convergence
    let maxDiff = 0;
    for (const v of nodes) {
      maxDiff = Math.max(maxDiff, Math.abs((newDist.get(v) ?? 0) - (dist.get(v) ?? 0)));
    }
    dist = newDist;
    if (maxDiff < tolerance) break;
  }

  return dist;
}
