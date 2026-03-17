import { Graph, bfs, dfs, shortestPath, pageRank, communityDetection } from "@nexus/graph";
import { NexusError } from "@nexus/shared";
import type { GraphQLContext } from "../../context.js";
import type { DbNode, DbEdge } from "../../dataloaders.js";
import { nodes, edges } from "@nexus/db";

// ─── Graph Builder ────────────────────────────────────────────────────────────

async function buildGraph(ctx: GraphQLContext): Promise<Graph> {
  const [allNodes, allEdges] = await Promise.all([
    ctx.db.select().from(nodes),
    ctx.db.select().from(edges),
  ]);

  const graph = new Graph();

  for (const n of allNodes) {
    graph.addNode({ id: n.id, type: n.type, metadata: n.metadata as Record<string, unknown> });
  }

  for (const e of allEdges) {
    try {
      graph.addEdge({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        type: e.type,
        weight: e.weight,
      });
    } catch {
      // Skip edges with missing nodes (data integrity issue)
    }
  }

  return graph;
}

// ─── Query Resolvers ──────────────────────────────────────────────────────────

export const graphQueryResolvers = {
  traverse: async (
    _: unknown,
    args: {
      input: {
        startNodeId: string;
        mode: "BFS" | "DFS";
        direction?: "outgoing" | "incoming" | "both";
        maxDepth?: number;
        maxNodes?: number;
        edgeTypes?: string[];
      };
    },
    ctx: GraphQLContext,
  ) => {
    const { input } = args;

    const startNode = await ctx.loaders.nodeLoader.load(input.startNodeId);
    if (!startNode) throw NexusError.notFound("Node", input.startNodeId);

    const graph = await buildGraph(ctx);

    const options = {
      maxDepth: input.maxDepth ?? 5,
      maxNodes: input.maxNodes ?? 100,
      direction: input.direction ?? "outgoing",
      edgeTypes: input.edgeTypes,
    };

    const result =
      input.mode === "BFS"
        ? bfs(graph, input.startNodeId, options)
        : dfs(graph, input.startNodeId, options);

    // Load all visited nodes via DataLoader (batched)
    const visitedNodes = await Promise.all(
      result.visited.map((id) => ctx.loaders.nodeLoader.load(id)),
    );

    const paths = result.visited.map((nodeId) => ({
      nodeId,
      path: result.paths.get(nodeId) ?? [nodeId],
      depth: result.depth.get(nodeId) ?? 0,
    }));

    return {
      nodes: visitedNodes.filter((n): n is DbNode => n !== null),
      paths,
      totalVisited: result.visited.length,
    };
  },

  shortestPath: async (
    _: unknown,
    args: {
      sourceId: string;
      targetId: string;
      direction?: "outgoing" | "incoming" | "both";
    },
    ctx: GraphQLContext,
  ) => {
    const [source, target] = await Promise.all([
      ctx.loaders.nodeLoader.load(args.sourceId),
      ctx.loaders.nodeLoader.load(args.targetId),
    ]);

    if (!source) throw NexusError.notFound("Node", args.sourceId);
    if (!target) throw NexusError.notFound("Node", args.targetId);

    const graph = await buildGraph(ctx);
    const pathIds = shortestPath(
      graph,
      args.sourceId,
      args.targetId,
      args.direction ?? "outgoing",
    );

    if (!pathIds) {
      return { path: null, length: null, found: false };
    }

    const pathNodes = await Promise.all(
      pathIds.map((id) => ctx.loaders.nodeLoader.load(id)),
    );

    const filteredPath = pathNodes.filter((n): n is DbNode => n !== null);

    return {
      path: filteredPath,
      length: filteredPath.length - 1,
      found: true,
    };
  },

  pageRank: async (
    _: unknown,
    args: { topN?: number; dampingFactor?: number },
    ctx: GraphQLContext,
  ) => {
    const graph = await buildGraph(ctx);
    const result = pageRank(graph, {
      dampingFactor: args.dampingFactor ?? 0.85,
      maxIterations: 100,
      tolerance: 1e-6,
    });

    const scored = Array.from(result.scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, args.topN ?? 10);

    const rankedNodes = await Promise.all(
      scored.map(([id]) => ctx.loaders.nodeLoader.load(id)),
    );

    return scored
      .map(([id, score], index) => ({
        node: rankedNodes[index],
        score,
        rank: index + 1,
      }))
      .filter((entry): entry is { node: DbNode; score: number; rank: number } =>
        entry.node !== null,
      );
  },

  communities: async (
    _: unknown,
    args: { resolution?: number },
    ctx: GraphQLContext,
  ) => {
    const graph = await buildGraph(ctx);
    const detected = communityDetection(graph, {
      resolution: args.resolution ?? 1.0,
    });

    return Promise.all(
      detected.map(async (community) => {
        const memberNodes = await Promise.all(
          community.members.map((id) => ctx.loaders.nodeLoader.load(id)),
        );
        return {
          id: community.id,
          members: memberNodes.filter((n): n is DbNode => n !== null),
          size: community.members.length,
          modularity: community.modularity,
        };
      }),
    );
  },

  graphStats: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
    const graph = await buildGraph(ctx);
    const nodeCount = graph.nodeCount;
    const edgeCount = graph.edgeCount;

    // Density = edges / (nodes * (nodes - 1)) for directed graph
    const maxPossibleEdges = nodeCount * (nodeCount - 1);
    const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;

    // Average degree = 2 * edges / nodes (undirected equivalent)
    const averageDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

    // Connected components via BFS flood fill
    const allNodeIds = graph.getAllNodes().map((n) => n.id);
    const visited = new Set<string>();
    let connectedComponents = 0;

    for (const nodeId of allNodeIds) {
      if (!visited.has(nodeId)) {
        connectedComponents++;
        const result = bfs(graph, nodeId, {
          direction: "both",
          maxNodes: nodeCount,
        });
        for (const id of result.visited) {
          visited.add(id);
        }
      }
    }

    return {
      nodeCount,
      edgeCount,
      density: Math.round(density * 10000) / 10000,
      averageDegree: Math.round(averageDegree * 100) / 100,
      connectedComponents,
    };
  },
};
