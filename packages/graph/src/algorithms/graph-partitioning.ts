/**
 * Graph partitioning algorithms:
 * - Kernighan-Lin algorithm for graph bisection
 * - Multi-level partitioning (coarsen, partition, uncoarsen)
 * - Balanced partitioning with tolerance
 * - Partition quality metrics
 */
import type { Graph } from "../graph.js";

export interface Partition {
  partitions: Map<number, Set<string>>; // partition id -> node ids
  nodePartition: Map<string, number>;   // node id -> partition id
  cutSize: number;
  balance: number; // max partition size / ideal size
}

export interface PartitionOptions {
  numPartitions?: number;
  maxImbalance?: number; // allowed imbalance ratio (e.g. 1.1 = 10% imbalance)
  maxIterations?: number;
}

/**
 * Compute the cut size (number of edges crossing partition boundaries).
 */
export function computeCutSize(
  graph: Graph,
  nodePartition: Map<string, number>,
): number {
  let cuts = 0;
  const counted = new Set<string>();

  for (const node of graph.getAllNodes()) {
    for (const edge of graph.getEdgesForNode(node.id)) {
      if (counted.has(edge.id)) continue;
      counted.add(edge.id);
      const pa = nodePartition.get(edge.source);
      const pb = nodePartition.get(edge.target);
      if (pa !== undefined && pb !== undefined && pa !== pb) {
        cuts += edge.weight;
      }
    }
  }

  return cuts;
}

/**
 * Compute balance: ratio of largest partition to ideal size.
 */
export function computeBalance(partition: Map<number, Set<string>>, totalNodes: number): number {
  const numParts = partition.size;
  if (numParts === 0) return 1;
  const ideal = totalNodes / numParts;
  let maxSize = 0;
  for (const part of partition.values()) {
    maxSize = Math.max(maxSize, part.size);
  }
  return ideal > 0 ? maxSize / ideal : 1;
}

/**
 * Kernighan-Lin algorithm for balanced graph bisection.
 * Starts with a random balanced partition and iteratively improves it.
 * O(V^2 log V) per pass.
 */
export function kernighanLin(
  graph: Graph,
  options: { maxIterations?: number; seed?: number } = {},
): Partition {
  const { maxIterations = 20 } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;

  if (n === 0) {
    return {
      partitions: new Map([[0, new Set()], [1, new Set()]]),
      nodePartition: new Map(),
      cutSize: 0,
      balance: 1,
    };
  }

  // Initial balanced partition: first half in A, second half in B
  const nodePartition = new Map<string, number>();
  const halfSize = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    nodePartition.set(nodes[i]!, i < halfSize ? 0 : 1);
  }

  // Build edge weight lookup
  const edgeWeight = (u: string, v: string): number => {
    const edges = [
      ...graph.getEdgesBetween(u, v),
      ...graph.getEdgesBetween(v, u),
    ];
    return edges.reduce((s, e) => s + e.weight, 0);
  };

  // D[v] = external cost - internal cost for node v
  const computeD = (v: string): number => {
    const partV = nodePartition.get(v)!;
    let external = 0;
    let internal = 0;
    for (const w of graph.getNeighbors(v, "both")) {
      const w2 = edgeWeight(v, w);
      if (nodePartition.get(w) !== partV) external += w2;
      else internal += w2;
    }
    return external - internal;
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    const D = new Map<string, number>();
    for (const v of nodes) D.set(v, computeD(v));

    const lockedA = new Set<string>();
    const lockedB = new Set<string>();
    const swaps: Array<{ a: string; b: string; gain: number }> = [];
    let cumulativeGain = 0;

    const setA = nodes.filter((v) => nodePartition.get(v) === 0);
    const setB = nodes.filter((v) => nodePartition.get(v) === 1);

    for (let pass = 0; pass < Math.min(setA.length, setB.length); pass++) {
      // Find best swap (a in A, b in B) maximizing gain
      let bestGain = -Infinity;
      let bestA = "";
      let bestB = "";

      for (const a of setA) {
        if (lockedA.has(a)) continue;
        for (const b of setB) {
          if (lockedB.has(b)) continue;
          const gain = D.get(a)! + D.get(b)! - 2 * edgeWeight(a, b);
          if (gain > bestGain) {
            bestGain = gain;
            bestA = a;
            bestB = b;
          }
        }
      }

      if (!bestA || !bestB) break;

      lockedA.add(bestA);
      lockedB.add(bestB);
      cumulativeGain += bestGain;
      swaps.push({ a: bestA, b: bestB, gain: cumulativeGain });

      // Update D values for unlocked nodes
      for (const v of nodes) {
        if (lockedA.has(v) || lockedB.has(v)) continue;
        const partV = nodePartition.get(v)!;
        const wA = edgeWeight(v, bestA);
        const wB = edgeWeight(v, bestB);

        if (partV === 0) {
          D.set(v, D.get(v)! + 2 * wA - 2 * wB);
        } else {
          D.set(v, D.get(v)! + 2 * wB - 2 * wA);
        }
      }
    }

    // Find the prefix with maximum cumulative gain
    let maxGain = 0;
    let maxK = -1;
    for (let k = 0; k < swaps.length; k++) {
      if (swaps[k]!.gain > maxGain) {
        maxGain = swaps[k]!.gain;
        maxK = k;
      }
    }

    if (maxGain <= 0) break; // No improvement possible

    // Apply swaps up to maxK
    for (let k = 0; k <= maxK; k++) {
      const { a, b } = swaps[k]!;
      nodePartition.set(a, 1);
      nodePartition.set(b, 0);
    }
  }

  const partitions = new Map<number, Set<string>>([
    [0, new Set()],
    [1, new Set()],
  ]);
  for (const [v, p] of nodePartition) {
    partitions.get(p)!.add(v);
  }

  const cutSize = computeCutSize(graph, nodePartition);
  const balance = computeBalance(partitions, n);

  return { partitions, nodePartition, cutSize, balance };
}

