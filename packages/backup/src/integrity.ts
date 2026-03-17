/**
 * IntegrityChecker - verifies backup file integrity, referential consistency, and schema compatibility
 */

import { createHash } from "crypto";
import { gunzipSync } from "zlib";
import type { BackupEdge, BackupMetadata, BackupNode, BackupPayload } from "./types.js";
import { BackupFormat } from "./types.js";

export interface IntegrityReport {
  valid: boolean;
  checksumValid: boolean;
  schemaCompatible: boolean;
  referentialIntegrityValid: boolean;
  structureValid: boolean;
  issues: IntegrityIssue[];
  summary: string;
}

export interface IntegrityIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

const SUPPORTED_SCHEMA_VERSIONS = [1];

export class IntegrityChecker {
  /** Verify a raw backup buffer against expected checksum */
  verifyChecksum(content: Buffer, expectedChecksum: string): boolean {
    const actual = createHash("sha256").update(content).digest("hex");
    return actual === expectedChecksum;
  }

  /** Parse backup payload from buffer */
  parsePayload(content: Buffer, format: BackupFormat): BackupPayload {
    let json: string;

    if (format === BackupFormat.JsonGzip) {
      const decompressed = gunzipSync(content);
      json = decompressed.toString("utf-8");
    } else {
      json = content.toString("utf-8");
    }

    return JSON.parse(json) as BackupPayload;
  }

  /** Run all integrity checks and return a full report */
  check(content: Buffer, metadata: BackupMetadata): IntegrityReport {
    const issues: IntegrityIssue[] = [];

    // 1. Checksum verification
    const checksumValid = this.verifyChecksum(content, metadata.checksum);
    if (!checksumValid) {
      issues.push({
        severity: "error",
        code: "CHECKSUM_MISMATCH",
        message: `Checksum mismatch: file may be corrupted or tampered`,
        context: { expected: metadata.checksum },
      });
    }

    // 2. Schema compatibility
    const schemaCompatible = SUPPORTED_SCHEMA_VERSIONS.includes(metadata.schemaVersion);
    if (!schemaCompatible) {
      issues.push({
        severity: "error",
        code: "UNSUPPORTED_SCHEMA",
        message: `Schema version ${metadata.schemaVersion} is not supported`,
        context: { supported: SUPPORTED_SCHEMA_VERSIONS },
      });
    }

    // 3. Structure validation and referential integrity
    let structureValid = true;
    let referentialIntegrityValid = true;
    let payload: BackupPayload | null = null;

    try {
      payload = this.parsePayload(content, metadata.format);
    } catch (err) {
      structureValid = false;
      issues.push({
        severity: "error",
        code: "PARSE_ERROR",
        message: `Failed to parse backup: ${String(err)}`,
      });
    }

    if (payload) {
      // Validate structure
      const structureIssues = this.validateStructure(payload);
      issues.push(...structureIssues);
      if (structureIssues.some((i) => i.severity === "error")) {
        structureValid = false;
      }

      // Validate referential integrity
      const refIssues = this.validateReferentialIntegrity(payload);
      issues.push(...refIssues);
      if (refIssues.length > 0) {
        referentialIntegrityValid = false;
      }

      // Validate counts match metadata
      if (payload.nodes.length !== metadata.nodeCount) {
        issues.push({
          severity: "warning",
          code: "COUNT_MISMATCH_NODES",
          message: `Node count mismatch: metadata says ${metadata.nodeCount}, payload has ${payload.nodes.length}`,
        });
      }

      if (payload.edges.length !== metadata.edgeCount) {
        issues.push({
          severity: "warning",
          code: "COUNT_MISMATCH_EDGES",
          message: `Edge count mismatch: metadata says ${metadata.edgeCount}, payload has ${payload.edges.length}`,
        });
      }
    }

    const valid = checksumValid && schemaCompatible && structureValid && referentialIntegrityValid;

    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warnCount = issues.filter((i) => i.severity === "warning").length;

    return {
      valid,
      checksumValid,
      schemaCompatible,
      referentialIntegrityValid,
      structureValid,
      issues,
      summary: valid
        ? "Backup is valid"
        : `Backup has ${errorCount} error(s) and ${warnCount} warning(s)`,
    };
  }

  /** Validate that required fields are present */
  validateStructure(payload: BackupPayload): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    if (!payload.metadata) {
      issues.push({ severity: "error", code: "MISSING_METADATA", message: "Payload is missing metadata" });
    }

    if (!Array.isArray(payload.nodes)) {
      issues.push({ severity: "error", code: "INVALID_NODES", message: "Payload.nodes must be an array" });
    } else {
      for (const node of payload.nodes) {
        if (!node.id) issues.push({ severity: "error", code: "NODE_MISSING_ID", message: `Node is missing id`, context: { node } });
        if (!node.type) issues.push({ severity: "warning", code: "NODE_MISSING_TYPE", message: `Node ${node.id} is missing type` });
      }
    }

    if (!Array.isArray(payload.edges)) {
      issues.push({ severity: "error", code: "INVALID_EDGES", message: "Payload.edges must be an array" });
    } else {
      for (const edge of payload.edges) {
        if (!edge.id) issues.push({ severity: "error", code: "EDGE_MISSING_ID", message: `Edge is missing id` });
        if (!edge.sourceId) issues.push({ severity: "error", code: "EDGE_MISSING_SOURCE", message: `Edge ${edge.id} is missing sourceId` });
        if (!edge.targetId) issues.push({ severity: "error", code: "EDGE_MISSING_TARGET", message: `Edge ${edge.id} is missing targetId` });
      }
    }

    if (!Array.isArray(payload.users)) {
      issues.push({ severity: "warning", code: "INVALID_USERS", message: "Payload.users must be an array" });
    }

    return issues;
  }

  /** Validate referential integrity (edges reference existing nodes) */
  validateReferentialIntegrity(payload: BackupPayload): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];
    const nodeIds = new Set((payload.nodes as BackupNode[]).map((n) => n.id));

    for (const edge of payload.edges as BackupEdge[]) {
      if (!nodeIds.has(edge.sourceId)) {
        issues.push({
          severity: "error",
          code: "DANGLING_SOURCE_REF",
          message: `Edge ${edge.id} references non-existent source node ${edge.sourceId}`,
        });
      }
      if (!nodeIds.has(edge.targetId)) {
        issues.push({
          severity: "error",
          code: "DANGLING_TARGET_REF",
          message: `Edge ${edge.id} references non-existent target node ${edge.targetId}`,
        });
      }
    }

    // Check for duplicate IDs
    const nodeIdArray = (payload.nodes as BackupNode[]).map((n) => n.id);
    const duplicateNodes = nodeIdArray.filter((id, idx) => nodeIdArray.indexOf(id) !== idx);
    for (const dup of duplicateNodes) {
      issues.push({ severity: "error", code: "DUPLICATE_NODE_ID", message: `Duplicate node id: ${dup}` });
    }

    const edgeIdArray = (payload.edges as BackupEdge[]).map((e) => e.id);
    const duplicateEdges = edgeIdArray.filter((id, idx) => edgeIdArray.indexOf(id) !== idx);
    for (const dup of duplicateEdges) {
      issues.push({ severity: "error", code: "DUPLICATE_EDGE_ID", message: `Duplicate edge id: ${dup}` });
    }

    return issues;
  }
}
