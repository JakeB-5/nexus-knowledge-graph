/**
 * BackupExporter - exports data to structured backup format with optional compression
 */

import { createHash } from "crypto";
import { gzipSync } from "zlib";
import { randomUUID } from "crypto";
import type {
  BackupEdge,
  BackupMetadata,
  BackupNode,
  BackupOptions,
  BackupPayload,
  BackupProgress,
  BackupUser,
} from "./types.js";
import { BackupFormat, BackupStatus } from "./types.js";

export interface ExportData {
  nodes: BackupNode[];
  edges: BackupEdge[];
  users: BackupUser[];
}

export interface ExportResult {
  metadata: BackupMetadata;
  /** Serialized backup content (JSON or gzipped JSON) */
  content: Buffer;
  /** Split chunks if chunkSizeBytes was set */
  chunks?: Buffer[];
}

const SCHEMA_VERSION = 1;

export class BackupExporter {
  private readonly excludePatterns: RegExp[];

  constructor(excludePatterns: string[] = []) {
    this.excludePatterns = excludePatterns.map((p) => new RegExp(p));
  }

  /** Export data to a backup */
  async export(data: ExportData, options: BackupOptions): Promise<ExportResult> {
    const id = randomUUID();
    const timestamp = new Date();

    const onProgress = options.onProgress ?? (() => undefined);

    // Filter excluded data
    const filteredNodes = this.filterExcluded(data.nodes, options.excludePatterns);
    const filteredEdges = this.filterExcludedEdges(data.edges, filteredNodes, options.excludePatterns);
    const filteredUsers = data.users;

    // Report progress phases
    this.reportProgress(onProgress, "nodes", filteredNodes.length, filteredNodes.length);
    this.reportProgress(onProgress, "edges", filteredEdges.length, filteredEdges.length);
    this.reportProgress(onProgress, "users", filteredUsers.length, filteredUsers.length);

    const format = options.compression ? BackupFormat.JsonGzip : BackupFormat.Json;

    const payload: BackupPayload = {
      metadata: {
        id,
        timestamp,
        schemaVersion: SCHEMA_VERSION,
        format,
        size: 0, // filled in below
        nodeCount: filteredNodes.length,
        edgeCount: filteredEdges.length,
        userCount: filteredUsers.length,
        status: BackupStatus.InProgress,
        checksum: "",
        label: options.label,
        tags: options.tags ?? [],
      },
      nodes: filteredNodes,
      edges: filteredEdges,
      users: filteredUsers,
    };

    // Serialize
    this.reportProgress(onProgress, "metadata", 0, 1);
    const json = JSON.stringify(payload, null, 2);
    const jsonBuffer = Buffer.from(json, "utf-8");

    let content: Buffer;

    if (options.compression) {
      this.reportProgress(onProgress, "compression", 0, 1);
      content = gzipSync(jsonBuffer);
      this.reportProgress(onProgress, "compression", 1, 1);
    } else {
      content = jsonBuffer;
    }

    // Compute checksum
    this.reportProgress(onProgress, "checksum", 0, 1);
    const checksum = this.computeChecksum(content);
    this.reportProgress(onProgress, "checksum", 1, 1);

    const metadata: BackupMetadata = {
      ...payload.metadata,
      size: jsonBuffer.length,
      compressedSize: options.compression ? content.length : undefined,
      status: BackupStatus.Completed,
      checksum,
    };

    // Handle chunking
    let chunks: Buffer[] | undefined;
    if (options.chunkSizeBytes && options.chunkSizeBytes > 0) {
      chunks = this.splitIntoChunks(content, options.chunkSizeBytes);
    }

    return { metadata, content, chunks };
  }

  /** Stream export for large datasets (yields chunks) */
  async *exportStreaming(
    data: ExportData,
    options: BackupOptions
  ): AsyncGenerator<{ type: "chunk"; data: string } | { type: "metadata"; data: BackupMetadata }> {
    const id = randomUUID();
    const timestamp = new Date();

    const filteredNodes = this.filterExcluded(data.nodes, options.excludePatterns);
    const filteredEdges = this.filterExcludedEdges(data.edges, filteredNodes, options.excludePatterns);

    yield { type: "chunk", data: `{"metadata":${JSON.stringify({ id, timestamp, schemaVersion: SCHEMA_VERSION })},"nodes":[` };

    for (let i = 0; i < filteredNodes.length; i++) {
      const comma = i < filteredNodes.length - 1 ? "," : "";
      yield { type: "chunk", data: JSON.stringify(filteredNodes[i]) + comma };
    }

    yield { type: "chunk", data: `],"edges":[` };

    for (let i = 0; i < filteredEdges.length; i++) {
      const comma = i < filteredEdges.length - 1 ? "," : "";
      yield { type: "chunk", data: JSON.stringify(filteredEdges[i]) + comma };
    }

    yield { type: "chunk", data: `],"users":${JSON.stringify(data.users)}}` };

    const metadata: BackupMetadata = {
      id,
      timestamp,
      schemaVersion: SCHEMA_VERSION,
      format: BackupFormat.Json,
      size: 0, // streaming does not compute total size inline
      nodeCount: filteredNodes.length,
      edgeCount: filteredEdges.length,
      userCount: data.users.length,
      status: BackupStatus.Completed,
      checksum: "streaming-no-checksum",
      tags: options.tags ?? [],
    };

    yield { type: "metadata", data: metadata };
  }

  /** Compute SHA-256 checksum of content */
  computeChecksum(content: Buffer): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /** Split content into fixed-size chunks */
  splitIntoChunks(content: Buffer, chunkSizeBytes: number): Buffer[] {
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset < content.length) {
      chunks.push(content.subarray(offset, offset + chunkSizeBytes));
      offset += chunkSizeBytes;
    }
    return chunks;
  }

  private filterExcluded<T extends { type: string }>(items: T[], patterns?: string[]): T[] {
    if (!patterns || patterns.length === 0) return items;
    const regexes = patterns.map((p) => new RegExp(p));
    return items.filter((item) => !regexes.some((r) => r.test(item.type)));
  }

  private filterExcludedEdges(
    edges: BackupEdge[],
    allowedNodes: BackupNode[],
    patterns?: string[]
  ): BackupEdge[] {
    const nodeIds = new Set(allowedNodes.map((n) => n.id));
    let filtered = edges.filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));
    if (patterns && patterns.length > 0) {
      const regexes = patterns.map((p) => new RegExp(p));
      filtered = filtered.filter((e) => !regexes.some((r) => r.test(e.type)));
    }
    return filtered;
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