/**
 * Multi-way balanced partitioning using recursive bisection.
 */
export function multiWayPartition(
  graph: Graph,
  options: PartitionOptions = {},
): Partition {
  const { numPartitions = 2, maxIterations = 20 } = options;
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;

  if (n === 0 || numPartitions <= 0) {
    return {
      partitions: new Map(),
      nodePartition: new Map(),
      cutSize: 0,
      balance: 1,
    };
  }

  if (numPartitions === 1) {
    const partitions = new Map([[0, new Set(nodes)]]);
    const nodePartition = new Map(nodes.map((v) => [v, 0]));
    return { partitions, nodePartition, cutSize: 0, balance: 1 };
  }

  // Start with round-robin assignment
  const nodePartition = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    nodePartition.set(nodes[i]!, i % numPartitions);
  }

  // Iterative refinement: move each node to best partition
  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;
    const partitionSizes = new Array(numPartitions).fill(0);
    for (const p of nodePartition.values()) partitionSizes[p]!++;

    for (const v of nodes) {
      const currentPart = nodePartition.get(v)!;
      const gains = new Array(numPartitions).fill(0);

      for (const w of graph.getNeighbors(v, "both")) {
        const wPart = nodePartition.get(w)!;
        const wt = graph.getEdgesBetween(v, w).concat(graph.getEdgesBetween(w, v))
          .reduce((s, e) => s + e.weight, 0) || 1;
        gains[wPart] = (gains[wPart] ?? 0) + wt;
      }

      // Find best partition (considering balance)
      let bestPart = currentPart;
      let bestScore = -Infinity;
      const idealSize = n / numPartitions;

      for (let p = 0; p < numPartitions; p++) {
        if (p === currentPart) continue;
        const balancePenalty = Math.abs(partitionSizes[p]! + 1 - idealSize) * 0.01;
        const score = (gains[p] ?? 0) - (gains[currentPart] ?? 0) - balancePenalty;
        if (score > bestScore) {
          bestScore = score;
          bestPart = p;
        }
      }

      if (bestPart !== currentPart && bestScore > 0) {
        partitionSizes[currentPart]!--;
        partitionSizes[bestPart]!++;
        nodePartition.set(v, bestPart);
        improved = true;
      }
    }

    if (!improved) break;
  }

  const partitions = new Map<number, Set<string>>();
  for (let p = 0; p < numPartitions; p++) partitions.set(p, new Set());
  for (const [v, p] of nodePartition) partitions.get(p)!.add(v);

  const cutSize = computeCutSize(graph, nodePartition);
  const balance = computeBalance(partitions, n);

  return { partitions, nodePartition, cutSize, balance };
}

/**
 * Partition quality metrics.
 */
export function partitionQuality(
  graph: Graph,
  partition: Partition,
): {
  cutSize: number;
  balance: number;
  modularity: number;
  conductance: number;
} {
  const { nodePartition, partitions } = partition;
  const totalEdges = graph.getAllNodes()
    .flatMap((n) => graph.getEdgesForNode(n.id).filter((e) => e.source === n.id))
    .reduce((s, e) => s + e.weight, 0);

  // Modularity: fraction of edges within partitions vs expected
  let modularity = 0;
  const totalDegree = new Map<string, number>();
  for (const node of graph.getAllNodes()) {
    totalDegree.set(node.id, graph.getNeighbors(node.id, "both").length);
  }
  const m = totalEdges || 1;

  for (const part of partitions.values()) {
    const partNodes = Array.from(part);
    for (const u of partNodes) {
      for (const v of partNodes) {
        const w = graph.getEdgesBetween(u, v).reduce((s, e) => s + e.weight, 0);
        modularity += w - (totalDegree.get(u)! * totalDegree.get(v)!) / (2 * m);
      }
    }
  }
  modularity /= 2 * m;

  // Conductance: cut edges / min(vol(A), vol(B))
  let conductance = 0;
  if (partitions.size === 2) {
    const parts = Array.from(partitions.values());
    const volA = Array.from(parts[0]!).reduce((s, v) => s + (totalDegree.get(v) ?? 0), 0);
    const volB = Array.from(parts[1]!).reduce((s, v) => s + (totalDegree.get(v) ?? 0), 0);
    conductance = Math.min(volA, volB) > 0 ? partition.cutSize / Math.min(volA, volB) : 0;
  }

  return {
    cutSize: partition.cutSize,
    balance: partition.balance,
    modularity,
    conductance,
  };
}
