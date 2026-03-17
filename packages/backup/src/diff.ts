/**
 * BackupDiff - compare two backups, generate and apply incremental backups
 */

import { randomUUID } from "crypto";
import type {
  BackupEdge,
  BackupMetadata,
  BackupNode,
  BackupPayload,
  BackupUser,
} from "./types.js";
import { BackupFormat, BackupStatus } from "./types.js";

export interface NodeDiff {
  type: "added" | "removed" | "modified";
  id: string;
  before?: BackupNode;
  after?: BackupNode;
  changedFields?: string[];
}

export interface EdgeDiff {
  type: "added" | "removed" | "modified";
  id: string;
  before?: BackupEdge;
  after?: BackupEdge;
  changedFields?: string[];
}

export interface UserDiff {
  type: "added" | "removed" | "modified";
  id: string;
  before?: BackupUser;
  after?: BackupUser;
}

export interface DiffResult {
  nodes: NodeDiff[];
  edges: EdgeDiff[];
  users: UserDiff[];
  summary: {
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
    edgesModified: number;
    usersAdded: number;
    usersRemoved: number;
    usersModified: number;
    totalChanges: number;
  };
}

/** An incremental backup payload (only changes) */
export interface IncrementalBackupPayload {
  metadata: BackupMetadata;
  baseBackupId: string;
  addedNodes: BackupNode[];
  removedNodeIds: string[];
  modifiedNodes: BackupNode[];
  addedEdges: BackupEdge[];
  removedEdgeIds: string[];
  modifiedEdges: BackupEdge[];
  addedUsers: BackupUser[];
  removedUserIds: string[];
  modifiedUsers: BackupUser[];
}

export class BackupDiff {
  /** Compare two backup payloads and return a diff */
  compare(base: BackupPayload, current: BackupPayload): DiffResult {
    const nodeDiffs = this.diffNodes(base.nodes, current.nodes);
    const edgeDiffs = this.diffEdges(base.edges, current.edges);
    const userDiffs = this.diffUsers(base.users, current.users);

    const nodesAdded = nodeDiffs.filter((d) => d.type === "added").length;
    const nodesRemoved = nodeDiffs.filter((d) => d.type === "removed").length;
    const nodesModified = nodeDiffs.filter((d) => d.type === "modified").length;
    const edgesAdded = edgeDiffs.filter((d) => d.type === "added").length;
    const edgesRemoved = edgeDiffs.filter((d) => d.type === "removed").length;
    const edgesModified = edgeDiffs.filter((d) => d.type === "modified").length;
    const usersAdded = userDiffs.filter((d) => d.type === "added").length;
    const usersRemoved = userDiffs.filter((d) => d.type === "removed").length;
    const usersModified = userDiffs.filter((d) => d.type === "modified").length;

    return {
      nodes: nodeDiffs,
      edges: edgeDiffs,
      users: userDiffs,
      summary: {
        nodesAdded,
        nodesRemoved,
        nodesModified,
        edgesAdded,
        edgesRemoved,
        edgesModified,
        usersAdded,
        usersRemoved,
        usersModified,
        totalChanges:
          nodesAdded + nodesRemoved + nodesModified +
          edgesAdded + edgesRemoved + edgesModified +
          usersAdded + usersRemoved + usersModified,
      },
    };
  }

