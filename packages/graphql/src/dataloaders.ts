import DataLoader from "dataloader";
import { eq, inArray } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { nodes, edges, users } from "@nexus/db";

type Db = PgDatabase<any, any, any>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbNode {
  id: string;
  type: string;
  title: string;
  content: string | null;
  metadata: Record<string, unknown>;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbEdge {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataLoaders {
  nodeLoader: DataLoader<string, DbNode | null>;
  edgeLoader: DataLoader<string, DbEdge | null>;
  userLoader: DataLoader<string, DbUser | null>;
  outgoingEdgesLoader: DataLoader<string, DbEdge[]>;
  incomingEdgesLoader: DataLoader<string, DbEdge[]>;
  userNodesLoader: DataLoader<string, DbNode[]>;
}

// ─── Batch Functions ──────────────────────────────────────────────────────────

async function batchLoadNodes(
  db: Db,
  ids: readonly string[],
): Promise<Array<DbNode | null>> {
  if (ids.length === 0) return [];

  const rows = await db
    .select()
    .from(nodes)
    .where(inArray(nodes.id, ids as string[]));

  const map = new Map<string, DbNode>(rows.map((r) => [r.id, r as DbNode]));
  return ids.map((id) => map.get(id) ?? null);
}

async function batchLoadEdges(
  db: Db,
  ids: readonly string[],
): Promise<Array<DbEdge | null>> {
  if (ids.length === 0) return [];

  const rows = await db
    .select()
    .from(edges)
    .where(inArray(edges.id, ids as string[]));

  const map = new Map<string, DbEdge>(rows.map((r) => [r.id, r as DbEdge]));
  return ids.map((id) => map.get(id) ?? null);
}

async function batchLoadUsers(
  db: Db,
  ids: readonly string[],
): Promise<Array<DbUser | null>> {
  if (ids.length === 0) return [];

  const rows = await db
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
    .where(inArray(users.id, ids as string[]));

  const map = new Map<string, DbUser>(rows.map((r) => [r.id, r as DbUser]));
  return ids.map((id) => map.get(id) ?? null);
}

async function batchLoadOutgoingEdges(
  db: Db,
  nodeIds: readonly string[],
): Promise<DbEdge[][]> {
  if (nodeIds.length === 0) return nodeIds.map(() => []);

  const rows = await db
    .select()
    .from(edges)
    .where(inArray(edges.sourceId, nodeIds as string[]));

  const map = new Map<string, DbEdge[]>();
  for (const nodeId of nodeIds) {
    map.set(nodeId, []);
  }
  for (const row of rows) {
    const list = map.get(row.sourceId);
    if (list) list.push(row as DbEdge);
  }
  return nodeIds.map((id) => map.get(id) ?? []);
}

async function batchLoadIncomingEdges(
  db: Db,
  nodeIds: readonly string[],
): Promise<DbEdge[][]> {
  if (nodeIds.length === 0) return nodeIds.map(() => []);

  const rows = await db
    .select()
    .from(edges)
    .where(inArray(edges.targetId, nodeIds as string[]));

  const map = new Map<string, DbEdge[]>();
  for (const nodeId of nodeIds) {
    map.set(nodeId, []);
  }
  for (const row of rows) {
    const list = map.get(row.targetId);
    if (list) list.push(row as DbEdge);
  }
  return nodeIds.map((id) => map.get(id) ?? []);
}

async function batchLoadUserNodes(
  db: Db,
  ownerIds: readonly string[],
): Promise<DbNode[][]> {
  if (ownerIds.length === 0) return ownerIds.map(() => []);

  const rows = await db
    .select()
    .from(nodes)
    .where(inArray(nodes.ownerId, ownerIds as string[]));

  const map = new Map<string, DbNode[]>();
  for (const ownerId of ownerIds) {
    map.set(ownerId, []);
  }
  for (const row of rows) {
    const list = map.get(row.ownerId);
    if (list) list.push(row as DbNode);
  }
  return ownerIds.map((id) => map.get(id) ?? []);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createLoaders(db: Db): DataLoaders {
  const nodeLoader = new DataLoader<string, DbNode | null>(
    (ids) => batchLoadNodes(db, ids),
    { maxBatchSize: 100, cache: true },
  );

  const edgeLoader = new DataLoader<string, DbEdge | null>(
    (ids) => batchLoadEdges(db, ids),
    { maxBatchSize: 100, cache: true },
  );

  const userLoader = new DataLoader<string, DbUser | null>(
    (ids) => batchLoadUsers(db, ids),
    { maxBatchSize: 100, cache: true },
  );

  const outgoingEdgesLoader = new DataLoader<string, DbEdge[]>(
    (nodeIds) => batchLoadOutgoingEdges(db, nodeIds),
    { maxBatchSize: 100, cache: true },
  );

  const incomingEdgesLoader = new DataLoader<string, DbEdge[]>(
    (nodeIds) => batchLoadIncomingEdges(db, nodeIds),
    { maxBatchSize: 100, cache: true },
  );

  const userNodesLoader = new DataLoader<string, DbNode[]>(
    (ownerIds) => batchLoadUserNodes(db, ownerIds),
    { maxBatchSize: 100, cache: true },
  );

  return {
    nodeLoader,
    edgeLoader,
    userLoader,
    outgoingEdgesLoader,
    incomingEdgesLoader,
    userNodesLoader,
  };
}
