import { eq, and, or } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { edges } from "../schema/edges.js";
import type { CreateEdge } from "@nexus/shared";

type Db = PgDatabase<any, any, any>;

export async function createEdge(db: Db, data: CreateEdge) {
  const [edge] = await db
    .insert(edges)
    .values({
      type: data.type,
      sourceId: data.sourceId,
      targetId: data.targetId,
      weight: data.weight,
      metadata: data.metadata,
    })
    .returning();
  return edge!;
}

export async function getEdgeById(db: Db, id: string) {
  const [edge] = await db.select().from(edges).where(eq(edges.id, id)).limit(1);
  return edge ?? null;
}

export async function deleteEdge(db: Db, id: string) {
  const [edge] = await db.delete(edges).where(eq(edges.id, id)).returning();
  return edge ?? null;
}

export async function getEdgesForNode(
  db: Db,
  nodeId: string,
  direction: "outgoing" | "incoming" | "both" = "both",
) {
  const conditions =
    direction === "outgoing"
      ? eq(edges.sourceId, nodeId)
      : direction === "incoming"
        ? eq(edges.targetId, nodeId)
        : or(eq(edges.sourceId, nodeId), eq(edges.targetId, nodeId));

  return db.select().from(edges).where(conditions);
}

export async function getEdgesBetween(
  db: Db,
  sourceId: string,
  targetId: string,
) {
  return db
    .select()
    .from(edges)
    .where(and(eq(edges.sourceId, sourceId), eq(edges.targetId, targetId)));
}
