import { eq, and, inArray } from "drizzle-orm";
import { edges } from "@nexus/db";
import { NexusError } from "@nexus/shared";
import type { GraphQLContext } from "../../context.js";
import type { DbEdge, DbNode } from "../../dataloaders.js";
import { encodeCursor, decodeCursor } from "./cursor.js";

// ─── Query Resolvers ──────────────────────────────────────────────────────────

export const edgeQueryResolvers = {
  edge: async (
    _: unknown,
    args: { id: string },
    ctx: GraphQLContext,
  ): Promise<DbEdge | null> => {
    return ctx.loaders.edgeLoader.load(args.id);
  },

  edges: async (
    _: unknown,
    args: {
      filter?: { type?: string; sourceId?: string; targetId?: string };
      pagination?: { first?: number; after?: string; last?: number; before?: string };
    },
    ctx: GraphQLContext,
  ) => {
    const { filter, pagination } = args;
    const limit = Math.min(pagination?.first ?? pagination?.last ?? 20, 100);

    const conditions: ReturnType<typeof eq>[] = [];
    if (filter?.type) conditions.push(eq(edges.type, filter.type as any));
    if (filter?.sourceId) conditions.push(eq(edges.sourceId, filter.sourceId));
    if (filter?.targetId) conditions.push(eq(edges.targetId, filter.targetId));

    if (pagination?.after) {
      const cursor = decodeCursor(pagination.after);
      conditions.push(eq(edges.createdAt, new Date(cursor)) as any);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await ctx.db
      .select()
      .from(edges)
      .where(where)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows) as DbEdge[];

    const edgeCursors = items.map((e) => ({
      cursor: encodeCursor(e.createdAt.toISOString()),
      node: e,
    }));

    return {
      edges: edgeCursors,
      pageInfo: {
        hasNextPage: hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: edgeCursors[0]?.cursor ?? null,
        endCursor: edgeCursors[edgeCursors.length - 1]?.cursor ?? null,
      },
      totalCount: items.length,
    };
  },
};

// ─── Mutation Resolvers ───────────────────────────────────────────────────────

export const edgeMutationResolvers = {
  createEdge: async (
    _: unknown,
    args: {
      input: {
        type: string;
        sourceId: string;
        targetId: string;
        weight?: number;
        metadata?: Record<string, unknown>;
      };
    },
    ctx: GraphQLContext,
  ): Promise<DbEdge> => {
    const { input } = args;

    // Verify source and target nodes exist
    const [source, target] = await Promise.all([
      ctx.loaders.nodeLoader.load(input.sourceId),
      ctx.loaders.nodeLoader.load(input.targetId),
    ]);
    if (!source) throw NexusError.notFound("Node", input.sourceId);
    if (!target) throw NexusError.notFound("Node", input.targetId);

    const [edge] = await ctx.db
      .insert(edges)
      .values({
        type: input.type as any,
        sourceId: input.sourceId,
        targetId: input.targetId,
        weight: input.weight ?? 1,
        metadata: input.metadata ?? {},
      })
      .returning();

    if (!edge) throw new NexusError("INTERNAL_ERROR" as any, "Failed to create edge");

    // Invalidate outgoing/incoming edge caches for both nodes
    ctx.loaders.outgoingEdgesLoader.clear(input.sourceId);
    ctx.loaders.incomingEdgesLoader.clear(input.targetId);

    return edge as DbEdge;
  },

  deleteEdge: async (
    _: unknown,
    args: { id: string },
    ctx: GraphQLContext,
  ): Promise<boolean> => {
    // Load the edge first to invalidate caches
    const existingEdge = await ctx.loaders.edgeLoader.load(args.id);
    if (!existingEdge) throw NexusError.notFound("Edge", args.id);

    const [deleted] = await ctx.db
      .delete(edges)
      .where(eq(edges.id, args.id))
      .returning();

    if (!deleted) throw NexusError.notFound("Edge", args.id);

    ctx.loaders.edgeLoader.clear(args.id);
    ctx.loaders.outgoingEdgesLoader.clear(existingEdge.sourceId);
    ctx.loaders.incomingEdgesLoader.clear(existingEdge.targetId);

    return true;
  },
};

// ─── Field Resolvers ──────────────────────────────────────────────────────────

export const edgeFieldResolvers = {
  Edge: {
    source: async (
      edge: DbEdge,
      _: unknown,
      ctx: GraphQLContext,
    ): Promise<DbNode> => {
      const node = await ctx.loaders.nodeLoader.load(edge.sourceId);
      if (!node) throw NexusError.notFound("Node", edge.sourceId);
      return node;
    },

    target: async (
      edge: DbEdge,
      _: unknown,
      ctx: GraphQLContext,
    ): Promise<DbNode> => {
      const node = await ctx.loaders.nodeLoader.load(edge.targetId);
      if (!node) throw NexusError.notFound("Node", edge.targetId);
      return node;
    },
  },
};
