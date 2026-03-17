/**
 * Backup package types
 */

export enum BackupStatus {
  Pending = "pending",
  InProgress = "in_progress",
  Completed = "completed",
  Failed = "failed",
  Restoring = "restoring",
  Verified = "verified",
}

export enum BackupFormat {
  Json = "json",
  JsonGzip = "json.gz",
}

/** Metadata recorded for each backup */
export interface BackupMetadata {
  id: string;
  timestamp: Date;
  schemaVersion: number;
  format: BackupFormat;
  /** Uncompressed size in bytes */
  size: number;
  /** Compressed size in bytes (if compressed) */
  compressedSize?: number;
  nodeCount: number;
  edgeCount: number;
  userCount: number;
  status: BackupStatus;
  /** SHA-256 checksum of the backup content */
  checksum: string;
  /** Optional label */
  label?: string;
  tags: string[];
  /** Backup that this is incremental from */
  baseBackupId?: string;
}

/** Options when creating a backup */
export interface BackupOptions {
  compression: boolean;
  /** Encrypt with this key (placeholder - actual encryption not implemented) */
  encryptionKey?: string;
  /** Glob patterns to exclude from backup */
  excludePatterns?: string[];
  /** Max bytes per chunk file (0 = no chunking) */
  chunkSizeBytes?: number;
  label?: string;
  tags?: string[];
  /** Report progress via callback */
  onProgress?: (progress: BackupProgress) => void;
}

/** Options when restoring a backup */
export interface RestoreOptions {
  /** How to handle ID conflicts */
  conflictResolution: "skip" | "overwrite" | "merge";
  /** If true, validate without making changes */
  dryRun?: boolean;
  /** Remap IDs to avoid conflicts with existing data */
  remapIds?: boolean;
  onProgress?: (progress: BackupProgress) => void;
}

/** Progress event emitted during backup/restore operations */
export interface BackupProgress {
  phase: "nodes" | "edges" | "users" | "metadata" | "compression" | "checksum";
  processed: number;
  total: number;
  percentComplete: number;
}

/** Schedule for automatic backups */
export interface BackupSchedule {
  id: string;
  /** Cron expression (simplified: "hourly" | "daily" | "weekly" | "monthly") */
  cronExpression: "hourly" | "daily" | "weekly" | "monthly";
  options: BackupOptions;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  retentionPolicy: RetentionPolicy;
}

/** How long to keep backups */
export interface RetentionPolicy {
  /** Keep the last N backups */
  keepLast?: number;
  /** Keep all dailies for N days */
  keepDailyDays?: number;
  /** Keep all weeklies for N weeks */
  keepWeeklyWeeks?: number;
  /** Keep all monthlies for N months */
  keepMonthlyMonths?: number;
}

/** A node in the backup payload */
export interface BackupNode {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** An edge in the backup payload */
export interface BackupEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** A user in the backup payload */
export interface BackupUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

/** Full backup payload */
export interface BackupPayload {
  metadata: BackupMetadata;
  nodes: BackupNode[];
  edges: BackupEdge[];
  users: BackupUser[];
}

/** Backup strategy interface */
export interface BackupStrategy {
  name: string;
  createBackup(data: Omit<BackupPayload, "metadata">, options: BackupOptions): Promise<BackupMetadata>;
  restoreBackup(backupId: string, options: RestoreOptions): Promise<void>;
  listBackups(): Promise<BackupMetadata[]>;
  deleteBackup(backupId: string): Promise<void>;
}
