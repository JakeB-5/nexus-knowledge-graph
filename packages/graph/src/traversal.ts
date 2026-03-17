import type { Graph } from "./graph.js";
import type { TraversalResult } from "./types.js";
import { MAX_GRAPH_DEPTH, MAX_TRAVERSAL_NODES } from "@nexus/shared";

export interface TraversalOptions {
  maxDepth?: number;
  maxNodes?: number;
  direction?: "outgoing" | "incoming" | "both";
  edgeTypes?: string[];
}

export function bfs(
  graph: Graph,
  startId: string,
  options: TraversalOptions = {},
): TraversalResult {
  const {
    maxDepth = MAX_GRAPH_DEPTH,
    maxNodes = MAX_TRAVERSAL_NODES,
    direction = "outgoing",
  } = options;

  const visited: string[] = [];
  const paths = new Map<string, string[]>();
  const depth = new Map<string, number>();
  const queue: Array<{ id: string; d: number; path: string[] }> = [];

  if (!graph.hasNode(startId)) {
    return { visited, paths, depth };
  }

  queue.push({ id: startId, d: 0, path: [startId] });
  const seen = new Set<string>([startId]);

  while (queue.length > 0 && visited.length < maxNodes) {
    const current = queue.shift()!;

    if (current.d > maxDepth) continue;

    visited.push(current.id);
    paths.set(current.id, current.path);
    depth.set(current.id, current.d);

    const neighbors = graph.getNeighbors(current.id, direction);
    for (const neighborId of neighbors) {
      if (!seen.has(neighborId)) {
        seen.add(neighborId);
        queue.push({
          id: neighborId,
          d: current.d + 1,
          path: [...current.path, neighborId],
        });
      }
    }
  }

  return { visited, paths, depth };
}

export function dfs(
  graph: Graph,
  startId: string,
  options: TraversalOptions = {},
): TraversalResult {
  const {
    maxDepth = MAX_GRAPH_DEPTH,
    maxNodes = MAX_TRAVERSAL_NODES,
    direction = "outgoing",
  } = options;

  const visited: string[] = [];
  const paths = new Map<string, string[]>();
  const depth = new Map<string, number>();
  const seen = new Set<string>();

  if (!graph.hasNode(startId)) {
    return { visited, paths, depth };
  }

  function traverse(id: string, d: number, path: string[]): void {
    if (d > maxDepth || visited.length >= maxNodes || seen.has(id)) return;

    seen.add(id);
    visited.push(id);
    paths.set(id, path);
    depth.set(id, d);

    const neighbors = graph.getNeighbors(id, direction);
    for (const neighborId of neighbors) {
      if (!seen.has(neighborId)) {
        traverse(neighborId, d + 1, [...path, neighborId]);
      }
    }
  }

  traverse(startId, 0, [startId]);
  return { visited, paths, depth };
}

export function shortestPath(
  graph: Graph,
  sourceId: string,
  targetId: string,
  direction: "outgoing" | "incoming" | "both" = "outgoing",
): string[] | null {
  if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) {
    return null;
  }

  if (sourceId === targetId) return [sourceId];

  const result = bfs(graph, sourceId, {
    maxNodes: MAX_TRAVERSAL_NODES,
    direction,
  });

  return result.paths.get(targetId) ?? null;
}
