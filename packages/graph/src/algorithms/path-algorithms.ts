/**
 * Path algorithms:
 * - Floyd-Warshall (all-pairs shortest paths)
 * - Dijkstra's algorithm (single-source weighted shortest path)
 * - A* search with heuristic
 * - Bidirectional BFS
 * - Yen's K-shortest paths algorithm
 * - Path enumeration with constraints
 */
import type { Graph } from "../graph.js";
import { PriorityQueue } from "../data-structures/priority-queue.js";

export interface ShortestPathResult {
  distance: number;
  path: string[];
}

export interface AllPairsResult {
  distances: Map<string, Map<string, number>>;
  next: Map<string, Map<string, string | null>>; // for path reconstruction
}

/**
 * Floyd-Warshall algorithm for all-pairs shortest paths.
 * O(V^3) time, O(V^2) space.
 * Works for weighted directed graphs with non-negative weights.
 */
export function floydWarshall(graph: Graph): AllPairsResult {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const n = nodes.length;

  // Initialize distance matrix
  const dist = new Map<string, Map<string, number>>();
  const next = new Map<string, Map<string, string | null>>();

  for (const u of nodes) {
    dist.set(u, new Map());
    next.set(u, new Map());
    for (const v of nodes) {
      dist.get(u)!.set(v, u === v ? 0 : Infinity);
      next.get(u)!.set(v, null);
    }
  }

  // Initialize with direct edges (use minimum weight for parallel edges)
  for (const node of graph.getAllNodes()) {
    for (const edge of graph.getEdgesForNode(node.id)) {
      if (edge.source === node.id) {
        const cur = dist.get(edge.source)!.get(edge.target) ?? Infinity;
        if (edge.weight < cur) {
          dist.get(edge.source)!.set(edge.target, edge.weight);
          next.get(edge.source)!.set(edge.target, edge.target);
        }
      }
    }
  }

  // Main loop
  for (const k of nodes) {
    for (const u of nodes) {
      for (const v of nodes) {
        const throughK =
          (dist.get(u)!.get(k) ?? Infinity) +
          (dist.get(k)!.get(v) ?? Infinity);
        if (throughK < (dist.get(u)!.get(v) ?? Infinity)) {
          dist.get(u)!.set(v, throughK);
          next.get(u)!.set(v, next.get(u)!.get(k));
        }
      }
    }
  }

  return { distances: dist, next };
}

/**
 * Reconstruct path from Floyd-Warshall next matrix.
 */
export function reconstructFWPath(
  next: Map<string, Map<string, string | null>>,
  source: string,
  target: string,
): string[] | null {
  if (next.get(source)?.get(target) === null) return null;
  const path: string[] = [source];
  let current = source;
  while (current !== target) {
    const n = next.get(current)?.get(target);
    if (n === null || n === undefined) return null;
    current = n;
    path.push(current);
    if (path.length > 10000) return null; // cycle guard
  }
  return path;
}

/**
 * Dijkstra's single-source shortest path algorithm.
 * O((V + E) log V) using a binary min-heap.
 * Requires non-negative edge weights.
 */
export function dijkstra(
  graph: Graph,
  source: string,
  target?: string,
): Map<string, ShortestPathResult> {
  const nodes = graph.getAllNodes().map((n) => n.id);
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const pq = new PriorityQueue<string>();

  for (const v of nodes) {
    dist.set(v, Infinity);
    prev.set(v, null);
  }
  dist.set(source, 0);
  pq.insert(source, 0);

  while (!pq.isEmpty) {
    const entry = pq.extractMin();
    if (!entry) break;
    const { key: u, priority: d } = entry;

    if (target && u === target) break;
    if (d > (dist.get(u) ?? Infinity)) continue;

    for (const edge of graph.getEdgesForNode(u).filter((e) => e.source === u)) {
      const alt = (dist.get(u) ?? Infinity) + edge.weight;
      if (alt < (dist.get(edge.target) ?? Infinity)) {
        dist.set(edge.target, alt);
        prev.set(edge.target, u);
        pq.insert(edge.target, alt);
      }
    }
  }

  // Build results
  const results = new Map<string, ShortestPathResult>();
  for (const v of nodes) {
    const d = dist.get(v) ?? Infinity;
    const path = reconstructPath(prev, source, v);
    results.set(v, { distance: d, path });
  }

  return results;
}

