import { NexusError, ErrorCode } from "@nexus/shared";
import { db as getDb, createEdge, getEdgeById, deleteEdge, getEdgesForNode, getEdgesBetween, getNodeById } from "@nexus/db";
import type { CreateEdge } from "@nexus/shared";

// ── Types ──────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof getDb>;
type EdgeRecord = NonNullable<Awaited<ReturnType<typeof getEdgeById>>>;
type NodeRecord = NonNullable<Awaited<ReturnType<typeof getNodeById>>>;

export interface SubgraphResult {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
}

// ── Cycle detection ────────────────────────────────────────────────────────

/**
 * Detects if adding an edge from sourceId → targetId would create a cycle.
 * Uses iterative BFS starting from targetId to check if we can reach sourceId.
 */
async function wouldCreateCycle(
  db: Db,
  sourceId: string,
  targetId: string,
  maxDepth = 50,
): Promise<boolean> {
  if (sourceId === targetId) return true;

  const visited = new Set<string>([targetId]);
  let frontier = [targetId];
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    depth++;
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      const outgoing = await getEdgesForNode(db, nodeId, "outgoing");
      for (const edge of outgoing) {
        if (edge.targetId === sourceId) return true;
        if (!visited.has(edge.targetId)) {
          visited.add(edge.targetId);
          nextFrontier.push(edge.targetId);
        }
      }
    }
    frontier = nextFrontier;
  }

  return false;
}

// ── EdgeService ────────────────────────────────────────────────────────────

export class EdgeService {
  private readonly db: Db;

  constructor() {
    this.db = getDb();
  }

  // ── Create ──

  async create(input: CreateEdge): Promise<EdgeRecord> {
    await this.validateNodes(input.sourceId, input.targetId);
    this.validateWeight(input.weight);

    // Cycle detection
    const cycle = await wouldCreateCycle(this.db, input.sourceId, input.targetId);
    if (cycle) {
      throw new NexusError(
        ErrorCode.GRAPH_CYCLE_DETECTED,
        `Adding edge from ${input.sourceId} to ${input.targetId} would create a cycle`,
        400,
      );
    }

    // Duplicate check: same source, target, type
    const existingEdges = await getEdgesBetween(this.db, input.sourceId, input.targetId);
    const duplicate = existingEdges.find((e) => e.type === input.type);
    if (duplicate) {
      throw NexusError.conflict(
        `Edge of type "${input.type}" already exists between these nodes`,
      );
    }

    return createEdge(this.db, input);
  }

  // ── Batch create ──

  async createBatch(
    inputs: CreateEdge[],
  ): Promise<{ created: EdgeRecord[]; failed: Array<{ input: CreateEdge; error: string }> }> {
    const created: EdgeRecord[] = [];
    const failed: Array<{ input: CreateEdge; error: string }> = [];

    for (const input of inputs) {
      try {
        const edge = await this.create(input);
        created.push(edge);
      } catch (err) {
        failed.push({
          input,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { created, failed };
  }

  // ── Read ──

  async getById(id: string): Promise<EdgeRecord> {
    this.validateUuid(id, "Edge");
    const edge = await getEdgeById(this.db, id);
    if (!edge) throw NexusError.notFound("Edge", id);
    return edge;
  }

  // ── Delete ──

  async delete(id: string, actorId?: string): Promise<void> {
    this.validateUuid(id, "Edge");

    const edge = await getEdgeById(this.db, id);
    if (!edge) throw NexusError.notFound("Edge", id);

    if (actorId) {
      const sourceNode = await getNodeById(this.db, edge.sourceId);
      if (sourceNode && sourceNode.ownerId !== actorId) {
        throw NexusError.forbidden("You do not have permission to delete this edge");
      }
    }

    await deleteEdge(this.db, id);
  }

  // ── Edges for node ──

  async getEdgesForNode(
    nodeId: string,
    direction: "outgoing" | "incoming" | "both" = "both",
  ): Promise<EdgeRecord[]> {
    this.validateUuid(nodeId, "Node");
    return getEdgesForNode(this.db, nodeId, direction);
  }

  // ── Edges between two nodes ──

  async getEdgesBetween(sourceId: string, targetId: string): Promise<EdgeRecord[]> {
    this.validateUuid(sourceId, "source Node");
    this.validateUuid(targetId, "target Node");
    return getEdgesBetween(this.db, sourceId, targetId);
  }

  // ── Subgraph ──

  /**
   * Returns all nodes and edges reachable from rootId within maxDepth hops.
   */
  async getSubgraph(rootId: string, maxDepth = 3): Promise<SubgraphResult> {
    this.validateUuid(rootId, "Node");
    if (maxDepth > 10) maxDepth = 10;

    const visitedNodeIds = new Set<string>([rootId]);
    const collectedEdges = new Map<string, EdgeRecord>();
    let frontier = [rootId];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        const outgoing = await getEdgesForNode(this.db, nodeId, "outgoing");
        for (const edge of outgoing) {
          collectedEdges.set(edge.id, edge);
          if (!visitedNodeIds.has(edge.targetId)) {
            visitedNodeIds.add(edge.targetId);
            nextFrontier.push(edge.targetId);
          }
        }
      }
      frontier = nextFrontier;
    }

    // Load all node records in parallel
    const nodeRecords = await Promise.all(
      [...visitedNodeIds].map((id) => getNodeById(this.db, id)),
    );

    return {
      nodes: nodeRecords.filter((n): n is NodeRecord => n !== null),
      edges: [...collectedEdges.values()],
    };
  }

  // ── Helpers ──

  private async validateNodes(sourceId: string, targetId: string): Promise<void> {
    this.validateUuid(sourceId, "source node");
    this.validateUuid(targetId, "target node");

    if (sourceId === targetId) {
      throw NexusError.validation("Source and target nodes must be different");
    }

    const [source, target] = await Promise.all([
      getNodeById(this.db, sourceId),
      getNodeById(this.db, targetId),
    ]);

    if (!source) throw NexusError.notFound("Node", sourceId);
    if (!target) throw NexusError.notFound("Node", targetId);
  }

  private validateWeight(weight: number | undefined): void {
    if (weight === undefined) return;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw NexusError.validation("Edge weight must be a number between 0 and 1");
    }
  }

  private validateUuid(id: string, resource: string): void {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(id)) {
      throw NexusError.validation(`Invalid ${resource} id format`);
    }
  }
}
