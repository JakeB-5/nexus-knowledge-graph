// DiffEngine: compute diffs between versions at field and object level

import type {
  Version,
  VersionDiff,
  FieldChange,
  ArrayDiff,
} from './types.js';
import { ChangeType } from './types.js';
import { TextDiff } from './text-diff.js';

const textDiff = new TextDiff();

// Deep equality check
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(k => deepEqual(aObj[k], bObj[k]));
}

// Longest Common Subsequence for arrays
function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = deepEqual as (x: T, y: T) => boolean): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (eq(a[i - 1]!, b[j - 1]!)) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  return dp;
}

function backtrackLcs<T>(
  dp: number[][],
  a: T[],
  b: T[],
  i: number,
  j: number,
  eq: (x: T, y: T) => boolean,
): ArrayDiff<T>[] {
  if (i === 0 && j === 0) return [];

  if (i > 0 && j > 0 && eq(a[i - 1]!, b[j - 1]!)) {
    const rest = backtrackLcs(dp, a, b, i - 1, j - 1, eq);
    rest.push({ type: 'equal', value: a[i - 1]!, oldIndex: i - 1, newIndex: j - 1 });
    return rest;
  }

  if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
    const rest = backtrackLcs(dp, a, b, i, j - 1, eq);
    rest.push({ type: 'insert', value: b[j - 1]!, oldIndex: null, newIndex: j - 1 });
    return rest;
  }

  const rest = backtrackLcs(dp, a, b, i - 1, j, eq);
  rest.push({ type: 'delete', value: a[i - 1]!, oldIndex: i - 1, newIndex: null });
  return rest;
}

export class DiffEngine {
  // Compute diff between two versions
  computeDiff(fromVersion: Version | null, toVersion: Version): VersionDiff {
    const fromData = fromVersion?.data ?? {};
    const changes = this.diffObjects(fromData, toVersion.data, '');
    const summary = this.generateSummary(changes);

    return {
      fromVersionId: fromVersion?.id ?? null,
      toVersionId: toVersion.id,
      entityId: toVersion.entityId,
      changes,
      timestamp: new Date(),
      summary,
    };
  }

