/**
 * Maximum flow algorithms:
 * - Edmonds-Karp (Ford-Fulkerson with BFS augmenting paths)
 * - Residual graph construction
 * - Min-cut computation (via max-flow min-cut theorem)
 * - Flow decomposition into paths
 */
import type { Graph } from "../graph.js";

export interface MaxFlowResult {
  maxFlow: number;
  flowGraph: Map<string, Map<string, number>>; // flow on each edge
  residualGraph: Map<string, Map<string, number>>;
  minCut: { sourceSet: Set<string>; sinkSet: Set<string>; cutEdges: Array<{ from: string; to: string; capacity: number }> };
}

export interface FlowPath {
  path: string[];
  flow: number;
}

/**
 * Build capacity graph from Graph edges.
 * For directed graphs, uses edge weights as capacities.
 */
function buildCapacityGraph(
  graph: Graph,
  source: string,
  sink: string,
): Map<string, Map<string, number>> {
  const capacity = new Map<string, Map<string, number>>();

  const initNode = (v: string) => {
    if (!capacity.has(v)) capacity.set(v, new Map());
  };

  for (const node of graph.getAllNodes()) {
    initNode(node.id);
  }

  for (const node of graph.getAllNodes()) {
    for (const edge of graph.getEdgesForNode(node.id)) {
      if (edge.source !== node.id) continue;
      initNode(edge.source);
      initNode(edge.target);
      const cur = capacity.get(edge.source)!.get(edge.target) ?? 0;
      capacity.get(edge.source)!.set(edge.target, cur + edge.weight);
    }
  }

  // Ensure source and sink exist
  initNode(source);
  initNode(sink);

  return capacity;
}

/**
 * BFS to find augmenting path in residual graph.
 * Returns parent map if path exists, null otherwise.
 */
function bfsAugmentingPath(
  residual: Map<string, Map<string, number>>,
  source: string,
  sink: string,
): Map<string, string> | null {
  const visited = new Set<string>([source]);
  const parent = new Map<string, string>();
  const queue: string[] = [source];

  while (queue.length > 0) {
    const v = queue.shift()!;
    const neighbors = residual.get(v);
    if (!neighbors) continue;

    for (const [w, cap] of neighbors) {
      if (!visited.has(w) && cap > 0) {
        visited.add(w);
        parent.set(w, v);
        if (w === sink) return parent;
        queue.push(w);
      }
    }
  }

  return null;
}

/**
 * Edmonds-Karp algorithm: Ford-Fulkerson with BFS augmenting paths.
 * O(VE^2) time complexity.
 */
export function maxFlow(
  graph: Graph,
  source: string,
  sink: string,
): MaxFlowResult {
  const capacity = buildCapacityGraph(graph, source, sink);

  // Initialize residual graph as copy of capacity graph
  const residual = new Map<string, Map<string, number>>();
  for (const [u, neighbors] of capacity) {
    residual.set(u, new Map(neighbors));
  }

  // Ensure reverse edges exist with 0 capacity
  for (const [u, neighbors] of capacity) {
    for (const [v] of neighbors) {
      if (!residual.has(v)) residual.set(v, new Map());
      if (!residual.get(v)!.has(u)) {
        residual.get(v)!.set(u, 0);
      }
    }
  }

  // Track actual flow on original edges
  const flow = new Map<string, Map<string, number>>();
  for (const [u] of residual) {
    flow.set(u, new Map());
    for (const [v] of residual.get(u)!) {
      flow.get(u)!.set(v, 0);
    }
  }

  let totalFlow = 0;

  // Augment along BFS paths until no augmenting path exists
  let parent: Map<string, string> | null;
  while ((parent = bfsAugmentingPath(residual, source, sink)) !== null) {
    // Find bottleneck capacity along the path
    let pathFlow = Infinity;
    let v = sink;
    while (v !== source) {
      const u = parent.get(v)!;
      pathFlow = Math.min(pathFlow, residual.get(u)!.get(v) ?? 0);
      v = u;
    }

    // Update residual capacities
    v = sink;
    while (v !== source) {
      const u = parent.get(v)!;
      residual.get(u)!.set(v, (residual.get(u)!.get(v) ?? 0) - pathFlow);
      residual.get(v)!.set(u, (residual.get(v)!.get(u) ?? 0) + pathFlow);

      // Track flow on forward edges
      if (capacity.get(u)?.has(v)) {
        flow.get(u)!.set(v, (flow.get(u)!.get(v) ?? 0) + pathFlow);
      }
      v = u;
    }

    totalFlow += pathFlow;
  }

  // Compute min-cut via BFS on residual graph from source
  const sourceSet = new Set<string>();
  const bfsQueue: string[] = [source];
  sourceSet.add(source);
  while (bfsQueue.length > 0) {
    const v = bfsQueue.shift()!;
    for (const [w, cap] of residual.get(v) ?? []) {
      if (!sourceSet.has(w) && cap > 0) {
        sourceSet.add(w);
        bfsQueue.push(w);
      }
    }
  }

  const sinkSet = new Set<string>();
  for (const [v] of residual) {
    if (!sourceSet.has(v)) sinkSet.add(v);
  }

  const cutEdges: Array<{ from: string; to: string; capacity: number }> = [];
  for (const u of sourceSet) {
    for (const [v, cap] of capacity.get(u) ?? []) {
      if (sinkSet.has(v) && cap > 0) {
        cutEdges.push({ from: u, to: v, capacity: cap });
      }
    }
  }

  return {
    maxFlow: totalFlow,
    flowGraph: flow,
    residualGraph: residual,
    minCut: { sourceSet, sinkSet, cutEdges },
  };
}

