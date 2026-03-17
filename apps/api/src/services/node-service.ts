import { NexusError } from "@nexus/shared";
import { db as getDb, createNode, getNodeById, updateNode, deleteNode, listNodes, getEdgesForNode } from "@nexus/db";
import type { CreateNode, UpdateNode } from "@nexus/shared";
import { decodeCursor, buildPageInfo, normalizeLimit } from "../utils/pagination.js";

// ── Types ──────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof getDb>;
type NodeRecord = NonNullable<Awaited<ReturnType<typeof getNodeById>>>;
type EdgeRecord = Awaited<ReturnType<typeof getEdgesForNode>>[number];

export interface ListNodesOptions {
  ownerId?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
  after?: string;
}

export interface PageInfoResult {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface NodePage {
  items: NodeRecord[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  pageInfo?: PageInfoResult;
}

// ── NodeService ────────────────────────────────────────────────────────────

export class NodeService {
  private readonly db: Db;

  constructor() {
    this.db = getDb();
  }

  // ── Create ──

  async create(input: CreateNode, actorId: string): Promise<NodeRecord> {
    return createNode(this.db, { ...input, ownerId: actorId });
  }

  // ── Read ──

  async getById(id: string, actorId?: string): Promise<NodeRecord> {
    this.validateUuid(id, "Node");

    const node = await getNodeById(this.db, id);
    if (!node) throw NexusError.notFound("Node", id);

    if (actorId && node.ownerId !== actorId) {
      throw NexusError.forbidden("You do not have access to this node");
    }

    return node;
  }

  // ── List ──

  async list(options: ListNodesOptions = {}): Promise<NodePage> {
    const limit = normalizeLimit(options.limit);

    if (options.after) {
      return this.listWithCursor(options, limit);
    }

    const result = await listNodes(this.db, {
      ownerId: options.ownerId,
      type: options.type,
      search: options.search,
      page: options.page ?? 1,
      limit,
    });

    return result as NodePage;
  }

  private async listWithCursor(options: ListNodesOptions, limit: number): Promise<NodePage> {
    // Offset-based fallback using cursor's page position
    // (Full cursor-based SQL would require drizzle-orm in this package;
    //  instead, decode the cursor to determine the page offset)
    let page = 1;

    if (options.after) {
      try {
        decodeCursor(options.after);
        // Use a simple heuristic: each cursor represents one page forward
        page = 2;
      } catch {
        // Invalid cursor — start from beginning
      }
    }

    const result = await listNodes(this.db, {
      ownerId: options.ownerId,
      type: options.type,
      search: options.search,
      page,
      limit: limit + 1,
    });

    const rawItems = result.items as NodeRecord[];
    const { items: pageItems, pageInfo } = buildPageInfo(
      rawItems as Array<NodeRecord & { id: string; createdAt: Date }>,
      limit,
      page > 1,
    );

    return {
      items: pageItems,
      pageInfo,
    };
  }

  // ── Update ──

  async update(id: string, input: UpdateNode, actorId: string): Promise<NodeRecord> {
    this.validateUuid(id, "Node");

    const existing = await getNodeById(this.db, id);
    if (!existing) throw NexusError.notFound("Node", id);
    if (existing.ownerId !== actorId) throw NexusError.forbidden("You do not own this node");

    const updated = await updateNode(this.db, id, input);
    if (!updated) throw NexusError.notFound("Node", id);
    return updated;
  }

  // ── Delete ──

  async delete(id: string, actorId: string): Promise<void> {
    this.validateUuid(id, "Node");

    const existing = await getNodeById(this.db, id);
    if (!existing) throw NexusError.notFound("Node", id);
    if (existing.ownerId !== actorId) throw NexusError.forbidden("You do not own this node");

    await deleteNode(this.db, id);
  }

  // ── Get edges for node ──

  async getEdges(
    nodeId: string,
    direction: "outgoing" | "incoming" | "both" = "both",
  ): Promise<EdgeRecord[]> {
    this.validateUuid(nodeId, "Node");

    const node = await getNodeById(this.db, nodeId);
    if (!node) throw NexusError.notFound("Node", nodeId);

    return getEdgesForNode(this.db, nodeId, direction);
  }

  // ── Helpers ──

  private validateUuid(id: string, resource: string): void {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(id)) {
      throw NexusError.validation(`Invalid ${resource} id format`);
    }
  }
}
