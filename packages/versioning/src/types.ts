// Core types for the versioning system

export enum ChangeType {
  Add = 'add',
  Modify = 'modify',
  Delete = 'delete',
}

export enum MergeStrategy {
  Theirs = 'theirs',
  Ours = 'ours',
  Manual = 'manual',
  FieldLevel = 'field-level',
  LastWriterWins = 'last-writer-wins',
}

export interface FieldChange {
  field: string;
  type: ChangeType;
  oldValue: unknown;
  newValue: unknown;
  description: string;
}

export interface VersionDiff {
  fromVersionId: string | null;
  toVersionId: string;
  entityId: string;
  changes: FieldChange[];
  timestamp: Date;
  summary: string;
}

export interface Version {
  id: string;
  entityId: string;
  version: number;
  data: Record<string, unknown>;
  author: string;
  message: string;
  timestamp: Date;
  parentId: string | null;
  branchName: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface VersionTree {
  entityId: string;
  branches: BranchNode[];
  rootVersionId: string | null;
}

export interface BranchNode {
  name: string;
  headVersionId: string | null;
  parentBranch: string | null;
  parentVersionId: string | null;
  versions: string[];
}

export interface MergeConflict {
  field: string;
  ourValue: unknown;
  theirValue: unknown;
  baseValue: unknown;
  description: string;
}

export interface MergeResult {
  success: boolean;
  mergedData: Record<string, unknown>;
  conflicts: MergeConflict[];
  resolvedFields: string[];
  conflictingFields: string[];
  strategy: MergeStrategy;
}

export interface VersionQuery {
  entityId: string;
  author?: string;
  branchName?: string;
  fromDate?: Date;
  toDate?: Date;
  tags?: string[];
  message?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'version' | 'timestamp';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedVersions {
  versions: Version[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface StorageStats {
  entityCount: number;
  totalVersions: number;
  totalBranches: number;
  oldestVersion: Date | null;
  newestVersion: Date | null;
  averageVersionsPerEntity: number;
}

export interface TextDiffLine {
  type: 'equal' | 'insert' | 'delete';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface TextPatch {
  hunks: PatchHunk[];
  fromFile: string;
  toFile: string;
}

export interface PatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: TextDiffLine[];
}

export interface ArrayDiff<T> {
  type: 'equal' | 'insert' | 'delete';
  value: T;
  oldIndex: number | null;
  newIndex: number | null;
}

export interface SnapshotRecord {
  id: string;
  entityId: string;
  versionId: string;
  data: Record<string, unknown>;
  compressed: boolean;
  deltaFromSnapshotId: string | null;
  createdAt: Date;
  size: number;
}

export interface SnapshotStats {
  snapshotCount: number;
  totalSize: number;
  compressedCount: number;
  averageSize: number;
}
