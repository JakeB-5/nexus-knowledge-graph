/**
 * Topological sorting algorithms for DAGs:
 * - Kahn's algorithm (BFS-based)
 * - DFS-based topological sort
 * - Cycle detection
 * - All topological orderings (first K)
 */
import type { Graph } from "../graph.js";

export interface TopologicalSortResult {
  order: string[] | null; // null if graph has cycles
  hasCycle: boolean;
}

/**
 * Kahn's algorithm for topological sort.
 * BFS-based: repeatedly removes nodes with zero in-degree.
 * O(V + E) time complexity.
 * Returns null if the graph has a cycle.
 */
export function kahnTopologicalSort(graph: Graph): TopologicalSortResult {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const inDegree = new Map<string, number>();

  for (const v of nodes) {
    inDegree.set(v, 0);
  }

  // Count in-degrees
  for (const v of nodes) {
    for (const w of graph.getNeighbors(v, "outgoing")) {
      inDegree.set(w, (inDegree.get(w) ?? 0) + 1);
    }
  }

  // Initialize queue with nodes having zero in-degree
  const queue: string[] = [];
  for (const [v, deg] of inDegree) {
    if (deg === 0) queue.push(v);
  }

  // Sort for deterministic output
  queue.sort();

  const order: string[] = [];

  while (queue.length > 0) {
    const v = queue.shift()!;
    order.push(v);

    const neighbors = graph.getNeighbors(v, "outgoing").sort();
    for (const w of neighbors) {
      const newDeg = (inDegree.get(w) ?? 0) - 1;
      inDegree.set(w, newDeg);
      if (newDeg === 0) {
        // Insert in sorted order for determinism
        const insertIdx = queue.findIndex((x) => x > w);
        if (insertIdx === -1) queue.push(w);
        else queue.splice(insertIdx, 0, w);
      }
    }
  }

  const hasCycle = order.length !== nodes.length;
  return { order: hasCycle ? null : order, hasCycle };
}

/**
 * DFS-based topological sort.
 * O(V + E) time complexity.
 * Returns null if the graph has a cycle.
 */
export function dfsTopologicalSort(graph: Graph): TopologicalSortResult {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const WHITE = 0; // unvisited
  const GRAY = 1;  // currently visiting (in DFS stack)
  const BLACK = 2; // fully visited

  const color = new Map<string, number>();
  for (const v of nodes) color.set(v, WHITE);

  const order: string[] = [];
  let hasCycle = false;

  function dfs(v: string): void {
    if (hasCycle) return;
    color.set(v, GRAY);

    for (const w of graph.getNeighbors(v, "outgoing")) {
      if (color.get(w) === GRAY) {
        hasCycle = true;
        return;
      }
      if (color.get(w) === WHITE) {
        dfs(w);
      }
    }

    color.set(v, BLACK);
    order.push(v);
  }

  // Visit all nodes (handles disconnected graphs)
  for (const v of nodes.sort()) {
    if (color.get(v) === WHITE) {
      dfs(v);
    }
  }

  if (hasCycle) return { order: null, hasCycle: true };

  return { order: order.reverse(), hasCycle: false };
}

/**
 * Detect if the directed graph contains a cycle.
 * O(V + E) time.
 */
export function hasCycle(graph: Graph): boolean {
  const { hasCycle: cycleFound } = kahnTopologicalSort(graph);
  return cycleFound;
}

/**
 * Generate first K topological orderings of the graph.
 * Uses backtracking; can be expensive for large graphs.
 * Returns empty array if graph has a cycle.
 */
export function allTopologicalOrderings(
  graph: Graph,
  maxResults: number = 10,
): string[][] {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const inDegree = new Map<string, number>();

  for (const v of nodes) inDegree.set(v, 0);
  for (const v of nodes) {
    for (const w of graph.getNeighbors(v, "outgoing")) {
      inDegree.set(w, (inDegree.get(w) ?? 0) + 1);
    }
  }

  // Check for cycles first
  const { hasCycle: cycleDetected } = kahnTopologicalSort(graph);
  if (cycleDetected) return [];

  const results: string[][] = [];
  const current: string[] = [];
  const visited = new Set<string>();

  function backtrack(): void {
    if (results.length >= maxResults) return;
    if (current.length === nodes.length) {
      results.push([...current]);
      return;
    }

    // Find all nodes with in-degree 0 that haven't been visited
    const available: string[] = [];
    for (const v of nodes) {
      if (!visited.has(v) && inDegree.get(v) === 0) {
        available.push(v);
      }
    }

    for (const v of available.sort()) {
      if (results.length >= maxResults) break;
      visited.add(v);
      current.push(v);

      // Decrease in-degree of neighbors
      for (const w of graph.getNeighbors(v, "outgoing")) {
        inDegree.set(w, inDegree.get(w)! - 1);
      }

      backtrack();

      // Restore in-degree
      for (const w of graph.getNeighbors(v, "outgoing")) {
        inDegree.set(w, inDegree.get(w)! + 1);
      }
      current.pop();
      visited.delete(v);
    }
  }

  backtrack();
  return results;
}

/**
 * Find all cycles in the directed graph.
 * Returns an array of cycles (each cycle is an array of node IDs).
 */
export function findCycles(graph: Graph): string[][] {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycles: string[][] = [];
  const path: string[] = [];

  function dfs(v: string): void {
    visited.add(v);
    recStack.add(v);
    path.push(v);

    for (const w of graph.getNeighbors(v, "outgoing")) {
      if (!visited.has(w)) {
        dfs(w);
      } else if (recStack.has(w)) {
        // Found a cycle: extract it from path
        const cycleStart = path.indexOf(w);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
      }
    }

    path.pop();
    recStack.delete(v);
  }

  for (const v of nodes) {
    if (!visited.has(v)) dfs(v);
  }

  return cycles;
}
