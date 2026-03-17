import { describe, it, expect, beforeEach } from 'vitest';
import { DiffEngine } from '../diff-engine.js';
import { ChangeType } from '../types.js';
import type { Version } from '../types.js';

function makeVersion(overrides: Partial<Version> & { data: Record<string, unknown> }): Version {
  return {
    id: 'v1',
    entityId: 'e1',
    version: 1,
    author: 'alice',
    message: 'test',
    timestamp: new Date('2024-01-01'),
    parentId: null,
    branchName: 'main',
    tags: [],
    metadata: {},
    ...overrides,
  };
}

describe('DiffEngine', () => {
  let engine: DiffEngine;

  beforeEach(() => {
    engine = new DiffEngine();
  });

  describe('diffObjects', () => {
    it('detects added fields', () => {
      const changes = engine.diffObjects({}, { name: 'Alice' }, '');
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe(ChangeType.Add);
      expect(changes[0]!.field).toBe('name');
      expect(changes[0]!.newValue).toBe('Alice');
      expect(changes[0]!.oldValue).toBeUndefined();
    });

    it('detects deleted fields', () => {
      const changes = engine.diffObjects({ name: 'Alice' }, {}, '');
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe(ChangeType.Delete);
      expect(changes[0]!.field).toBe('name');
      expect(changes[0]!.oldValue).toBe('Alice');
    });

    it('detects modified scalar fields', () => {
      const changes = engine.diffObjects({ age: 30 }, { age: 31 }, '');
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe(ChangeType.Modify);
      expect(changes[0]!.oldValue).toBe(30);
      expect(changes[0]!.newValue).toBe(31);
    });

    it('returns no changes for identical objects', () => {
      const obj = { name: 'Alice', age: 30 };
      const changes = engine.diffObjects(obj, { ...obj }, '');
      expect(changes).toHaveLength(0);
    });

    it('detects nested object changes with dotted field paths', () => {
      const old = { address: { city: 'NYC', zip: '10001' } };
      const updated = { address: { city: 'LA', zip: '90001' } };
      const changes = engine.diffObjects(old, updated, '');
      expect(changes.length).toBeGreaterThanOrEqual(2);
      const cityChange = changes.find(c => c.field === 'address.city');
      expect(cityChange).toBeDefined();
      expect(cityChange!.oldValue).toBe('NYC');
      expect(cityChange!.newValue).toBe('LA');
    });

    it('detects string field modifications with text diff description', () => {
      const old = { bio: 'Hello world\nLine two' };
      const updated = { bio: 'Hello world\nLine two\nLine three' };
      const changes = engine.diffObjects(old, updated, '');
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe(ChangeType.Modify);
      expect(changes[0]!.description).toContain('+');
    });

    it('detects array field modifications', () => {
      const old = { tags: ['a', 'b'] };
      const updated = { tags: ['a', 'b', 'c'] };
      const changes = engine.diffObjects(old, updated, '');
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe(ChangeType.Modify);
    });

    it('uses prefix for nested field paths', () => {
      const changes = engine.diffObjects({ x: 1 }, { x: 2 }, 'parent');
      expect(changes[0]!.field).toBe('parent.x');
    });

    it('handles multiple simultaneous changes', () => {
      const old = { a: 1, b: 2, c: 3 };
      const updated = { a: 10, b: 2, d: 4 };
      const changes = engine.diffObjects(old, updated, '');
      expect(changes.length).toBe(3); // a modified, c deleted, d added
      const types = changes.map(c => c.type);
      expect(types).toContain(ChangeType.Add);
      expect(types).toContain(ChangeType.Modify);
      expect(types).toContain(ChangeType.Delete);
    });
  });

  describe('computeDiff', () => {
    it('computes diff between two versions', () => {
      const v1 = makeVersion({ id: 'v1', data: { title: 'Old Title' } });
      const v2 = makeVersion({ id: 'v2', data: { title: 'New Title' } });
      const diff = engine.computeDiff(v1, v2);
      expect(diff.toVersionId).toBe('v2');
      expect(diff.fromVersionId).toBe('v1');
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0]!.type).toBe(ChangeType.Modify);
    });

    it('computes diff from null (initial version)', () => {
      const v1 = makeVersion({ id: 'v1', data: { title: 'Hello' } });
      const diff = engine.computeDiff(null, v1);
      expect(diff.fromVersionId).toBeNull();
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0]!.type).toBe(ChangeType.Add);
    });

    it('generates human-readable summary', () => {
      const v1 = makeVersion({ data: { a: 1, b: 2 } });
      const v2 = makeVersion({ data: { a: 99, c: 3 } });
      const diff = engine.computeDiff(v1, v2);
      expect(diff.summary).toContain('modified');
      expect(diff.summary).toContain('added');
      expect(diff.summary).toContain('deleted');
    });
  });

  describe('diffArrays', () => {
    it('detects inserted elements', () => {
      const result = engine.diffArrays([1, 2, 3], [1, 2, 3, 4]);
      const inserts = result.filter(d => d.type === 'insert');
      expect(inserts).toHaveLength(1);
      expect(inserts[0]!.value).toBe(4);
    });

    it('detects deleted elements', () => {
      const result = engine.diffArrays([1, 2, 3], [1, 3]);
      const deletes = result.filter(d => d.type === 'delete');
      expect(deletes).toHaveLength(1);
      expect(deletes[0]!.value).toBe(2);
    });

    it('handles equal arrays', () => {
      const result = engine.diffArrays([1, 2, 3], [1, 2, 3]);
      expect(result.every(d => d.type === 'equal')).toBe(true);
    });

    it('handles empty arrays', () => {
      expect(engine.diffArrays([], [])).toHaveLength(0);
      const inserts = engine.diffArrays([], [1, 2]).filter(d => d.type === 'insert');
      expect(inserts).toHaveLength(2);
    });
  });

  describe('threeWayDiff', () => {
    it('identifies conflicting fields', () => {
      const base = { title: 'Original' };
      const ours = { title: 'Our Change' };
      const theirs = { title: 'Their Change' };
      const result = engine.threeWayDiff(base, ours, theirs);
      expect(result.conflicts).toContain('title');
    });

    it('identifies auto-resolvable fields (same value both sides)', () => {
      const base = { title: 'Original', count: 0 };
      const ours = { title: 'Same Change', count: 0 };
      const theirs = { title: 'Same Change', count: 1 };
      const result = engine.threeWayDiff(base, ours, theirs);
      expect(result.autoResolvable).toContain('title');
      expect(result.conflicts).toContain('count');
    });

    it('non-conflicting changes appear only in one side', () => {
      const base = { a: 1, b: 2 };
      const ours = { a: 10, b: 2 };
      const theirs = { a: 1, b: 20 };
      const result = engine.threeWayDiff(base, ours, theirs);
      expect(result.conflicts).toHaveLength(0);
      expect(result.ourChanges.map(c => c.field)).toContain('a');
      expect(result.theirChanges.map(c => c.field)).toContain('b');
    });
  });

  describe('createPatch and applyPatch', () => {
    it('round-trips through patch creation and application', () => {
      const v1 = makeVersion({ data: { name: 'Alice', age: 30 } });
      const v2 = makeVersion({ data: { name: 'Alice', age: 31, city: 'NYC' } });
      const diff = engine.computeDiff(v1, v2);
      const patch = engine.createPatch(diff);
      const restored = engine.applyPatch(v1.data, patch);
      expect(restored['age']).toBe(31);
      expect(restored['city']).toBe('NYC');
    });

    it('creates patch with correct operation types', () => {
      const v1 = makeVersion({ data: { a: 1, b: 2 } });
      const v2 = makeVersion({ data: { a: 99, c: 3 } });
      const diff = engine.computeDiff(v1, v2);
      const patch = engine.createPatch(diff);
      const ops = patch['operations'] as Array<{ op: string }>;
      const opTypes = ops.map(o => o.op);
      expect(opTypes).toContain('replace');
      expect(opTypes).toContain('add');
      expect(opTypes).toContain('remove');
    });
  });

  describe('generateSummary', () => {
    it('returns "No changes" for empty diff', () => {
      expect(engine.generateSummary([])).toBe('No changes');
    });

    it('formats singular and plural correctly', () => {
      const oneAdd = [{ field: 'x', type: ChangeType.Add, oldValue: undefined, newValue: 1, description: '' }];
      expect(engine.generateSummary(oneAdd)).toContain('1 field added');
    });
  });

  describe('restoreFromPatches', () => {
    it('applies multiple patches in sequence', () => {
      const base = { value: 0 };
      const v1 = makeVersion({ id: 'v1', data: { value: 1 } });
      const v2 = makeVersion({ id: 'v2', data: { value: 2 } });
      const d1 = engine.computeDiff(makeVersion({ data: base }), v1);
      const d2 = engine.computeDiff(v1, v2);
      const p1 = engine.createPatch(d1);
      const p2 = engine.createPatch(d2);
      const result = engine.restoreFromPatches(base, [p1, p2]);
      expect(result['value']).toBe(2);
    });
  });
});
