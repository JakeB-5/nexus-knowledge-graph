import { eq, and, desc, sql, ilike } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { nodes } from "../schema/nodes.js";
import type { CreateNode, UpdateNode } from "@nexus/shared";

type Db = PgDatabase<any, any, any>;

export async function createNode(db: Db, data: CreateNode) {
  const [node] = await db
    .insert(nodes)
    .values({
      type: data.type,
      title: data.title,
      content: data.content,
      metadata: data.metadata,
      ownerId: data.ownerId,
    })
    .returning();
  return node!;
}

export async function getNodeById(db: Db, id: string) {
  const [node] = await db.select().from(nodes).where(eq(nodes.id, id)).limit(1);
  return node ?? null;
}

export async function updateNode(db: Db, id: string, data: UpdateNode) {
  const [node] = await db
    .update(nodes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(nodes.id, id))
    .returning();
  return node ?? null;
}

export async function deleteNode(db: Db, id: string) {
  const [node] = await db.delete(nodes).where(eq(nodes.id, id)).returning();
  return node ?? null;
}

export async function listNodes(
  db: Db,
  options: {
    ownerId?: string;
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const { ownerId, type, search, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (ownerId) conditions.push(eq(nodes.ownerId, ownerId));
  if (type) conditions.push(eq(nodes.type, type as any));
  if (search) conditions.push(ilike(nodes.title, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(nodes)
      .where(where)
      .orderBy(desc(nodes.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(nodes)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
