import { describe, it, expect, beforeEach } from 'vitest';
import { VersionStore } from '../version-store.js';

describe('VersionStore', () => {
  let store: VersionStore;

  beforeEach(() => {
    store = new VersionStore();
  });

  describe('createVersion', () => {
    it('creates the first version with version number 1', () => {
      const v = store.createVersion({
        entityId: 'e1',
        data: { title: 'Hello' },
        author: 'alice',
        message: 'initial',
      });
      expect(v.version).toBe(1);
      expect(v.parentId).toBeNull();
      expect(v.branchName).toBe('main');
    });

    it('increments version numbers sequentially', () => {
      const v1 = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'v1' });
      const v2 = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'v2' });
      const v3 = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'v3' });
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
      expect(v2.parentId).toBe(v1.id);
    });

    it('stores a deep clone of data', () => {
      const data = { nested: { value: 1 } };
      const v = store.createVersion({ entityId: 'e1', data, author: 'a', message: 'm' });
      data.nested.value = 999;
      expect((v.data['nested'] as { value: number }).value).toBe(1);
    });

    it('supports custom branch names', () => {
      const v = store.createVersion({
        entityId: 'e1',
        data: {},
        author: 'a',
        message: 'm',
        branchName: 'feature',
      });
      expect(v.branchName).toBe('feature');
    });

    it('assigns tags and metadata', () => {
      const v = store.createVersion({
        entityId: 'e1',
        data: {},
        author: 'a',
        message: 'm',
        tags: ['release', 'stable'],
        metadata: { buildId: 42 },
      });
      expect(v.tags).toContain('release');
      expect(v.metadata['buildId']).toBe(42);
    });

    it('maintains separate sequences per branch', () => {
      store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'm', branchName: 'main' });
      store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'm', branchName: 'main' });
      const feat = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'm', branchName: 'feature' });
      expect(feat.version).toBe(1);
    });
  });

  describe('getVersionById', () => {
    it('retrieves version by ID', () => {
      const v = store.createVersion({ entityId: 'e1', data: { x: 1 }, author: 'a', message: 'm' });
      expect(store.getVersionById(v.id)).toEqual(v);
    });

    it('returns undefined for unknown ID', () => {
      expect(store.getVersionById('nonexistent')).toBeUndefined();
    });
  });

  describe('getLatestVersion', () => {
    it('returns the most recently created version', () => {
      store.createVersion({ entityId: 'e1', data: { v: 1 }, author: 'a', message: 'v1' });
      const v2 = store.createVersion({ entityId: 'e1', data: { v: 2 }, author: 'a', message: 'v2' });
      expect(store.getLatestVersion('e1')?.id).toBe(v2.id);
    });

    it('returns undefined for unknown entity', () => {
      expect(store.getLatestVersion('unknown')).toBeUndefined();
    });

    it('is branch-aware', () => {
      store.createVersion({ entityId: 'e1', data: { v: 1 }, author: 'a', message: 'm', branchName: 'main' });
      const feat = store.createVersion({ entityId: 'e1', data: { v: 2 }, author: 'a', message: 'm', branchName: 'feature' });
      expect(store.getLatestVersion('e1', 'feature')?.id).toBe(feat.id);
    });
  });

  describe('getHistory', () => {
    it('returns all versions in ascending order by default', () => {
      const v1 = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'v1' });
      const v2 = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'v2' });
      const history = store.getHistory('e1');
      expect(history[0]!.id).toBe(v1.id);
      expect(history[1]!.id).toBe(v2.id);
    });

    it('returns versions in descending order when specified', () => {
      const v1 = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'v1' });
      const v2 = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'v2' });
      const history = store.getHistory('e1', 'main', { sortOrder: 'desc' });
      expect(history[0]!.id).toBe(v2.id);
      expect(history[1]!.id).toBe(v1.id);
    });

    it('returns empty array for unknown entity', () => {
      expect(store.getHistory('nope')).toHaveLength(0);
    });
  });

  describe('getVersionAtTime', () => {
    it('returns the latest version at or before the given time', () => {
      const t1 = new Date('2024-01-01');
      const t2 = new Date('2024-06-01');
      const t3 = new Date('2024-12-01');

      const v1 = store.createVersion({ entityId: 'e1', data: { n: 1 }, author: 'a', message: 'v1' });
      // Manually set timestamps for determinism
      (v1 as { timestamp: Date }).timestamp = t1;
      const v2 = store.createVersion({ entityId: 'e1', data: { n: 2 }, author: 'a', message: 'v2' });
      (v2 as { timestamp: Date }).timestamp = t3;

      const result = store.getVersionAtTime('e1', t2);
      expect(result?.id).toBe(v1.id);
    });

    it('returns undefined if all versions are after the given time', () => {
      const v = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'm' });
      (v as { timestamp: Date }).timestamp = new Date('2025-01-01');
      const result = store.getVersionAtTime('e1', new Date('2020-01-01'));
      expect(result).toBeUndefined();
    });
  });

  describe('queryVersions', () => {
    it('filters by author', () => {
      store.createVersion({ entityId: 'e1', data: {}, author: 'alice', message: 'm' });
      store.createVersion({ entityId: 'e1', data: {}, author: 'bob', message: 'm' });
      const result = store.queryVersions({ entityId: 'e1', author: 'alice' });
      expect(result.versions.every(v => v.author === 'alice')).toBe(true);
    });

    it('filters by tags', () => {
      store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'm', tags: ['release'] });
      store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'm', tags: ['draft'] });
      const result = store.queryVersions({ entityId: 'e1', tags: ['release'] });
      expect(result.versions).toHaveLength(1);
    });

    it('filters by message substring', () => {
      store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'fix: bug in login' });
      store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'feat: new dashboard' });
      const result = store.queryVersions({ entityId: 'e1', message: 'fix' });
      expect(result.versions).toHaveLength(1);
    });

    it('paginates results', () => {
      for (let i = 0; i < 10; i++) {
        store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: `v${i}` });
      }
      const result = store.queryVersions({ entityId: 'e1', limit: 3, offset: 0 });
      expect(result.versions).toHaveLength(3);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('reports hasMore correctly on last page', () => {
      for (let i = 0; i < 5; i++) {
        store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: `v${i}` });
      }
      const result = store.queryVersions({ entityId: 'e1', limit: 3, offset: 3 });
      expect(result.versions).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('pruneVersions', () => {
    it('keeps every Nth version plus the last', () => {
      for (let i = 0; i < 10; i++) {
        store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: `v${i}` });
      }
      const { removed, kept } = store.pruneVersions('e1', 'main', 3);
      expect(kept).toBeGreaterThan(0);
      expect(removed + kept).toBe(10);
    });

    it('always keeps the latest version', () => {
      for (let i = 0; i < 5; i++) {
        store.createVersion({ entityId: 'e1', data: { i }, author: 'a', message: `v${i}` });
      }
      store.pruneVersions('e1', 'main', 2);
      const latest = store.getLatestVersion('e1');
      expect(latest).toBeDefined();
      expect((latest!.data as { i: number }).i).toBe(4);
    });
  });

  describe('deleteVersion', () => {
    it('removes the version from store', () => {
      const v = store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'm' });
      expect(store.deleteVersion(v.id)).toBe(true);
      expect(store.getVersionById(v.id)).toBeUndefined();
    });

    it('returns false for nonexistent ID', () => {
      expect(store.deleteVersion('nope')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns correct entity and version counts', () => {
      store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'm' });
      store.createVersion({ entityId: 'e1', data: {}, author: 'a', message: 'm' });
      store.createVersion({ entityId: 'e2', data: {}, author: 'a', message: 'm' });
      const stats = store.getStats();
      expect(stats.entityCount).toBe(2);
      expect(stats.totalVersions).toBe(3);
    });

    it('returns zero stats for empty store', () => {
      const stats = store.getStats();
      expect(stats.entityCount).toBe(0);
      expect(stats.totalVersions).toBe(0);
      expect(stats.oldestVersion).toBeNull();
    });
  });
});