/**
 * Decompose flow into paths from source to sink.
 * Each path carries a positive amount of flow.
 */
export function flowDecomposition(
  source: string,
  sink: string,
  flowGraph: Map<string, Map<string, number>>,
): FlowPath[] {
  // Copy flow graph to mutate
  const residualFlow = new Map<string, Map<string, number>>();
  for (const [u, neighbors] of flowGraph) {
    residualFlow.set(u, new Map(neighbors));
  }

  const paths: FlowPath[] = [];

  // Repeatedly find path with positive flow using DFS
  while (true) {
    const path = findFlowPath(residualFlow, source, sink);
    if (!path || path.length < 2) break;

    // Find bottleneck flow
    let bottleneck = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i]!;
      const v = path[i + 1]!;
      bottleneck = Math.min(bottleneck, residualFlow.get(u)?.get(v) ?? 0);
    }

    if (bottleneck <= 0 || !isFinite(bottleneck)) break;

    // Subtract flow along path
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i]!;
      const v = path[i + 1]!;
      const cur = residualFlow.get(u)?.get(v) ?? 0;
      residualFlow.get(u)!.set(v, cur - bottleneck);
    }

    paths.push({ path, flow: bottleneck });
  }

  return paths;
}

function findFlowPath(
  flowGraph: Map<string, Map<string, number>>,
  source: string,
  sink: string,
): string[] | null {
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(v: string): boolean {
    visited.add(v);
    path.push(v);
    if (v === sink) return true;

    for (const [w, f] of flowGraph.get(v) ?? []) {
      if (!visited.has(w) && f > 0) {
        if (dfs(w)) return true;
      }
    }

    path.pop();
    return false;
  }

  return dfs(source) ? path : null;
}

/**
 * Compute the total flow leaving the source node.
 */
export function totalFlowFrom(
  source: string,
  flowGraph: Map<string, Map<string, number>>,
): number {
  let total = 0;
  for (const [, f] of flowGraph.get(source) ?? []) {
    if (f > 0) total += f;
  }
  return total;
}

/**
 * Check if a given flow satisfies conservation constraints.
 */
export function validateFlow(
  source: string,
  sink: string,
  flowGraph: Map<string, Map<string, number>>,
  capacityGraph: Map<string, Map<string, number>>,
): boolean {
  // Check capacity constraints
  for (const [u, neighbors] of flowGraph) {
    for (const [v, f] of neighbors) {
      if (f < 0) return false;
      const cap = capacityGraph.get(u)?.get(v) ?? 0;
      if (f > cap) return false;
    }
  }

  // Check flow conservation (all nodes except source and sink)
  for (const [v, neighbors] of flowGraph) {
    if (v === source || v === sink) continue;
    let outFlow = 0;
    let inFlow = 0;
    for (const [, f] of neighbors) outFlow += f;
    for (const [u, uNeighbors] of flowGraph) {
      inFlow += uNeighbors.get(v) ?? 0;
    }
    if (Math.abs(outFlow - inFlow) > 1e-9) return false;
  }

  return true;
}