  /** Generate an incremental backup from base to current */
  generateIncremental(
    base: BackupPayload,
    current: BackupPayload
  ): IncrementalBackupPayload {
    const diff = this.compare(base, current);

    const id = randomUUID();
    const metadata: BackupMetadata = {
      id,
      timestamp: new Date(),
      schemaVersion: current.metadata.schemaVersion,
      format: BackupFormat.Json,
      size: 0,
      nodeCount: diff.summary.nodesAdded + diff.summary.nodesModified,
      edgeCount: diff.summary.edgesAdded + diff.summary.edgesModified,
      userCount: diff.summary.usersAdded + diff.summary.usersModified,
      status: BackupStatus.Completed,
      checksum: "",
      baseBackupId: base.metadata.id,
      tags: ["incremental"],
    };

    return {
      metadata,
      baseBackupId: base.metadata.id,
      addedNodes: diff.nodes.filter((d) => d.type === "added").map((d) => d.after!),
      removedNodeIds: diff.nodes.filter((d) => d.type === "removed").map((d) => d.id),
      modifiedNodes: diff.nodes.filter((d) => d.type === "modified").map((d) => d.after!),
      addedEdges: diff.edges.filter((d) => d.type === "added").map((d) => d.after!),
      removedEdgeIds: diff.edges.filter((d) => d.type === "removed").map((d) => d.id),
      modifiedEdges: diff.edges.filter((d) => d.type === "modified").map((d) => d.after!),
      addedUsers: diff.users.filter((d) => d.type === "added").map((d) => d.after!),
      removedUserIds: diff.users.filter((d) => d.type === "removed").map((d) => d.id),
      modifiedUsers: diff.users.filter((d) => d.type === "modified").map((d) => d.after!),
    };
  }

  /** Apply an incremental backup on top of a base payload */
  applyIncremental(base: BackupPayload, incremental: IncrementalBackupPayload): BackupPayload {
    // Nodes
    const removedNodeIds = new Set(incremental.removedNodeIds);
    const modifiedNodesMap = new Map(incremental.modifiedNodes.map((n) => [n.id, n]));

    const nodes: BackupNode[] = base.nodes
      .filter((n) => !removedNodeIds.has(n.id))
      .map((n) => modifiedNodesMap.get(n.id) ?? n);

    nodes.push(...incremental.addedNodes);

    // Edges
    const removedEdgeIds = new Set(incremental.removedEdgeIds);
    const modifiedEdgesMap = new Map(incremental.modifiedEdges.map((e) => [e.id, e]));

    const edges: BackupEdge[] = base.edges
      .filter((e) => !removedEdgeIds.has(e.id))
      .map((e) => modifiedEdgesMap.get(e.id) ?? e);

    edges.push(...incremental.addedEdges);

    // Users
    const removedUserIds = new Set(incremental.removedUserIds);
    const modifiedUsersMap = new Map(incremental.modifiedUsers.map((u) => [u.id, u]));

    const users: BackupUser[] = base.users
      .filter((u) => !removedUserIds.has(u.id))
      .map((u) => modifiedUsersMap.get(u.id) ?? u);

    users.push(...incremental.addedUsers);

    return {
      metadata: {
        ...incremental.metadata,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        userCount: users.length,
      },
      nodes,
      edges,
      users,
    };
  }

  /** Merge multiple incremental backups into a single incremental */
  mergeIncrementals(incrementals: IncrementalBackupPayload[]): IncrementalBackupPayload {
    if (incrementals.length === 0) {
      throw new Error("Cannot merge empty list of incrementals");
    }

    const first = incrementals[0]!;
    const last = incrementals[incrementals.length - 1]!;

    const addedNodes = new Map<string, BackupNode>();
    const removedNodeIds = new Set<string>();
    const modifiedNodes = new Map<string, BackupNode>();

    const addedEdges = new Map<string, BackupEdge>();
    const removedEdgeIds = new Set<string>();
    const modifiedEdges = new Map<string, BackupEdge>();

    const addedUsers = new Map<string, BackupUser>();
    const removedUserIds = new Set<string>();
    const modifiedUsers = new Map<string, BackupUser>();

    for (const inc of incrementals) {
      for (const n of inc.addedNodes) addedNodes.set(n.id, n);
      for (const id of inc.removedNodeIds) {
        removedNodeIds.add(id);
        addedNodes.delete(id);
        modifiedNodes.delete(id);
      }
      for (const n of inc.modifiedNodes) {
        if (!addedNodes.has(n.id)) modifiedNodes.set(n.id, n);
        else addedNodes.set(n.id, n);
      }

      for (const e of inc.addedEdges) addedEdges.set(e.id, e);
      for (const id of inc.removedEdgeIds) {
        removedEdgeIds.add(id);
        addedEdges.delete(id);
        modifiedEdges.delete(id);
      }
      for (const e of inc.modifiedEdges) {
        if (!addedEdges.has(e.id)) modifiedEdges.set(e.id, e);
        else addedEdges.set(e.id, e);
      }

      for (const u of inc.addedUsers) addedUsers.set(u.id, u);
      for (const id of inc.removedUserIds) {
        removedUserIds.add(id);
        addedUsers.delete(id);
        modifiedUsers.delete(id);
      }
      for (const u of inc.modifiedUsers) {
        if (!addedUsers.has(u.id)) modifiedUsers.set(u.id, u);
        else addedUsers.set(u.id, u);
      }
    }

    return {
      metadata: last.metadata,
      baseBackupId: first.baseBackupId,
      addedNodes: Array.from(addedNodes.values()),
      removedNodeIds: Array.from(removedNodeIds),
      modifiedNodes: Array.from(modifiedNodes.values()),
      addedEdges: Array.from(addedEdges.values()),
      removedEdgeIds: Array.from(removedEdgeIds),
      modifiedEdges: Array.from(modifiedEdges.values()),
      addedUsers: Array.from(addedUsers.values()),
      removedUserIds: Array.from(removedUserIds),
      modifiedUsers: Array.from(modifiedUsers.values()),
    };
  }

