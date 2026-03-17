// BranchManager: create, list, switch, merge, and delete branches for entities

import type { Version, VersionTree, BranchNode } from './types.js';
import { MergeStrategy } from './types.js';
import { VersionStore } from './version-store.js';
import { MergeEngine } from './merge-engine.js';

export interface BranchMetadata {
  name: string;
  description: string;
  author: string;
  entityId: string;
  parentBranch: string | null;
  parentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchLog {
  branchName: string;
  entityId: string;
  versions: Version[];
  totalCommits: number;
}

export interface MergeBranchResult {
  success: boolean;
  mergedVersionId: string | null;
  conflicts: string[];
  message: string;
}

export class BranchManager {
  private metadata: Map<string, Map<string, BranchMetadata>> = new Map();
  private mergeEngine = new MergeEngine();

  constructor(private store: VersionStore) {}

  // Create a new branch starting from a given version
  createBranch(params: {
    entityId: string;
    branchName: string;
    fromVersionId: string;
    author: string;
    description?: string;
  }): BranchMetadata {
    const fromVersion = this.store.getVersionById(params.fromVersionId);
    if (!fromVersion) {
      throw new Error(`Version '${params.fromVersionId}' not found`);
    }
    if (fromVersion.entityId !== params.entityId) {
      throw new Error(`Version does not belong to entity '${params.entityId}'`);
    }

    const entityMeta = this.getOrCreateEntityMeta(params.entityId);
    if (entityMeta.has(params.branchName)) {
      throw new Error(`Branch '${params.branchName}' already exists for entity '${params.entityId}'`);
    }

    // Create the first version on the new branch (clone of fromVersion)
    this.store.createVersion({
      entityId: params.entityId,
      data: fromVersion.data,
      author: params.author,
      message: `Branch '${params.branchName}' created from ${params.fromVersionId}`,
      parentId: params.fromVersionId,
      branchName: params.branchName,
    });

    const meta: BranchMetadata = {
      name: params.branchName,
      description: params.description ?? '',
      author: params.author,
      entityId: params.entityId,
      parentBranch: fromVersion.branchName,
      parentVersionId: params.fromVersionId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    entityMeta.set(params.branchName, meta);
    return meta;
  }

  // Ensure main branch metadata exists
  ensureMainBranch(entityId: string, author: string): void {
    const entityMeta = this.getOrCreateEntityMeta(entityId);
    if (!entityMeta.has('main')) {
      entityMeta.set('main', {
        name: 'main',
        description: 'Default branch',
        author,
        entityId,
        parentBranch: null,
        parentVersionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // List all branch metadata for an entity
  listBranches(entityId: string): BranchMetadata[] {
    const entityMeta = this.metadata.get(entityId);
    if (!entityMeta) return [];
    return [...entityMeta.values()];
  }

  // Get metadata for a specific branch
  getBranch(entityId: string, branchName: string): BranchMetadata | undefined {
    return this.metadata.get(entityId)?.get(branchName);
  }

  // Update branch metadata
  updateBranch(
    entityId: string,
    branchName: string,
    updates: Partial<Pick<BranchMetadata, 'description'>>,
  ): BranchMetadata {
    const entityMeta = this.getOrCreateEntityMeta(entityId);
    const meta = entityMeta.get(branchName);
    if (!meta) {
      throw new Error(`Branch '${branchName}' not found for entity '${entityId}'`);
    }
    const updated: BranchMetadata = {
      ...meta,
      ...updates,
      updatedAt: new Date(),
    };
    entityMeta.set(branchName, updated);
    return updated;
  }

  // Get the branch log (version history for a branch)
  getBranchLog(entityId: string, branchName: string): BranchLog {
    const versions = this.store.getHistory(entityId, branchName, { sortOrder: 'desc' });
    return {
      branchName,
      entityId,
      versions,
      totalCommits: versions.length,
    };
  }

  // Switch active branch context (returns latest version on target branch)
  switchBranch(entityId: string, targetBranch: string): Version {
    const latest = this.store.getLatestVersion(entityId, targetBranch);
    if (!latest) {
      throw new Error(`Branch '${targetBranch}' has no versions for entity '${entityId}'`);
    }
    return latest;
  }

  // Merge sourceBranch into targetBranch
  mergeBranch(params: {
    entityId: string;
    sourceBranch: string;
    targetBranch: string;
    author: string;
    message?: string;
    strategy?: MergeStrategy;
  }): MergeBranchResult {
    const sourceLatest = this.store.getLatestVersion(params.entityId, params.sourceBranch);
    const targetLatest = this.store.getLatestVersion(params.entityId, params.targetBranch);

    if (!sourceLatest) {
      return {
        success: false,
        mergedVersionId: null,
        conflicts: [],
        message: `Source branch '${params.sourceBranch}' has no versions`,
      };
    }
    if (!targetLatest) {
      return {
        success: false,
        mergedVersionId: null,
        conflicts: [],
        message: `Target branch '${params.targetBranch}' has no versions`,
      };
    }

    // Find common ancestor: walk source parents to find one on target branch
    const baseVersion = this.findCommonAncestor(
      params.entityId,
      sourceLatest,
      targetLatest,
    );

    const strategy = params.strategy ?? MergeStrategy.FieldLevel;
    const mergeResult = this.mergeEngine.merge(
      baseVersion ?? targetLatest,
      targetLatest,
      sourceLatest,
      strategy,
    );

    if (!mergeResult.success) {
      return {
        success: false,
        mergedVersionId: null,
        conflicts: mergeResult.conflictingFields,
        message: `Merge has ${mergeResult.conflicts.length} conflict(s): ${mergeResult.conflictingFields.join(', ')}`,
      };
    }

    const mergedVersion = this.store.createVersion({
      entityId: params.entityId,
      data: mergeResult.mergedData,
      author: params.author,
      message:
        params.message ??
        `Merge '${params.sourceBranch}' into '${params.targetBranch}'`,
      parentId: targetLatest.id,
      branchName: params.targetBranch,
      metadata: {
        mergedFrom: params.sourceBranch,
        mergeStrategy: strategy,
      },
    });

    // Update metadata timestamps
    const entityMeta = this.metadata.get(params.entityId);
    if (entityMeta) {
      const targetMeta = entityMeta.get(params.targetBranch);
      if (targetMeta) {
        entityMeta.set(params.targetBranch, { ...targetMeta, updatedAt: new Date() });
      }
    }

    return {
      success: true,
      mergedVersionId: mergedVersion.id,
      conflicts: [],
      message: `Successfully merged '${params.sourceBranch}' into '${params.targetBranch}'`,
    };
  }

  // Delete a branch (does not delete versions, just metadata)
  deleteBranch(entityId: string, branchName: string): boolean {
    if (branchName === 'main') {
      throw new Error("Cannot delete the 'main' branch");
    }
    const entityMeta = this.metadata.get(entityId);
    if (!entityMeta) return false;
    return entityMeta.delete(branchName);
  }

  // Build version tree for an entity (all branches and their versions)
  getVersionTree(entityId: string): VersionTree {
    const branchNames = this.store.listBranches(entityId);
    const branches: BranchNode[] = [];

    for (const branchName of branchNames) {
      const versions = this.store.getHistory(entityId, branchName);
      const meta = this.metadata.get(entityId)?.get(branchName);
      const head = versions[versions.length - 1];

      branches.push({
        name: branchName,
        headVersionId: head?.id ?? null,
        parentBranch: meta?.parentBranch ?? null,
        parentVersionId: meta?.parentVersionId ?? null,
        versions: versions.map(v => v.id),
      });
    }

    // Find root: the oldest version across all branches
    let rootVersionId: string | null = null;
    let earliestTime = Infinity;
    for (const branchName of branchNames) {
      const versions = this.store.getHistory(entityId, branchName);
      if (versions.length > 0 && versions[0]!.timestamp.getTime() < earliestTime) {
        earliestTime = versions[0]!.timestamp.getTime();
        rootVersionId = versions[0]!.id;
      }
    }

    return { entityId, branches, rootVersionId };
  }

  // Find common ancestor between two versions by walking parent chain
  private findCommonAncestor(
    _entityId: string,
    v1: Version,
    v2: Version,
  ): Version | null {
    const v1Ancestors = new Set<string>();
    let cur: Version | undefined = v1;
    while (cur) {
      v1Ancestors.add(cur.id);
      if (cur.parentId) {
        cur = this.store.getVersionById(cur.parentId);
      } else {
        break;
      }
    }

    let candidate: Version | undefined = v2;
    while (candidate) {
      if (v1Ancestors.has(candidate.id)) return candidate;
      if (candidate.parentId) {
        candidate = this.store.getVersionById(candidate.parentId);
      } else {
        break;
      }
    }

    return null;
  }

  private getOrCreateEntityMeta(entityId: string): Map<string, BranchMetadata> {
    let entityMeta = this.metadata.get(entityId);
    if (!entityMeta) {
      entityMeta = new Map();
      this.metadata.set(entityId, entityMeta);
    }
    return entityMeta;
  }
}
