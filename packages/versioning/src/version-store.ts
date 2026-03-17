// In-memory version store for entity snapshots

import type {
  Version,
  VersionQuery,
  PaginatedVersions,
  StorageStats,
} from './types.js';

function generateId(): string {
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class VersionStore {
  // entityId -> branchName -> versions (sorted by version number)
  private store: Map<string, Map<string, Version[]>> = new Map();
  // quick lookup by version id
  private byId: Map<string, Version> = new Map();

  // Create a new version snapshot for an entity
  createVersion(params: {
    entityId: string;
    data: Record<string, unknown>;
    author: string;
    message: string;
    parentId?: string;
    branchName?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Version {
    const branchName = params.branchName ?? 'main';
    const entityBranches = this.getOrCreateEntityMap(params.entityId);
    const branchVersions = this.getOrCreateBranch(entityBranches, branchName);

    const previousVersion = branchVersions[branchVersions.length - 1];
    const versionNumber = previousVersion ? previousVersion.version + 1 : 1;

    const version: Version = {
      id: generateId(),
      entityId: params.entityId,
      version: versionNumber,
      data: structuredClone(params.data),
      author: params.author,
      message: params.message,
      timestamp: new Date(),
      parentId: params.parentId ?? previousVersion?.id ?? null,
      branchName,
      tags: params.tags ?? [],
      metadata: params.metadata ?? {},
    };

    branchVersions.push(version);
    this.byId.set(version.id, version);

    return version;
  }

  // Get a version by its unique ID
  getVersionById(id: string): Version | undefined {
    return this.byId.get(id);
  }

  // Get the latest version for an entity on a branch
  getLatestVersion(entityId: string, branchName = 'main'): Version | undefined {
    const branches = this.store.get(entityId);
    if (!branches) return undefined;
    const versions = branches.get(branchName);
    if (!versions || versions.length === 0) return undefined;
    return versions[versions.length - 1];
  }

  // Get all versions for an entity on a branch (full history)
  getHistory(
    entityId: string,
    branchName = 'main',
    options: { sortOrder?: 'asc' | 'desc' } = {},
  ): Version[] {
    const branches = this.store.get(entityId);
    if (!branches) return [];
    const versions = branches.get(branchName) ?? [];
    const sorted = [...versions];
    if (options.sortOrder === 'desc') {
      sorted.reverse();
    }
    return sorted;
  }

  // Get the version that was active at a specific point in time
  getVersionAtTime(
    entityId: string,
    timestamp: Date,
    branchName = 'main',
  ): Version | undefined {
    const branches = this.store.get(entityId);
    if (!branches) return undefined;
    const versions = branches.get(branchName) ?? [];

    // Find the latest version whose timestamp <= the requested time
    let result: Version | undefined;
    for (const v of versions) {
      if (v.timestamp <= timestamp) {
        result = v;
      } else {
        break;
      }
    }
    return result;
  }

  // Query versions with filtering, pagination, sorting
  queryVersions(query: VersionQuery): PaginatedVersions {
    const branches = this.store.get(query.entityId);
    if (!branches) {
      return { versions: [], total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0, hasMore: false };
    }

    let all: Version[] = [];

    if (query.branchName) {
      all = [...(branches.get(query.branchName) ?? [])];
    } else {
      for (const versionList of branches.values()) {
        all.push(...versionList);
      }
    }

    // Filter
    if (query.author) {
      all = all.filter(v => v.author === query.author);
    }
    if (query.fromDate) {
      const from = query.fromDate;
      all = all.filter(v => v.timestamp >= from);
    }
    if (query.toDate) {
      const to = query.toDate;
      all = all.filter(v => v.timestamp <= to);
    }
    if (query.tags && query.tags.length > 0) {
      const tags = query.tags;
      all = all.filter(v => tags.some(t => v.tags.includes(t)));
    }
    if (query.message) {
      const msg = query.message.toLowerCase();
      all = all.filter(v => v.message.toLowerCase().includes(msg));
    }

    // Sort
    const sortBy = query.sortBy ?? 'version';
    const sortOrder = query.sortOrder ?? 'desc';
    all.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'timestamp') {
        cmp = a.timestamp.getTime() - b.timestamp.getTime();
      } else {
        cmp = a.version - b.version;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    const total = all.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const versions = all.slice(offset, offset + limit);

    return {
      versions,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  // Prune old versions, keeping every Nth version plus the latest
  pruneVersions(
    entityId: string,
    branchName = 'main',
    keepEveryNth = 5,
  ): { removed: number; kept: number } {
    const branches = this.store.get(entityId);
    if (!branches) return { removed: 0, kept: 0 };
    const versions = branches.get(branchName);
    if (!versions || versions.length === 0) return { removed: 0, kept: 0 };

    const kept: Version[] = [];
    for (let i = 0; i < versions.length; i++) {
      const isLast = i === versions.length - 1;
      const isNth = i % keepEveryNth === 0;
      if (isNth || isLast) {
        kept.push(versions[i]!);
      } else {
        this.byId.delete(versions[i]!.id);
      }
    }

    branches.set(branchName, kept);
    return { removed: versions.length - kept.length, kept: kept.length };
  }

  // Delete a specific version by ID
  deleteVersion(id: string): boolean {
    const version = this.byId.get(id);
    if (!version) return false;

    const branches = this.store.get(version.entityId);
    if (!branches) return false;

    const versionList = branches.get(version.branchName);
    if (!versionList) return false;

    const idx = versionList.findIndex(v => v.id === id);
    if (idx === -1) return false;

    versionList.splice(idx, 1);
    this.byId.delete(id);
    return true;
  }

  // Delete all versions for an entity
  deleteEntity(entityId: string): number {
    const branches = this.store.get(entityId);
    if (!branches) return 0;

    let count = 0;
    for (const versionList of branches.values()) {
      for (const v of versionList) {
        this.byId.delete(v.id);
        count++;
      }
    }
    this.store.delete(entityId);
    return count;
  }

  // Get storage statistics
  getStats(): StorageStats {
    let totalVersions = 0;
    let totalBranches = 0;
    let oldest: Date | null = null;
    let newest: Date | null = null;

    for (const branches of this.store.values()) {
      totalBranches += branches.size;
      for (const versions of branches.values()) {
        totalVersions += versions.length;
        for (const v of versions) {
          if (oldest === null || v.timestamp < oldest) oldest = v.timestamp;
          if (newest === null || v.timestamp > newest) newest = v.timestamp;
        }
      }
    }

    const entityCount = this.store.size;

    return {
      entityCount,
      totalVersions,
      totalBranches,
      oldestVersion: oldest,
      newestVersion: newest,
      averageVersionsPerEntity: entityCount > 0 ? totalVersions / entityCount : 0,
    };
  }

  // List all entity IDs
  listEntityIds(): string[] {
    return [...this.store.keys()];
  }

  // List branch names for an entity
  listBranches(entityId: string): string[] {
    const branches = this.store.get(entityId);
    if (!branches) return [];
    return [...branches.keys()];
  }

  // Count versions for entity on branch
  countVersions(entityId: string, branchName?: string): number {
    const branches = this.store.get(entityId);
    if (!branches) return 0;
    if (branchName) {
      return branches.get(branchName)?.length ?? 0;
    }
    let total = 0;
    for (const versions of branches.values()) {
      total += versions.length;
    }
    return total;
  }

  // Clear all data (useful for testing)
  clear(): void {
    this.store.clear();
    this.byId.clear();
  }

  private getOrCreateEntityMap(entityId: string): Map<string, Version[]> {
    let branches = this.store.get(entityId);
    if (!branches) {
      branches = new Map();
      this.store.set(entityId, branches);
    }
    return branches;
  }

  private getOrCreateBranch(
    entityBranches: Map<string, Version[]>,
    branchName: string,
  ): Version[] {
    let versions = entityBranches.get(branchName);
    if (!versions) {
      versions = [];
      entityBranches.set(branchName, versions);
    }
    return versions;
  }
}
