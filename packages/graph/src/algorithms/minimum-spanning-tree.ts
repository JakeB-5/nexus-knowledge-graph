/**
 * Minimum Spanning Tree algorithms:
 * - Kruskal's algorithm (Union-Find based)
 * - Prim's algorithm (Priority Queue based)
 * Treats the graph as an undirected weighted graph.
 */
import type { Graph, GraphEdge } from "../graph.js";
import { UnionFind } from "../data-structures/union-find.js";
import { PriorityQueue } from "../data-structures/priority-queue.js";

export interface MSTResult {
  edges: GraphEdge[];
  totalWeight: number;
  nodeCount: number;
  edgeCount: number;
}

/**
 * Kruskal's algorithm for MST.
 * O(E log E) time due to sorting edges.
 * Works by greedily adding the cheapest edge that doesn't form a cycle.
 */
export function kruskal(graph: Graph): MSTResult {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const uf = new UnionFind(nodes);

  // Collect all unique undirected edges
  const seen = new Set<string>();
  const allEdges: GraphEdge[] = [];

  for (const node of graph.getAllNodes()) {
    for (const edge of graph.getEdgesForNode(node.id)) {
      // Deduplicate: treat (u,v) and (v,u) as same undirected edge
      const key =
        edge.source < edge.target
          ? `${edge.source}:${edge.target}`
          : `${edge.target}:${edge.source}`;
      if (!seen.has(key)) {
        seen.add(key);
        allEdges.push(edge);
      }
    }
  }

  // Sort edges by weight ascending
  allEdges.sort((a, b) => a.weight - b.weight);

  const mstEdges: GraphEdge[] = [];
  let totalWeight = 0;

  for (const edge of allEdges) {
    if (mstEdges.length === nodes.length - 1) break;
    // Add edge only if it connects two different components
    if (uf.union(edge.source, edge.target)) {
      mstEdges.push(edge);
      totalWeight += edge.weight;
    }
  }

  return {
    edges: mstEdges,
    totalWeight,
    nodeCount: nodes.length,
    edgeCount: mstEdges.length,
  };
}

/**
 * Prim's algorithm for MST.
 * O((V + E) log V) time using a priority queue.
 * Grows the MST one vertex at a time from an arbitrary start.
 */
export function prim(graph: Graph, startNodeId?: string): MSTResult {
  const nodes = graph.getAllNodes();
  if (nodes.length === 0) {
    return { edges: [], totalWeight: 0, nodeCount: 0, edgeCount: 0 };
  }

  const startId = startNodeId ?? nodes[0]!.id;
  const inMST = new Set<string>();
  const mstEdges: GraphEdge[] = [];
  let totalWeight = 0;

  // Priority queue: (weight, edge)
  const pq = new PriorityQueue<string>();
  // Map from node -> best edge connecting it to MST
  const bestEdge = new Map<string, GraphEdge>();

  inMST.add(startId);

  // Add all edges from start node to queue
  const addEdgesFromNode = (nodeId: string) => {
    const neighbors = graph.getNeighbors(nodeId, "both");
    for (const neighbor of neighbors) {
      if (inMST.has(neighbor)) continue;
      // Find minimum weight edge between nodeId and neighbor
      const edgesFwd = graph.getEdgesBetween(nodeId, neighbor);
      const edgesBwd = graph.getEdgesBetween(neighbor, nodeId);
      const candidates = [...edgesFwd, ...edgesBwd];
      if (candidates.length === 0) continue;

      const minEdge = candidates.reduce((best, e) =>
        e.weight < best.weight ? e : best,
      );

      const currentBest = bestEdge.get(neighbor);
      if (!currentBest || minEdge.weight < currentBest.weight) {
        bestEdge.set(neighbor, minEdge);
        pq.insert(neighbor, minEdge.weight);
      }
    }
  };

  addEdgesFromNode(startId);

  while (!pq.isEmpty) {
    const entry = pq.extractMin();
    if (!entry) break;
    const { key: v } = entry;

    if (inMST.has(v)) continue;

    const edge = bestEdge.get(v);
    if (!edge) continue;

    inMST.add(v);
    mstEdges.push(edge);
    totalWeight += edge.weight;

    addEdgesFromNode(v);
  }

  return {
    edges: mstEdges,
    totalWeight,
    nodeCount: nodes.length,
    edgeCount: mstEdges.length,
  };
}

/**
 * Maximum Spanning Tree using Kruskal's (negated weights).
 */
export function maximumSpanningTree(graph: Graph): MSTResult {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const uf = new UnionFind(nodes);

  const seen = new Set<string>();
  const allEdges: GraphEdge[] = [];

  for (const node of graph.getAllNodes()) {
    for (const edge of graph.getEdgesForNode(node.id)) {
      const key =
        edge.source < edge.target
          ? `${edge.source}:${edge.target}`
          : `${edge.target}:${edge.source}`;
      if (!seen.has(key)) {
        seen.add(key);
        allEdges.push(edge);
      }
    }
  }

  // Sort descending for maximum spanning tree
  allEdges.sort((a, b) => b.weight - a.weight);

  const mstEdges: GraphEdge[] = [];
  let totalWeight = 0;

  for (const edge of allEdges) {
    if (mstEdges.length === nodes.length - 1) break;
    if (uf.union(edge.source, edge.target)) {
      mstEdges.push(edge);
      totalWeight += edge.weight;
    }
  }

  return {
    edges: mstEdges,
    totalWeight,
    nodeCount: nodes.length,
    edgeCount: mstEdges.length,
  };
}

/**
 * Check if the MST spans all nodes (i.e., graph is connected).
 */
export function isMSTComplete(result: MSTResult): boolean {
  return result.edgeCount === result.nodeCount - 1;
}
