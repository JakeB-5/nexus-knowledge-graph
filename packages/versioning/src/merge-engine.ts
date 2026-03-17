// MergeEngine: three-way merge with conflict detection and resolution

import type {
  Version,
  MergeConflict,
  MergeResult,
  FieldChange,
} from './types.js';
import { MergeStrategy, ChangeType } from './types.js';
import { DiffEngine } from './diff-engine.js';

const diffEngine = new DiffEngine();

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

// Set a nested value by dot-path
function setNested(
  obj: Record<string, unknown>,
  field: string,
  value: unknown,
): void {
  const parts = field.split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  if (value === undefined) {
    delete cursor[last];
  } else {
    cursor[last] = value;
  }
}

// Get a nested value by dot-path
function getNested(obj: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.');
  let cursor: unknown = obj;
  for (const part of parts) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

export class MergeEngine {
  // Three-way merge: base is common ancestor, ours and theirs are diverged versions
  merge(
    base: Version,
    ours: Version,
    theirs: Version,
    strategy: MergeStrategy = MergeStrategy.FieldLevel,
  ): MergeResult {
    switch (strategy) {
      case MergeStrategy.Ours:
        return this.mergeOurs(ours);
      case MergeStrategy.Theirs:
        return this.mergeTheirs(theirs);
      case MergeStrategy.LastWriterWins:
        return this.mergeLastWriterWins(ours, theirs);
      case MergeStrategy.FieldLevel:
      case MergeStrategy.Manual:
        return this.mergeFieldLevel(base, ours, theirs, strategy);
    }
  }

  // Resolve a conflict manually by choosing a value
  resolveConflict(
    result: MergeResult,
    field: string,
    resolvedValue: unknown,
  ): MergeResult {
    const conflicts = result.conflicts.filter(c => c.field !== field);
    const mergedData = structuredClone(result.mergedData);
    setNested(mergedData, field, resolvedValue);

    const conflictingFields = conflicts.map(c => c.field);
    const resolvedFields = [...result.resolvedFields, field];

    return {
      ...result,
      mergedData,
      conflicts,
      resolvedFields,
      conflictingFields,
      success: conflicts.length === 0,
    };
  }

  // Apply the merge result data onto a base object
  applyMergeResult(
    result: MergeResult,
    target: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!result.success) {
      throw new Error(
        `Cannot apply merge result with ${result.conflicts.length} unresolved conflict(s): ${result.conflictingFields.join(', ')}`,
      );
    }
    return structuredClone(result.mergedData);
  }

  // Auto-resolve all conflicts using a fallback strategy
  autoResolveConflicts(
    result: MergeResult,
    fallback: MergeStrategy.Ours | MergeStrategy.Theirs | MergeStrategy.LastWriterWins,
  ): MergeResult {
    let current = result;
    for (const conflict of result.conflicts) {
      let value: unknown;
      if (fallback === MergeStrategy.Ours) {
        value = conflict.ourValue;
      } else if (fallback === MergeStrategy.Theirs) {
        value = conflict.theirValue;
      } else {
        // LastWriterWins: pick their value (assumed more recent)
        value = conflict.theirValue;
      }
      current = this.resolveConflict(current, conflict.field, value);
    }
    return current;
  }

  // Detect conflicts between two change sets
  detectConflicts(
    ourChanges: FieldChange[],
    theirChanges: FieldChange[],
    baseData: Record<string, unknown>,
    ourData: Record<string, unknown>,
    theirData: Record<string, unknown>,
  ): MergeConflict[] {
    const conflicts: MergeConflict[] = [];
    const theirFieldMap = new Map(theirChanges.map(c => [c.field, c]));

    for (const ourChange of ourChanges) {
      const theirChange = theirFieldMap.get(ourChange.field);
      if (!theirChange) continue;

      const ourNewVal = getNested(ourData, ourChange.field);
      const theirNewVal = getNested(theirData, ourChange.field);

      if (!deepEqual(ourNewVal, theirNewVal)) {
        conflicts.push({
          field: ourChange.field,
          ourValue: ourNewVal,
          theirValue: theirNewVal,
          baseValue: getNested(baseData, ourChange.field),
          description: `Conflict on field '${ourChange.field}': ours=${JSON.stringify(ourNewVal)}, theirs=${JSON.stringify(theirNewVal)}`,
        });
      }
    }

    return conflicts;
  }

  private mergeOurs(ours: Version): MergeResult {
    return {
      success: true,
      mergedData: structuredClone(ours.data),
      conflicts: [],
      resolvedFields: [],
      conflictingFields: [],
      strategy: MergeStrategy.Ours,
    };
  }

  private mergeTheirs(theirs: Version): MergeResult {
    return {
      success: true,
      mergedData: structuredClone(theirs.data),
      conflicts: [],
      resolvedFields: [],
      conflictingFields: [],
      strategy: MergeStrategy.Theirs,
    };
  }

  private mergeLastWriterWins(ours: Version, theirs: Version): MergeResult {
    const winner = theirs.timestamp >= ours.timestamp ? theirs : ours;
    return {
      success: true,
      mergedData: structuredClone(winner.data),
      conflicts: [],
      resolvedFields: [],
      conflictingFields: [],
      strategy: MergeStrategy.LastWriterWins,
    };
  }

  private mergeFieldLevel(
    base: Version,
    ours: Version,
    theirs: Version,
    strategy: MergeStrategy,
  ): MergeResult {
    const { ourChanges, theirChanges, conflicts: conflictFields } =
      diffEngine.threeWayDiff(base.data, ours.data, theirs.data);

    // Start with base data
    const mergedData = structuredClone(base.data);

    // Apply non-conflicting changes from ours
    for (const change of ourChanges) {
      if (!conflictFields.includes(change.field)) {
        this.applyFieldChange(mergedData, change);
      }
    }

    // Apply non-conflicting changes from theirs (where ours didn't change)
    const ourChangedFields = new Set(ourChanges.map(c => c.field));
    for (const change of theirChanges) {
      if (!conflictFields.includes(change.field) && !ourChangedFields.has(change.field)) {
        this.applyFieldChange(mergedData, change);
      }
    }

    // Build conflict objects
    const conflicts = this.detectConflicts(
      ourChanges,
      theirChanges,
      base.data,
      ours.data,
      theirs.data,
    );

    const resolvedFields = [
      ...ourChanges.filter(c => !conflictFields.includes(c.field)).map(c => c.field),
      ...theirChanges.filter(c => !conflictFields.includes(c.field) && !ourChangedFields.has(c.field)).map(c => c.field),
    ];

    return {
      success: conflicts.length === 0,
      mergedData,
      conflicts,
      resolvedFields,
      conflictingFields: conflictFields,
      strategy,
    };
  }

  private applyFieldChange(
    obj: Record<string, unknown>,
    change: FieldChange,
  ): void {
    if (change.type === ChangeType.Delete) {
      setNested(obj, change.field, undefined);
    } else {
      setNested(obj, change.field, change.newValue);
    }
  }
}