function reconstructPath(
  prev: Map<string, string | null>,
  source: string,
  target: string,
): string[] {
  const path: string[] = [];
  let current: string | null = target;
  while (current !== null) {
    path.unshift(current);
    if (current === source) break;
    current = prev.get(current) ?? null;
    if (path.length > 10000) return []; // cycle guard
  }
  return path[0] === source ? path : [];
}

/**
 * A* search algorithm with a user-provided heuristic function.
 * Returns null if no path exists.
 */
export function aStar(
  graph: Graph,
  source: string,
  target: string,
  heuristic: (nodeId: string) => number,
): ShortestPathResult | null {
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const pq = new PriorityQueue<string>();
  const closed = new Set<string>();

  for (const v of graph.getAllNodes()) {
    gScore.set(v.id, Infinity);
    fScore.set(v.id, Infinity);
    prev.set(v.id, null);
  }

  gScore.set(source, 0);
  fScore.set(source, heuristic(source));
  pq.insert(source, fScore.get(source)!);

  while (!pq.isEmpty) {
    const entry = pq.extractMin();
    if (!entry) break;
    const { key: current } = entry;

    if (current === target) {
      const path = reconstructPath(prev, source, target);
      return { distance: gScore.get(target) ?? Infinity, path };
    }

    if (closed.has(current)) continue;
    closed.add(current);

    for (const edge of graph.getEdgesForNode(current).filter((e) => e.source === current)) {
      if (closed.has(edge.target)) continue;
      const tentativeG = (gScore.get(current) ?? Infinity) + edge.weight;
      if (tentativeG < (gScore.get(edge.target) ?? Infinity)) {
        prev.set(edge.target, current);
        gScore.set(edge.target, tentativeG);
        const f = tentativeG + heuristic(edge.target);
        fScore.set(edge.target, f);
        pq.insert(edge.target, f);
      }
    }
  }

  return null;
}

/**
 * Bidirectional BFS for unweighted shortest path.
 * Faster than standard BFS for large graphs.
 */
export function bidirectionalBFS(
  graph: Graph,
  source: string,
  target: string,
): ShortestPathResult | null {
  if (source === target) return { distance: 0, path: [source] };

  // Forward and backward frontiers
  const fVisited = new Map<string, string | null>([[source, null]]);
  const bVisited = new Map<string, string | null>([[target, null]]);
  let fFrontier = [source];
  let bFrontier = [target];

  let meetingNode: string | null = null;

  while (fFrontier.length > 0 || bFrontier.length > 0) {
    // Expand the smaller frontier
    if (fFrontier.length <= bFrontier.length) {
      const nextFrontier: string[] = [];
      for (const v of fFrontier) {
        for (const w of graph.getNeighbors(v, "outgoing")) {
          if (!fVisited.has(w)) {
            fVisited.set(w, v);
            nextFrontier.push(w);
            if (bVisited.has(w)) {
              meetingNode = w;
              break;
            }
          }
        }
        if (meetingNode) break;
      }
      if (meetingNode) break;
      fFrontier = nextFrontier;
    } else {
      const nextFrontier: string[] = [];
      for (const v of bFrontier) {
        for (const w of graph.getNeighbors(v, "incoming")) {
          if (!bVisited.has(w)) {
            bVisited.set(w, v);
            nextFrontier.push(w);
            if (fVisited.has(w)) {
              meetingNode = w;
              break;
            }
          }
        }
        if (meetingNode) break;
      }
      if (meetingNode) break;
      bFrontier = nextFrontier;
    }
  }

  if (!meetingNode) return null;

  // Reconstruct path: source -> meetingNode (forward) + meetingNode -> target (backward)
  const forwardPath: string[] = [];
  let cur: string | null = meetingNode;
  while (cur !== null) {
    forwardPath.unshift(cur);
    cur = fVisited.get(cur) ?? null;
  }

  const backwardPath: string[] = [];
  cur = bVisited.get(meetingNode) ?? null;
  while (cur !== null) {
    backwardPath.push(cur);
    cur = bVisited.get(cur) ?? null;
  }

  const path = [...forwardPath, ...backwardPath];
  return { distance: path.length - 1, path };
}

/**
 * Yen's K-Shortest Paths algorithm.
 * Returns K shortest simple paths from source to target.
 * O(K * V * (E + V log V)) time.
 */
