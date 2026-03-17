import { describe, it, expect, beforeEach } from 'vitest';
import { BranchManager } from '../branch-manager.js';
import { VersionStore } from '../version-store.js';
import { MergeStrategy } from '../types.js';

describe('BranchManager', () => {
  let store: VersionStore;
  let manager: BranchManager;

  beforeEach(() => {
    store = new VersionStore();
    manager = new BranchManager(store);
  });

  function seedMainVersion(entityId = 'e1', data: Record<string, unknown> = { title: 'Init' }) {
    const v = store.createVersion({
      entityId,
      data,
      author: 'alice',
      message: 'initial commit',
      branchName: 'main',
    });
    manager.ensureMainBranch(entityId, 'alice');
    return v;
  }

  describe('createBranch', () => {
    it('creates a branch from an existing version', () => {
      const v = seedMainVersion();
      const meta = manager.createBranch({
        entityId: 'e1',
        branchName: 'feature',
        fromVersionId: v.id,
        author: 'alice',
        description: 'A new feature',
      });
      expect(meta.name).toBe('feature');
      expect(meta.parentBranch).toBe('main');
      expect(meta.parentVersionId).toBe(v.id);
      expect(meta.description).toBe('A new feature');
    });

    it('creates the initial commit on the new branch', () => {
      const v = seedMainVersion();
      manager.createBranch({
        entityId: 'e1',
        branchName: 'feature',
        fromVersionId: v.id,
        author: 'alice',
      });
      const latest = store.getLatestVersion('e1', 'feature');
      expect(latest).toBeDefined();
      expect(latest!.branchName).toBe('feature');
    });

    it('throws if branch already exists', () => {
      const v = seedMainVersion();
      manager.createBranch({ entityId: 'e1', branchName: 'dup', fromVersionId: v.id, author: 'a' });
      expect(() =>
        manager.createBranch({ entityId: 'e1', branchName: 'dup', fromVersionId: v.id, author: 'a' }),
      ).toThrow();
    });

    it('throws if fromVersionId does not exist', () => {
      expect(() =>
        manager.createBranch({ entityId: 'e1', branchName: 'x', fromVersionId: 'nope', author: 'a' }),
      ).toThrow();
    });

    it('throws if version does not belong to entity', () => {
      const v = store.createVersion({ entityId: 'other', data: {}, author: 'a', message: 'm' });
      expect(() =>
        manager.createBranch({ entityId: 'e1', branchName: 'x', fromVersionId: v.id, author: 'a' }),
      ).toThrow();
    });
  });

  describe('listBranches', () => {
    it('returns empty array for unknown entity', () => {
      expect(manager.listBranches('nope')).toHaveLength(0);
    });

    it('lists all created branches', () => {
      const v = seedMainVersion();
      manager.createBranch({ entityId: 'e1', branchName: 'feat-a', fromVersionId: v.id, author: 'a' });
      manager.createBranch({ entityId: 'e1', branchName: 'feat-b', fromVersionId: v.id, author: 'a' });
      const branches = manager.listBranches('e1');
      const names = branches.map(b => b.name);
      expect(names).toContain('main');
      expect(names).toContain('feat-a');
      expect(names).toContain('feat-b');
    });
  });

  describe('getBranch', () => {
    it('returns branch metadata', () => {
      const v = seedMainVersion();
      manager.createBranch({ entityId: 'e1', branchName: 'feat', fromVersionId: v.id, author: 'alice' });
      const meta = manager.getBranch('e1', 'feat');
      expect(meta).toBeDefined();
      expect(meta!.author).toBe('alice');
    });

    it('returns undefined for nonexistent branch', () => {
      expect(manager.getBranch('e1', 'nope')).toBeUndefined();
    });
  });

  describe('updateBranch', () => {
    it('updates description', () => {
      const v = seedMainVersion();
      manager.createBranch({ entityId: 'e1', branchName: 'feat', fromVersionId: v.id, author: 'a' });
      const updated = manager.updateBranch('e1', 'feat', { description: 'Updated desc' });
      expect(updated.description).toBe('Updated desc');
    });

    it('throws for nonexistent branch', () => {
      expect(() => manager.updateBranch('e1', 'nope', {})).toThrow();
    });
  });

  describe('getBranchLog', () => {
    it('returns version history for a branch', () => {
      const v = seedMainVersion();
      store.createVersion({ entityId: 'e1', data: { v: 2 }, author: 'a', message: 'v2', branchName: 'main' });
      const log = manager.getBranchLog('e1', 'main');
      expect(log.totalCommits).toBe(2);
      expect(log.versions[0]!.id).toBeDefined();
    });
  });

  describe('switchBranch', () => {
    it('returns latest version on target branch', () => {
      seedMainVersion();
      const v2 = store.createVersion({ entityId: 'e1', data: { v: 2 }, author: 'a', message: 'v2', branchName: 'main' });
      const latest = manager.switchBranch('e1', 'main');
      expect(latest.id).toBe(v2.id);
    });

    it('throws if branch has no versions', () => {
      expect(() => manager.switchBranch('e1', 'nonexistent')).toThrow();
    });
  });

  describe('mergeBranch', () => {
    it('merges non-conflicting changes successfully', () => {
      seedMainVersion('e1', { a: 1, b: 2 });
      const mainLatest = store.getLatestVersion('e1', 'main')!;

      manager.createBranch({
        entityId: 'e1',
        branchName: 'feature',
        fromVersionId: mainLatest.id,
        author: 'alice',
      });

      // Make a change on feature branch
      store.createVersion({
        entityId: 'e1',
        data: { a: 99, b: 2 },
        author: 'alice',
        message: 'feature change',
        branchName: 'feature',
      });

      const result = manager.mergeBranch({
        entityId: 'e1',
        sourceBranch: 'feature',
        targetBranch: 'main',
        author: 'alice',
        strategy: MergeStrategy.FieldLevel,
      });

      expect(result.success).toBe(true);
      expect(result.mergedVersionId).toBeTruthy();
      expect(result.conflicts).toHaveLength(0);
    });

    it('reports failure when source branch has no versions', () => {
      seedMainVersion();
      const result = manager.mergeBranch({
        entityId: 'e1',
        sourceBranch: 'nonexistent',
        targetBranch: 'main',
        author: 'alice',
      });
      expect(result.success).toBe(false);
    });

    it('creates a merge commit on target branch', () => {
      seedMainVersion('e1', { x: 1 });
      const mainLatest = store.getLatestVersion('e1', 'main')!;
      manager.createBranch({ entityId: 'e1', branchName: 'feat', fromVersionId: mainLatest.id, author: 'a' });
      store.createVersion({ entityId: 'e1', data: { x: 2 }, author: 'a', message: 'change', branchName: 'feat' });

      const beforeCount = store.countVersions('e1', 'main');
      manager.mergeBranch({ entityId: 'e1', sourceBranch: 'feat', targetBranch: 'main', author: 'a' });
      const afterCount = store.countVersions('e1', 'main');
      expect(afterCount).toBe(beforeCount + 1);
    });
  });

  describe('deleteBranch', () => {
    it('deletes a non-main branch', () => {
      const v = seedMainVersion();
      manager.createBranch({ entityId: 'e1', branchName: 'temp', fromVersionId: v.id, author: 'a' });
      expect(manager.deleteBranch('e1', 'temp')).toBe(true);
      expect(manager.getBranch('e1', 'temp')).toBeUndefined();
    });

    it('throws when attempting to delete main branch', () => {
      seedMainVersion();
      expect(() => manager.deleteBranch('e1', 'main')).toThrow();
    });

    it('returns false for nonexistent branch', () => {
      expect(manager.deleteBranch('e1', 'nope')).toBe(false);
    });
  });

  describe('getVersionTree', () => {
    it('builds version tree with all branches', () => {
      const v = seedMainVersion();
      manager.createBranch({ entityId: 'e1', branchName: 'dev', fromVersionId: v.id, author: 'a' });
      const tree = manager.getVersionTree('e1');
      expect(tree.entityId).toBe('e1');
      expect(tree.branches.length).toBeGreaterThanOrEqual(2);
      const names = tree.branches.map(b => b.name);
      expect(names).toContain('main');
      expect(names).toContain('dev');
    });

    it('identifies root version', () => {
      seedMainVersion();
      const tree = manager.getVersionTree('e1');
      expect(tree.rootVersionId).toBeTruthy();
    });
  });
});
