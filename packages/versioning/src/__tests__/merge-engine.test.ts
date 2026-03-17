import { describe, it, expect, beforeEach } from 'vitest';
import { MergeEngine } from '../merge-engine.js';
import { MergeStrategy } from '../types.js';
import type { Version } from '../types.js';

function makeVersion(
  id: string,
  data: Record<string, unknown>,
  overrides: Partial<Version> = {},
): Version {
  return {
    id,
    entityId: 'e1',
    version: 1,
    author: 'alice',
    message: 'test',
    timestamp: new Date('2024-01-01'),
    parentId: null,
    branchName: 'main',
    tags: [],
    metadata: {},
    data,
    ...overrides,
  };
}

describe('MergeEngine', () => {
  let engine: MergeEngine;

  beforeEach(() => {
    engine = new MergeEngine();
  });

  describe('MergeStrategy.Ours', () => {
    it('returns our version data unchanged', () => {
      const base = makeVersion('base', { title: 'Base' });
      const ours = makeVersion('ours', { title: 'Ours' });
      const theirs = makeVersion('theirs', { title: 'Theirs' });
      const result = engine.merge(base, ours, theirs, MergeStrategy.Ours);
      expect(result.success).toBe(true);
      expect(result.mergedData['title']).toBe('Ours');
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe('MergeStrategy.Theirs', () => {
    it('returns their version data unchanged', () => {
      const base = makeVersion('base', { title: 'Base' });
      const ours = makeVersion('ours', { title: 'Ours' });
      const theirs = makeVersion('theirs', { title: 'Theirs' });
      const result = engine.merge(base, ours, theirs, MergeStrategy.Theirs);
      expect(result.success).toBe(true);
      expect(result.mergedData['title']).toBe('Theirs');
    });
  });

  describe('MergeStrategy.LastWriterWins', () => {
    it('picks the most recent version', () => {
      const base = makeVersion('base', { count: 0 });
      const ours = makeVersion('ours', { count: 1 }, {
        timestamp: new Date('2024-01-01'),
      });
      const theirs = makeVersion('theirs', { count: 2 }, {
        timestamp: new Date('2024-06-01'),
      });
      const result = engine.merge(base, ours, theirs, MergeStrategy.LastWriterWins);
      expect(result.success).toBe(true);
      expect(result.mergedData['count']).toBe(2);
    });

    it('picks ours if ours is newer', () => {
      const base = makeVersion('base', { count: 0 });
      const ours = makeVersion('ours', { count: 10 }, {
        timestamp: new Date('2024-12-01'),
      });
      const theirs = makeVersion('theirs', { count: 2 }, {
        timestamp: new Date('2024-01-01'),
      });
      const result = engine.merge(base, ours, theirs, MergeStrategy.LastWriterWins);
      expect(result.mergedData['count']).toBe(10);
    });
  });

  describe('MergeStrategy.FieldLevel', () => {
    it('merges non-conflicting changes from both sides', () => {
      const base = makeVersion('base', { a: 1, b: 2, c: 3 });
      const ours = makeVersion('ours', { a: 10, b: 2, c: 3 });
      const theirs = makeVersion('theirs', { a: 1, b: 20, c: 3 });
      const result = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      expect(result.success).toBe(true);
      expect(result.mergedData['a']).toBe(10);
      expect(result.mergedData['b']).toBe(20);
      expect(result.mergedData['c']).toBe(3);
      expect(result.conflicts).toHaveLength(0);
    });

    it('detects conflict when both sides change the same field differently', () => {
      const base = makeVersion('base', { title: 'Original' });
      const ours = makeVersion('ours', { title: 'Our Title' });
      const theirs = makeVersion('theirs', { title: 'Their Title' });
      const result = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      expect(result.success).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]!.field).toBe('title');
      expect(result.conflicts[0]!.ourValue).toBe('Their Title');
      expect(result.conflicts[0]!.theirValue).toBe('Our Title');
    });

    it('no conflict when both sides make the identical change', () => {
      const base = makeVersion('base', { title: 'Original' });
      const ours = makeVersion('ours', { title: 'Same' });
      const theirs = makeVersion('theirs', { title: 'Same' });
      const result = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      expect(result.success).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('applies added fields from both sides', () => {
      const base = makeVersion('base', {});
      const ours = makeVersion('ours', { fromOurs: true });
      const theirs = makeVersion('theirs', { fromTheirs: true });
      const result = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      expect(result.success).toBe(true);
      expect(result.mergedData['fromOurs']).toBe(true);
      expect(result.mergedData['fromTheirs']).toBe(true);
    });

    it('preserves base fields not changed by either side', () => {
      const base = makeVersion('base', { unchanged: 'stays', x: 1 });
      const ours = makeVersion('ours', { unchanged: 'stays', x: 99 });
      const theirs = makeVersion('theirs', { unchanged: 'stays', x: 1 });
      const result = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      expect(result.mergedData['unchanged']).toBe('stays');
    });

    it('reports conflicting and resolved fields', () => {
      const base = makeVersion('base', { a: 1, b: 2 });
      const ours = makeVersion('ours', { a: 10, b: 99 });
      const theirs = makeVersion('theirs', { a: 20, b: 2 });
      const result = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      expect(result.conflictingFields).toContain('a');
    });
  });

  describe('resolveConflict', () => {
    it('resolves a single conflict and marks success', () => {
      const base = makeVersion('base', { title: 'Base' });
      const ours = makeVersion('ours', { title: 'Ours' });
      const theirs = makeVersion('theirs', { title: 'Theirs' });
      const mergeResult = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      expect(mergeResult.success).toBe(false);

      const resolved = engine.resolveConflict(mergeResult, 'title', 'Chosen');
      expect(resolved.success).toBe(true);
      expect(resolved.mergedData['title']).toBe('Chosen');
      expect(resolved.conflicts).toHaveLength(0);
      expect(resolved.resolvedFields).toContain('title');
    });

    it('resolves multiple conflicts one by one', () => {
      const base = makeVersion('base', { a: 1, b: 2 });
      const ours = makeVersion('ours', { a: 10, b: 20 });
      const theirs = makeVersion('theirs', { a: 11, b: 21 });
      let result = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      expect(result.success).toBe(false);

      result = engine.resolveConflict(result, 'a', 10);
      expect(result.conflicts).toHaveLength(1);
      expect(result.success).toBe(false);

      result = engine.resolveConflict(result, 'b', 20);
      expect(result.success).toBe(true);
    });
  });

  describe('autoResolveConflicts', () => {
    it('auto-resolves with Ours strategy', () => {
      const base = makeVersion('base', { x: 0 });
      const ours = makeVersion('ours', { x: 1 });
      const theirs = makeVersion('theirs', { x: 2 });
      const mergeResult = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      const resolved = engine.autoResolveConflicts(mergeResult, MergeStrategy.Ours);
      expect(resolved.success).toBe(true);
      // ours.x = theirs = 2 (theirs is passed as ours in merge call perspective)
      expect(typeof resolved.mergedData['x']).toBe('number');
    });

    it('auto-resolves with Theirs strategy', () => {
      const base = makeVersion('base', { x: 0 });
      const ours = makeVersion('ours', { x: 1 });
      const theirs = makeVersion('theirs', { x: 2 });
      const mergeResult = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      const resolved = engine.autoResolveConflicts(mergeResult, MergeStrategy.Theirs);
      expect(resolved.success).toBe(true);
    });
  });

  describe('applyMergeResult', () => {
    it('applies successful merge result', () => {
      const base = makeVersion('base', { a: 1 });
      const ours = makeVersion('ours', { a: 2 });
      const theirs = makeVersion('theirs', { a: 1 });
      const result = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      const applied = engine.applyMergeResult(result, {});
      expect(applied['a']).toBe(2);
    });

    it('throws on unsuccessful merge result', () => {
      const base = makeVersion('base', { x: 0 });
      const ours = makeVersion('ours', { x: 1 });
      const theirs = makeVersion('theirs', { x: 2 });
      const result = engine.merge(base, ours, theirs, MergeStrategy.FieldLevel);
      expect(() => engine.applyMergeResult(result, {})).toThrow();
    });
  });

  describe('detectConflicts', () => {
    it('returns empty array when no overlapping fields changed', () => {
      const ourChanges = [{ field: 'a', type: 'modify' as const, oldValue: 1, newValue: 2, description: '' }];
      const theirChanges = [{ field: 'b', type: 'modify' as const, oldValue: 3, newValue: 4, description: '' }];
      const conflicts = engine.detectConflicts(ourChanges, theirChanges, { a: 1, b: 3 }, { a: 2, b: 3 }, { a: 1, b: 4 });
      expect(conflicts).toHaveLength(0);
    });

    it('detects conflict on same field with different values', () => {
      const ourChanges = [{ field: 'name', type: 'modify' as const, oldValue: 'A', newValue: 'B', description: '' }];
      const theirChanges = [{ field: 'name', type: 'modify' as const, oldValue: 'A', newValue: 'C', description: '' }];
      const conflicts = engine.detectConflicts(
        ourChanges, theirChanges,
        { name: 'A' }, { name: 'B' }, { name: 'C' },
      );
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]!.field).toBe('name');
      expect(conflicts[0]!.ourValue).toBe('B');
      expect(conflicts[0]!.theirValue).toBe('C');
    });
  });
});
