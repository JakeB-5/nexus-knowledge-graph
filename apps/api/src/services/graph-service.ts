import { NexusError, ErrorCode } from "@nexus/shared";
import { db as getDb, nodes, edges } from "@nexus/db";
import { Graph, bfs, pageRank, communityDetection } from "@nexus/graph";
import type { GraphTraversalOptions } from "@nexus/shared";
import { inArray } from "drizzle-orm";
import { LRUCache } from "../utils/lru-cache.js";

// ── Types (local, since @nexus/graph doesn't re-export them) ──────────────

interface PageRankResult {
  scores: Map<string, number>;
  iterations: number;
  converged: boolean;
}

interface Community {
  id: number;
  members: string[];
  modularity: number;
}

interface TraversalResult {
  visited: string[];
  paths: Map<string, string[]>;
  depth: Map<string, number>;
}

// ── Cache ──────────────────────────────────────────────────────────────────

interface CachedGraph {
  graph: Graph;
  nodeIds: Set<string>;
}

const graphCache = new LRUCache<string, CachedGraph>({
  maxSize: 50,
  defaultTtlMs: 5 * 60_000, // 5 minutes
});

const pageRankCache = new LRUCache<string, PageRankResult>({
  maxSize: 100,
  defaultTtlMs: 10 * 60_000,
});

const communityCache = new LRUCache<string, Community[]>({
  maxSize: 50,
  defaultTtlMs: 10 * 60_000,
});

// ── GraphService ───────────────────────────────────────────────────────────

export class GraphService {
  private readonly db: ReturnType<typeof getDb>;

  constructor() {
    this.db = getDb();
  }

  /**
   * Load a subgraph rooted at nodeId (up to maxDepth hops) from the DB
   * and materialise it as a Graph instance. Results are cached per root+depth.
   */
  async loadSubgraph(rootId: string, maxDepth = 3): Promise<Graph> {
    this.validateUuid(rootId, "Node");
    if (maxDepth > 10) maxDepth = 10;

    const cacheKey = `${rootId}:${maxDepth}`;
    const cached = graphCache.get(cacheKey);
    if (cached) return cached.graph;

    // BFS to collect reachable node IDs
    const visitedNodes = new Set<string>([rootId]);
    const collectedEdgeRows: Array<typeof edges.$inferSelect> = [];
    let frontier = [rootId];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const edgeRows = await this.db
        .select()
        .from(edges)
        .where(inArray(edges.sourceId, frontier));

      const nextFrontier: string[] = [];
      for (const edge of edgeRows) {
        collectedEdgeRows.push(edge);
        if (!visitedNodes.has(edge.targetId)) {
          visitedNodes.add(edge.targetId);
          nextFrontier.push(edge.targetId);
        }
      }
      frontier = nextFrontier;
    }

    // Load node records
    const nodeIds = [...visitedNodes];
    const nodeRows =
      nodeIds.length > 0
        ? await this.db.select().from(nodes).where(inArray(nodes.id, nodeIds))
        : [];

    // Build Graph instance
    const graph = new Graph();
    for (const node of nodeRows) {
      graph.addNode({
        id: node.id,
        type: node.type,
        metadata: (node.metadata as Record<string, unknown>) ?? {},
      });
    }
    for (const edge of collectedEdgeRows) {
      try {
        graph.addEdge({
          id: edge.id,
          source: edge.sourceId,
          target: edge.targetId,
          type: edge.type,
          weight: edge.weight,
        });
      } catch {
        // Skip edges whose nodes weren't loaded (depth truncation)
      }
    }