  // Field-level diff between two plain objects
  diffObjects(
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
    prefix: string,
  ): FieldChange[] {
    const changes: FieldChange[] = [];
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const field = prefix ? `${prefix}.${key}` : key;
      const oldVal = oldObj[key];
      const newVal = newObj[key];

      if (!(key in oldObj)) {
        changes.push({
          field,
          type: ChangeType.Add,
          oldValue: undefined,
          newValue: newVal,
          description: `Added field '${field}' with value ${JSON.stringify(newVal)}`,
        });
      } else if (!(key in newObj)) {
        changes.push({
          field,
          type: ChangeType.Delete,
          oldValue: oldVal,
          newValue: undefined,
          description: `Deleted field '${field}' (was ${JSON.stringify(oldVal)})`,
        });
      } else if (!deepEqual(oldVal, newVal)) {
        // Check if nested object
        if (
          oldVal !== null &&
          newVal !== null &&
          typeof oldVal === 'object' &&
          typeof newVal === 'object' &&
          !Array.isArray(oldVal) &&
          !Array.isArray(newVal)
        ) {
          const nested = this.diffObjects(
            oldVal as Record<string, unknown>,
            newVal as Record<string, unknown>,
            field,
          );
          changes.push(...nested);
        } else if (typeof oldVal === 'string' && typeof newVal === 'string') {
          // Text diff for string fields
          const lines = textDiff.diffLines(oldVal, newVal);
          const additions = lines.filter(l => l.type === 'insert').length;
          const deletions = lines.filter(l => l.type === 'delete').length;
          changes.push({
            field,
            type: ChangeType.Modify,
            oldValue: oldVal,
            newValue: newVal,
            description: `Modified '${field}': +${additions} lines, -${deletions} lines`,
          });
        } else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
          const arrayChanges = this.diffArrays(oldVal, newVal);
          const added = arrayChanges.filter(c => c.type === 'insert').length;
          const removed = arrayChanges.filter(c => c.type === 'delete').length;
          changes.push({
            field,
            type: ChangeType.Modify,
            oldValue: oldVal,
            newValue: newVal,
            description: `Modified array '${field}': +${added} items, -${removed} items`,
          });
        } else {
          changes.push({
            field,
            type: ChangeType.Modify,
            oldValue: oldVal,
            newValue: newVal,
            description: `Modified '${field}': ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`,
          });
        }
      }
    }

    return changes;
  }

  // Array diff using LCS
  diffArrays<T>(oldArr: T[], newArr: T[]): ArrayDiff<T>[] {
    const eq = (a: T, b: T): boolean => deepEqual(a, b);
    const dp = lcs(oldArr, newArr, eq);
    return backtrackLcs(dp, oldArr, newArr, oldArr.length, newArr.length, eq);
  }

  // Three-way diff: base -> ours, base -> theirs
  threeWayDiff(
    base: Record<string, unknown>,
    ours: Record<string, unknown>,
    theirs: Record<string, unknown>,
  ): {
    ourChanges: FieldChange[];
    theirChanges: FieldChange[];
    conflicts: string[];
    autoResolvable: string[];
  } {
    const ourChanges = this.diffObjects(base, ours, '');
    const theirChanges = this.diffObjects(base, theirs, '');

    const ourFields = new Set(ourChanges.map(c => c.field));
    const theirFields = new Set(theirChanges.map(c => c.field));

    const conflicts: string[] = [];
    const autoResolvable: string[] = [];

    for (const field of ourFields) {
      if (theirFields.has(field)) {
        const ourChange = ourChanges.find(c => c.field === field)!;
        const theirChange = theirChanges.find(c => c.field === field)!;
        if (!deepEqual(ourChange.newValue, theirChange.newValue)) {
          conflicts.push(field);
        } else {
          autoResolvable.push(field);
        }
      }
    }

    return { ourChanges, theirChanges, conflicts, autoResolvable };
  }

  // Create a patch object from diff
  createPatch(diff: VersionDiff): Record<string, unknown> {
    const patch: Record<string, unknown> = {
      fromVersionId: diff.fromVersionId,
      toVersionId: diff.toVersionId,
      entityId: diff.entityId,
      timestamp: diff.toVersionId,
      operations: diff.changes.map(c => ({
        op: c.type === ChangeType.Add ? 'add' : c.type === ChangeType.Delete ? 'remove' : 'replace',
        path: `/${c.field.replace(/\./g, '/')}`,
        value: c.newValue,
        oldValue: c.oldValue,
      })),
    };
    return patch;
  }

  // Apply patch to restore a version's data
  applyPatch(
    base: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = structuredClone(base);
    const operations = patch['operations'] as Array<{
      op: string;
      path: string;
      value: unknown;
    }>;

    for (const op of operations) {
      const parts = op.path.replace(/^\//, '').split('/');
      this.applyOperation(result, parts, op.op, op.value);
    }

    return result;
  }

  // Generate human-readable summary of changes
  generateSummary(changes: FieldChange[]): string {
    if (changes.length === 0) return 'No changes';

    const added = changes.filter(c => c.type === ChangeType.Add).length;
    const modified = changes.filter(c => c.type === ChangeType.Modify).length;
    const deleted = changes.filter(c => c.type === ChangeType.Delete).length;

    const parts: string[] = [];
    if (added > 0) parts.push(`${added} field${added > 1 ? 's' : ''} added`);
    if (modified > 0) parts.push(`${modified} field${modified > 1 ? 's' : ''} modified`);
    if (deleted > 0) parts.push(`${deleted} field${deleted > 1 ? 's' : ''} deleted`);

    return parts.join(', ');
  }

  // Restore entity data by applying a sequence of patches from a base version
  restoreFromPatches(
    baseData: Record<string, unknown>,
    patches: Record<string, unknown>[],
  ): Record<string, unknown> {
    let data = structuredClone(baseData);
    for (const patch of patches) {
      data = this.applyPatch(data, patch);
    }
    return data;
  }

  private applyOperation(
    obj: Record<string, unknown>,
    path: string[],
    op: string,
    value: unknown,
  ): void {
    if (path.length === 0) return;

    if (path.length === 1) {
      const key = path[0]!;
      if (op === 'remove') {
        delete obj[key];
      } else {
        obj[key] = value;
      }
      return;
    }

    const key = path[0]!;
    if (typeof obj[key] !== 'object' || obj[key] === null) {
      obj[key] = {};
    }
    this.applyOperation(obj[key] as Record<string, unknown>, path.slice(1), op, value);
  }
}
