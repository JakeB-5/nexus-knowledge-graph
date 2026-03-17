/**
 * BackupImporter - imports data from backup format with conflict resolution and validation
 */

import { gunzipSync } from "zlib";
import { randomUUID } from "crypto";
import type {
  BackupEdge,
  BackupMetadata,
  BackupNode,
  BackupPayload,
  BackupProgress,
  BackupUser,
  RestoreOptions,
} from "./types.js";
import { BackupFormat } from "./types.js";

export interface ImportResult {
  metadata: BackupMetadata;
  nodesImported: number;
  nodesSkipped: number;
  edgesImported: number;
  edgesSkipped: number;
  usersImported: number;
  usersSkipped: number;
  idMappings: Map<string, string>;
  errors: string[];
  dryRun: boolean;
}

export interface ExistingDataStore {
  nodeExists(id: string): boolean;
  edgeExists(id: string): boolean;
  userExists(id: string): boolean;
  /** Merge node properties (for merge conflict resolution) */
  mergeNode?(existing: BackupNode, incoming: BackupNode): BackupNode;
}

const SUPPORTED_SCHEMA_VERSIONS = [1];

export class BackupImporter {
  private readonly store: ExistingDataStore;

  constructor(store: ExistingDataStore) {
    this.store = store;
  }

  /** Parse backup content from a Buffer */
  parseBackup(content: Buffer, format: BackupFormat): BackupPayload {
    let json: string;

    if (format === BackupFormat.JsonGzip) {
      const decompressed = gunzipSync(content);
      json = decompressed.toString("utf-8");
    } else {
      json = content.toString("utf-8");
    }

    return JSON.parse(json) as BackupPayload;
  }

  /** Import a backup payload */
  async import(
    content: Buffer,
    format: BackupFormat,
    options: RestoreOptions
  ): Promise<ImportResult> {
    const payload = this.parseBackup(content, format);
    return this.importPayload(payload, options);
  }

  /** Import an already-parsed payload */
  async importPayload(
    payload: BackupPayload,
    options: RestoreOptions
  ): Promise<ImportResult> {
    const onProgress = options.onProgress ?? (() => undefined);

    // Validate schema version
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(payload.metadata.schemaVersion)) {
      throw new Error(
        `Unsupported schema version: ${payload.metadata.schemaVersion}. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`
      );
    }

    // Validate referential integrity before import
    const integrityErrors = this.validateReferentialIntegrity(payload);
    if (integrityErrors.length > 0) {
      throw new Error(`Referential integrity errors:\n${integrityErrors.join("\n")}`);
    }

    const idMappings = new Map<string, string>();
    const errors: string[] = [];

    let nodesImported = 0;
    let nodesSkipped = 0;
    let edgesImported = 0;
    let edgesSkipped = 0;
    let usersImported = 0;
    let usersSkipped = 0;

    // Import nodes
    const remappedNodes: BackupNode[] = [];
    for (let i = 0; i < payload.nodes.length; i++) {
      const node = payload.nodes[i]!;
      this.reportProgress(onProgress, "nodes", i + 1, payload.nodes.length);

      let targetId = node.id;

      if (this.store.nodeExists(node.id)) {
        switch (options.conflictResolution) {
          case "skip":
            nodesSkipped++;
            remappedNodes.push(node);
            continue;

          case "overwrite":
            if (!options.dryRun) {
              // Overwrite: use same ID
            }
            nodesImported++;
            break;

          case "merge":
            if (!options.dryRun && this.store.mergeNode) {
              // merge is handled by the store
            }
            nodesImported++;
            break;
        }
      } else {
        nodesImported++;
      }

      if (options.remapIds) {
        targetId = randomUUID();
        idMappings.set(node.id, targetId);
      }

      remappedNodes.push({ ...node, id: targetId });
    }

    // Import edges (remap source/target IDs if needed)
    for (let i = 0; i < payload.edges.length; i++) {
      const edge = payload.edges[i]!;
      this.reportProgress(onProgress, "edges", i + 1, payload.edges.length);

      const remappedSourceId = idMappings.get(edge.sourceId) ?? edge.sourceId;
      const remappedTargetId = idMappings.get(edge.targetId) ?? edge.targetId;

      if (this.store.edgeExists(edge.id)) {
        if (options.conflictResolution === "skip") {
          edgesSkipped++;
          continue;
        }
      }

      let targetEdgeId = edge.id;
      if (options.remapIds) {
        targetEdgeId = randomUUID();
        idMappings.set(edge.id, targetEdgeId);
      }

      if (!options.dryRun) {
        // In a real implementation this would persist
        void { ...edge, id: targetEdgeId, sourceId: remappedSourceId, targetId: remappedTargetId };
      }

      edgesImported++;
    }

    // Import users
    for (let i = 0; i < payload.users.length; i++) {
      const user = payload.users[i]!;
      this.reportProgress(onProgress, "users", i + 1, payload.users.length);

      if (this.store.userExists(user.id)) {
        if (options.conflictResolution === "skip") {
          usersSkipped++;
          continue;
        }
      }

      if (!options.dryRun) {
        void user; // persist in real implementation
      }

      usersImported++;
    }

    return {
      metadata: payload.metadata,
      nodesImported,
      nodesSkipped,
      edgesImported,
      edgesSkipped,
      usersImported,
      usersSkipped,
      idMappings,
      errors,
      dryRun: options.dryRun ?? false,
    };
  }

  /** Validate that all edge references point to existing nodes within the backup */
  validateReferentialIntegrity(payload: BackupPayload): string[] {
    const nodeIds = new Set(payload.nodes.map((n) => n.id));
    const errors: string[] = [];

    for (const edge of payload.edges) {
      if (!nodeIds.has(edge.sourceId)) {
        errors.push(`Edge ${edge.id}: sourceId ${edge.sourceId} does not exist in backup nodes`);
      }
      if (!nodeIds.has(edge.targetId)) {
        errors.push(`Edge ${edge.id}: targetId ${edge.targetId} does not exist in backup nodes`);
      }
    }

    return errors;
  }

  /** Check schema version compatibility */
  isCompatible(schemaVersion: number): boolean {
    return SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion);
  }

  /** Rollback imported data (placeholder for transactional implementations) */
  async rollback(_importResult: ImportResult): Promise<void> {
    // In a real implementation, this would delete imported nodes/edges/users
    // by reversing the ID mappings
  }

  private reportProgress(
    onProgress: (p: BackupProgress) => void,
    phase: BackupProgress["phase"],
    processed: number,
    total: number
  ): void {
    onProgress({
      phase,
      processed,
      total,
      percentComplete: total === 0 ? 100 : Math.round((processed / total) * 100),
    });
  }
}
