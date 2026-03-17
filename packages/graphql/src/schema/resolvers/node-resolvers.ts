import { eq, desc, gt, lt, and, ilike } from "drizzle-orm";
import { nodes } from "@nexus/db";
import { NexusError } from "@nexus/shared";
import type { GraphQLContext } from "../../context.js";
import type { DbNode, DbEdge } from "../../dataloaders.js";
import { encodeCursor, decodeCursor } from "./cursor.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNodeFilter(filter?: {
  type?: string;
  ownerId?: string;
  search?: string;
}) {
  const conditions: ReturnType<typeof eq>[] = [];
  if (filter?.type) conditions.push(eq(nodes.type, filter.type as any));
  if (filter?.ownerId) conditions.push(eq(nodes.ownerId, filter.ownerId));
  if (filter?.search) conditions.push(ilike(nodes.title, `%${filter.search}%`));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

// ─── Query Resolvers ──────────────────────────────────────────────────────────

export const nodeQueryResolvers = {
  node: async (
    _: unknown,
    args: { id: string },
    ctx: GraphQLContext,
  ): Promise<DbNode | null> => {
    return ctx.loaders.nodeLoader.load(args.id);
  },

  nodes: async (
    _: unknown,
    args: {
      filter?: { type?: string; ownerId?: string; search?: string };
      pagination?: { first?: number; after?: string; last?: number; before?: string };
      sortOrder?: "asc" | "desc";
    },
    ctx: GraphQLContext,
  ) => {
    const { filter, pagination, sortOrder = "desc" } = args;
    const limit = Math.min(pagination?.first ?? pagination?.last ?? 20, 100);
    const afterCursor = pagination?.after ? decodeCursor(pagination.after) : null;
    const beforeCursor = pagination?.before ? decodeCursor(pagination.before) : null;

    const filterConditions = buildNodeFilter(filter);
    const cursorCondition = afterCursor
      ? sortOrder === "desc"
        ? lt(nodes.updatedAt, new Date(afterCursor))
        : gt(nodes.updatedAt, new Date(afterCursor))
      : beforeCursor
        ? sortOrder === "desc"
          ? gt(nodes.updatedAt, new Date(beforeCursor))
          : lt(nodes.updatedAt, new Date(beforeCursor))
        : undefined;

    const where =
      filterConditions && cursorCondition
        ? and(filterConditions, cursorCondition)
        : filterConditions ?? cursorCondition;

    const orderBy =
      sortOrder === "desc" ? desc(nodes.updatedAt) : nodes.updatedAt;

    // Fetch one extra to determine hasNextPage
    const rows = await ctx.db
      .select()
      .from(nodes)
      .where(where)
      .orderBy(orderBy)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Count total
    const countResult = await ctx.db
      .select({ count: nodes.id })
      .from(nodes)
      .where(filterConditions);
    const totalCount = countResult.length;

    const edges = items.map((node) => ({
      cursor: encodeCursor(node.updatedAt.toISOString()),
      node: node as DbNode,
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage: pagination?.first !== undefined ? hasMore : false,
        hasPreviousPage: pagination?.last !== undefined ? hasMore : !!afterCursor,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
      totalCount,
    };
  },
};

// ─── Mutation Resolvers ───────────────────────────────────────────────────────

export const nodeMutationResolvers = {
  createNode: async (
    _: unknown,
    args: {
      input: {
        type: string;
        title: string;
        content?: string;
        metadata?: Record<string, unknown>;
        ownerId: string;
      };
    },
    ctx: GraphQLContext,
  ): Promise<DbNode> => {
    const { input } = args;
    const [node] = await ctx.db
      .insert(nodes)
      .values({
        type: input.type as any,
        title: input.title,
        content: input.content,
        metadata: input.metadata ?? {},
        ownerId: input.ownerId,
      })
      .returning();
    if (!node) throw new NexusError("INTERNAL_ERROR" as any, "Failed to create node");
    return node as DbNode;
  },

  updateNode: async (
    _: unknown,
    args: {
      id: string;
      input: {
        type?: string;
        title?: string;
        content?: string;
        metadata?: Record<string, unknown>;
      };
    },
    ctx: GraphQLContext,
  ): Promise<DbNode> => {
    const { id, input } = args;
    const [updated] = await ctx.db
      .update(nodes)
      .set({ ...input, type: input.type as any, updatedAt: new Date() })
      .where(eq(nodes.id, id))
      .returning();
    if (!updated) throw NexusError.notFound("Node", id);
    // Invalidate cache
    ctx.loaders.nodeLoader.clear(id);
    return updated as DbNode;
  },

  deleteNode: async (
    _: unknown,
    args: { id: string },
    ctx: GraphQLContext,
  ): Promise<boolean> => {
    const [deleted] = await ctx.db
      .delete(nodes)
      .where(eq(nodes.id, args.id))
      .returning();
    if (!deleted) throw NexusError.notFound("Node", args.id);
    ctx.loaders.nodeLoader.clear(args.id);
    return true;
  },
};

// ─── Field Resolvers ──────────────────────────────────────────────────────────

export const nodeFieldResolvers = {
  Node: {
    owner: async (node: DbNode, _: unknown, ctx: GraphQLContext) => {
      const user = await ctx.loaders.userLoader.load(node.ownerId);
      if (!user) throw NexusError.notFound("User", node.ownerId);
      return user;
    },

    outgoingEdges: async (
      node: DbNode,
      _: unknown,
      ctx: GraphQLContext,
    ): Promise<DbEdge[]> => {
      return ctx.loaders.outgoingEdgesLoader.load(node.id);
    },

    incomingEdges: async (
      node: DbNode,
      _: unknown,
      ctx: GraphQLContext,
    ): Promise<DbEdge[]> => {
      return ctx.loaders.incomingEdgesLoader.load(node.id);
    },

    connectionCount: async (
      node: DbNode,
      _: unknown,
      ctx: GraphQLContext,
    ): Promise<number> => {
      const [outgoing, incoming] = await Promise.all([
        ctx.loaders.outgoingEdgesLoader.load(node.id),
        ctx.loaders.incomingEdgesLoader.load(node.id),
      ]);
      // Deduplicate by counting unique connected node ids
      const connected = new Set([
        ...outgoing.map((e) => e.targetId),
        ...incoming.map((e) => e.sourceId),
      ]);
      return connected.size;
    },
  },
};