    graphCache.set(cacheKey, { graph, nodeIds: visitedNodes });
    return graph;
  }

  // ── Traversal ──

  async traverse(
    rootId: string,
    options: GraphTraversalOptions,
  ): Promise<TraversalResult> {
    this.validateUuid(rootId, "Node");

    const maxDepth = Math.min(options.maxDepth ?? 5, 10);
    const graph = await this.loadSubgraph(rootId, maxDepth);

    if (!graph.getNode(rootId)) {
      throw NexusError.notFound("Node", rootId);
    }

    if (graph.nodeCount > (options.maxNodes ?? 1000)) {
      throw new NexusError(
        ErrorCode.GRAPH_MAX_DEPTH_EXCEEDED,
        `Graph exceeds maxNodes limit of ${options.maxNodes}`,
        400,
      );
    }

    return bfs(graph, rootId, { maxDepth }) as TraversalResult;
  }

  // ── PageRank ──

  async computePageRank(
    rootId: string,
    maxDepth = 3,
    options: { dampingFactor?: number; maxIterations?: number } = {},
  ): Promise<PageRankResult> {
    this.validateUuid(rootId, "Node");

    const cacheKey = `pr:${rootId}:${maxDepth}:${options.dampingFactor ?? 0.85}`;
    const cached = pageRankCache.get(cacheKey);
    if (cached) return cached;

    const graph = await this.loadSubgraph(rootId, maxDepth);
    const result = pageRank(graph, options) as PageRankResult;

    pageRankCache.set(cacheKey, result);
    return result;
  }

  /**
   * Returns the top N nodes by PageRank score for a subgraph.
   */
  async topByPageRank(
    rootId: string,
    topN = 10,
    maxDepth = 3,
  ): Promise<Array<{ nodeId: string; score: number; rank: number }>> {
    const result = await this.computePageRank(rootId, maxDepth);
    return [...result.scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([nodeId, score], i) => ({ nodeId, score, rank: i + 1 }));
  }

  // ── Community detection ──

  async detectCommunities(rootId: string, maxDepth = 3): Promise<Community[]> {
    this.validateUuid(rootId, "Node");

    const cacheKey = `comm:${rootId}:${maxDepth}`;
    const cached = communityCache.get(cacheKey);
    if (cached) return cached;

    const graph = await this.loadSubgraph(rootId, maxDepth);
    const communities = communityDetection(graph) as Community[];

    communityCache.set(cacheKey, communities);
    return communities;
  }

  // ── Shortest path ──

  async shortestPath(sourceId: string, targetId: string): Promise<string[]> {
    this.validateUuid(sourceId, "source Node");
    this.validateUuid(targetId, "target Node");

    // Load a graph large enough to find a path (depth 6 is usually sufficient)
    const graph = await this.loadSubgraph(sourceId, 6);

    // BFS-based shortest path using graph.getNeighbors
    const visited = new Set<string>([sourceId]);
    const parent = new Map<string, string>();
    const queue = [sourceId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === targetId) break;

      const outgoing = graph.getNeighbors(current, "outgoing");
      for (const neighbor of outgoing) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, current);
          queue.push(neighbor);
        }
      }
    }

    if (!parent.has(targetId) && sourceId !== targetId) {
      return []; // no path found
    }

    // Reconstruct path
    const path: string[] = [];
    let current: string | undefined = targetId;
    while (current !== undefined) {
      path.unshift(current);
      current = parent.get(current);
    }
    return path;
  }

  // ── Cache invalidation ──

  invalidateCache(rootId?: string): void {
    if (rootId) {
      for (const [key] of graphCache) {
        const k = key as string;
        if (k.startsWith(rootId)) {
          graphCache.delete(k);
        }
      }
      for (const [key] of pageRankCache) {
        const k = key as string;
        if (k.includes(rootId)) pageRankCache.delete(k);
      }
      for (const [key] of communityCache) {
        const k = key as string;
        if (k.includes(rootId)) communityCache.delete(k);
      }
    } else {
      graphCache.clear();
      pageRankCache.clear();
      communityCache.clear();
    }
  }

  // ── Helpers ──

  private validateUuid(id: string, resource: string): void {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(id)) {
      throw NexusError.validation(`Invalid ${resource} id format`);
    }
  }
}
