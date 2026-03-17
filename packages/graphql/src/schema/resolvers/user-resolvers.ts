import { eq } from "drizzle-orm";
import { users } from "@nexus/db";
import { NexusError } from "@nexus/shared";
import type { GraphQLContext } from "../../context.js";
import type { DbUser, DbNode } from "../../dataloaders.js";
import { encodeCursor } from "./cursor.js";
import { requireAuth } from "../../context.js";

// ─── Query Resolvers ──────────────────────────────────────────────────────────

export const userQueryResolvers = {
  user: async (
    _: unknown,
    args: { id: string },
    ctx: GraphQLContext,
  ): Promise<DbUser | null> => {
    return ctx.loaders.userLoader.load(args.id);
  },

  users: async (
    _: unknown,
    args: {
      pagination?: { first?: number; after?: string; last?: number; before?: string };
    },
    ctx: GraphQLContext,
  ) => {
    const limit = Math.min(
      args.pagination?.first ?? args.pagination?.last ?? 20,
      100,
    );

    const rows = await ctx.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows) as DbUser[];

    const edges = items.map((u) => ({
      cursor: encodeCursor(u.createdAt.toISOString()),
      node: u,
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage: hasMore,
        hasPreviousPage: !!args.pagination?.after,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
      totalCount: items.length,
    };
  },

  me: async (
    _: unknown,
    __: unknown,
    ctx: GraphQLContext,
  ): Promise<DbUser | null> => {
    const current = requireAuth(ctx);
    return ctx.loaders.userLoader.load(current.id);
  },
};

// ─── Mutation Resolvers ───────────────────────────────────────────────────────

export const userMutationResolvers = {
  createUser: async (
    _: unknown,
    args: {
      input: {
        email: string;
        name: string;
        password: string;
        role?: "admin" | "editor" | "viewer";
      };
    },
    ctx: GraphQLContext,
  ): Promise<DbUser> => {
    const { input } = args;

    // Check for existing email
    const existing = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existing.length > 0) {
      throw NexusError.conflict(`User with email "${input.email}" already exists`);
    }

    // In production, password would be hashed. Here we store a placeholder hash.
    const passwordHash = `hash:${input.password}`;

    const [user] = await ctx.db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role ?? "viewer",
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    if (!user) throw new NexusError("INTERNAL_ERROR" as any, "Failed to create user");
    return user as DbUser;
  },

  updateUser: async (
    _: unknown,
    args: {
      id: string;
      input: {
        name?: string;
        role?: "admin" | "editor" | "viewer";
        avatarUrl?: string;
      };
    },
    ctx: GraphQLContext,
  ): Promise<DbUser> => {
    const { id, input } = args;

    const [updated] = await ctx.db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    if (!updated) throw NexusError.notFound("User", id);
    ctx.loaders.userLoader.clear(id);
    return updated as DbUser;
  },
};

// ─── Field Resolvers ──────────────────────────────────────────────────────────

export const userFieldResolvers = {
  User: {
    nodes: async (
      user: DbUser,
      _: unknown,
      ctx: GraphQLContext,
    ): Promise<DbNode[]> => {
      return ctx.loaders.userNodesLoader.load(user.id);
    },

    nodeCount: async (
      user: DbUser,
      _: unknown,
      ctx: GraphQLContext,
    ): Promise<number> => {
      const userNodes = await ctx.loaders.userNodesLoader.load(user.id);
      return userNodes.length;
    },
  },
};