export function kShortestPaths(
  graph: Graph,
  source: string,
  target: string,
  k: number,
): ShortestPathResult[] {
  const results: ShortestPathResult[] = [];
  const candidates: ShortestPathResult[] = [];

  // Helper: Dijkstra with some edges/nodes blocked
  const dijkstraWithRestrictions = (
    start: string,
    end: string,
    blockedEdges: Set<string>,
    blockedNodes: Set<string>,
  ): ShortestPathResult | null => {
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    const pq = new PriorityQueue<string>();

    for (const v of graph.getAllNodes()) {
      if (!blockedNodes.has(v.id)) {
        dist.set(v.id, Infinity);
        prev.set(v.id, null);
      }
    }
    if (blockedNodes.has(start)) return null;
    dist.set(start, 0);
    pq.insert(start, 0);

    while (!pq.isEmpty) {
      const entry = pq.extractMin();
      if (!entry) break;
      const { key: u } = entry;
      if (u === end) break;

      for (const edge of graph.getEdgesForNode(u).filter((e) => e.source === u)) {
        const edgeKey = `${edge.source}:${edge.target}`;
        if (blockedEdges.has(edgeKey) || blockedNodes.has(edge.target)) continue;
        const alt = (dist.get(u) ?? Infinity) + edge.weight;
        if (alt < (dist.get(edge.target) ?? Infinity)) {
          dist.set(edge.target, alt);
          prev.set(edge.target, u);
          pq.insert(edge.target, alt);
        }
      }
    }

    const d = dist.get(end) ?? Infinity;
    if (!isFinite(d)) return null;
    const path = reconstructPath(prev, start, end);
    if (path.length === 0) return null;
    return { distance: d, path };
  };

  // Find first shortest path
  const first = dijkstraWithRestrictions(source, target, new Set(), new Set());
  if (!first) return [];
  results.push(first);

  for (let i = 1; i < k; i++) {
    const lastPath = results[results.length - 1]!;

    for (let j = 0; j < lastPath.path.length - 1; j++) {
      const spurNode = lastPath.path[j]!;
      const rootPath = lastPath.path.slice(0, j + 1);

      const blockedEdges = new Set<string>();
      const blockedNodes = new Set<string>(rootPath.slice(0, -1));

      // Block edges used by previous k-shortest paths with same root
      for (const prev of results) {
        if (
          prev.path.length > j &&
          prev.path.slice(0, j + 1).join(",") === rootPath.join(",")
        ) {
          const nextNode = prev.path[j + 1];
          if (nextNode) {
            blockedEdges.add(`${spurNode}:${nextNode}`);
          }
        }
      }

      const spurPath = dijkstraWithRestrictions(
        spurNode,
        target,
        blockedEdges,
        blockedNodes,
      );

      if (spurPath) {
        const fullPath = [
          ...rootPath.slice(0, -1),
          ...spurPath.path,
        ];
        // Compute total distance
        let totalDist = 0;
        for (let p = 0; p < fullPath.length - 1; p++) {
          const edges = graph.getEdgesBetween(fullPath[p]!, fullPath[p + 1]!);
          totalDist += edges.length > 0 ? Math.min(...edges.map((e) => e.weight)) : 1;
        }

        const candidate: ShortestPathResult = { distance: totalDist, path: fullPath };
        // Avoid duplicates
        const pathStr = fullPath.join(",");
        const isDuplicate =
          results.some((r) => r.path.join(",") === pathStr) ||
          candidates.some((c) => c.path.join(",") === pathStr);
        if (!isDuplicate) candidates.push(candidate);
      }
    }

    if (candidates.length === 0) break;

    // Add shortest candidate to results
    candidates.sort((a, b) => a.distance - b.distance);
    results.push(candidates.shift()!);
  }

  return results;
}

/**
 * Enumerate all paths from source to target with constraints.
 */
export function enumeratePaths(
  graph: Graph,
  source: string,
  target: string,
  options: {
    maxLength?: number;
    maxResults?: number;
    minLength?: number;
  } = {},
): string[][] {
  const { maxLength = 10, maxResults = 100, minLength = 1 } = options;
  const paths: string[][] = [];
  const currentPath: string[] = [source];
  const visited = new Set<string>([source]);

  function dfs(current: string): void {
    if (paths.length >= maxResults) return;

    if (current === target && currentPath.length - 1 >= minLength) {
      paths.push([...currentPath]);
      if (current === source) return; // don't continue from target=source case
    }

    if (currentPath.length - 1 >= maxLength) return;

    for (const w of graph.getNeighbors(current, "outgoing")) {
      if (!visited.has(w)) {
        visited.add(w);
        currentPath.push(w);
        dfs(w);
        currentPath.pop();
        visited.delete(w);
      }
    }
  }

  dfs(source);
  return paths;
}