  private diffNodes(base: BackupNode[], current: BackupNode[]): NodeDiff[] {
    const baseMap = new Map(base.map((n) => [n.id, n]));
    const currentMap = new Map(current.map((n) => [n.id, n]));
    const diffs: NodeDiff[] = [];

    for (const [id, currentNode] of currentMap) {
      const baseNode = baseMap.get(id);
      if (!baseNode) {
        diffs.push({ type: "added", id, after: currentNode });
      } else {
        const changed = this.changedFields(baseNode.properties, currentNode.properties);
        if (
          changed.length > 0 ||
          baseNode.type !== currentNode.type ||
          baseNode.updatedAt !== currentNode.updatedAt
        ) {
          diffs.push({ type: "modified", id, before: baseNode, after: currentNode, changedFields: changed });
        }
      }
    }

    for (const [id, baseNode] of baseMap) {
      if (!currentMap.has(id)) {
        diffs.push({ type: "removed", id, before: baseNode });
      }
    }

    return diffs;
  }

  private diffEdges(base: BackupEdge[], current: BackupEdge[]): EdgeDiff[] {
    const baseMap = new Map(base.map((e) => [e.id, e]));
    const currentMap = new Map(current.map((e) => [e.id, e]));
    const diffs: EdgeDiff[] = [];

    for (const [id, currentEdge] of currentMap) {
      const baseEdge = baseMap.get(id);
      if (!baseEdge) {
        diffs.push({ type: "added", id, after: currentEdge });
      } else {
        const changed = this.changedFields(baseEdge.properties, currentEdge.properties);
        if (changed.length > 0 || baseEdge.sourceId !== currentEdge.sourceId || baseEdge.targetId !== currentEdge.targetId) {
          diffs.push({ type: "modified", id, before: baseEdge, after: currentEdge, changedFields: changed });
        }
      }
    }

    for (const [id, baseEdge] of baseMap) {
      if (!currentMap.has(id)) {
        diffs.push({ type: "removed", id, before: baseEdge });
      }
    }

    return diffs;
  }

  private diffUsers(base: BackupUser[], current: BackupUser[]): UserDiff[] {
    const baseMap = new Map(base.map((u) => [u.id, u]));
    const currentMap = new Map(current.map((u) => [u.id, u]));
    const diffs: UserDiff[] = [];

    for (const [id, currentUser] of currentMap) {
      const baseUser = baseMap.get(id);
      if (!baseUser) {
        diffs.push({ type: "added", id, after: currentUser });
      } else if (JSON.stringify(baseUser) !== JSON.stringify(currentUser)) {
        diffs.push({ type: "modified", id, before: baseUser, after: currentUser });
      }
    }

    for (const [id, baseUser] of baseMap) {
      if (!currentMap.has(id)) {
        diffs.push({ type: "removed", id, before: baseUser });
      }
    }

    return diffs;
  }

  private changedFields(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): string[] {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return Array.from(allKeys).filter(
      (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])
    );
  }
}
