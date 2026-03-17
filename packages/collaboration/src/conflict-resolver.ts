// ConflictResolver: detect and resolve editing conflicts in collaboration sessions

import type { ConflictRecord, ConflictResolution } from './types.js';

function generateId(): string {
  return `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  return aKeys.every(k => deepEqual(aObj[k], bObj[k]));
}

export type ResolutionStrategy = 'auto-merge' | 'last-writer-wins' | 'prompt-user';

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflicts: ConflictRecord[];
  conflictingFields: string[];
}

export interface MergeAttempt {
  field: string;
  ourValue: unknown;
  theirValue: unknown;
  merged: unknown | null;
  strategy: ResolutionStrategy;
  success: boolean;
}

export class ConflictResolver {
  private conflicts: Map<string, ConflictRecord> = new Map(); // id -> record
  private history: ConflictRecord[] = [];
  private notificationCallbacks: Map<string, (conflict: ConflictRecord) => void> = new Map();

  // Detect conflicts between two concurrent change sets
  detectConflicts(params: {
    documentId: string;
    sessionId: string;
    ourChanges: Record<string, unknown>;
    theirChanges: Record<string, unknown>;
  }): ConflictDetectionResult {
    const conflicts: ConflictRecord[] = [];
    const conflictingFields: string[] = [];

    const ourFields = Object.keys(params.ourChanges);
    const theirFields = new Set(Object.keys(params.theirChanges));

    for (const field of ourFields) {
      if (!theirFields.has(field)) continue;
      const ourVal = params.ourChanges[field];
      const theirVal = params.theirChanges[field];
      if (!deepEqual(ourVal, theirVal)) {
        const record: ConflictRecord = {
          id: generateId(),
          documentId: params.documentId,
          sessionId: params.sessionId,
          field,
          ourValue: ourVal,
          theirValue: theirVal,
          resolvedAt: null,
          resolution: null,
          createdAt: new Date(),
        };
        this.conflicts.set(record.id, record);
        conflicts.push(record);
        conflictingFields.push(field);
        this.notifyObservers(record);
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
      conflictingFields,
    };
  }

  // Attempt to auto-merge field values (works for numbers/arrays with non-overlapping changes)
  autoMerge(field: string, ourValue: unknown, theirValue: unknown): MergeAttempt {
    // Numeric: sum deltas
    if (typeof ourValue === 'number' && typeof theirValue === 'number') {
      return {
        field,
        ourValue,
        theirValue,
        merged: Math.max(ourValue, theirValue), // take higher value
        strategy: 'auto-merge',
        success: true,
      };
    }

    // Arrays: union merge (deduplicated)
    if (Array.isArray(ourValue) && Array.isArray(theirValue)) {
      const merged = [...ourValue];
      for (const item of theirValue) {
        if (!merged.some(v => deepEqual(v, item))) {
          merged.push(item);
        }
      }
      return { field, ourValue, theirValue, merged, strategy: 'auto-merge', success: true };
    }

    // Strings: can't auto-merge
    return { field, ourValue, theirValue, merged: null, strategy: 'auto-merge', success: false };
  }

  // Merge concurrent changes using a strategy
  mergeChanges(params: {
    ourChanges: Record<string, unknown>;
    theirChanges: Record<string, unknown>;
    strategy: ResolutionStrategy;
    documentId: string;
    sessionId: string;
  }): {
    merged: Record<string, unknown>;
    conflicts: ConflictRecord[];
    attempts: MergeAttempt[];
  } {
    const merged: Record<string, unknown> = { ...params.ourChanges };
    const conflicts: ConflictRecord[] = [];
    const attempts: MergeAttempt[] = [];

    for (const [field, theirVal] of Object.entries(params.theirChanges)) {
      if (!(field in params.ourChanges)) {
        merged[field] = theirVal;
        continue;
      }

      const ourVal = params.ourChanges[field];
      if (deepEqual(ourVal, theirVal)) continue;

      switch (params.strategy) {
        case 'auto-merge': {
          const attempt = this.autoMerge(field, ourVal, theirVal);
          attempts.push(attempt);
          if (attempt.success && attempt.merged !== null) {
            merged[field] = attempt.merged;
          } else {
            // Fall back to creating a conflict
            const record = this.createConflictRecord(params.documentId, params.sessionId, field, ourVal, theirVal);
            conflicts.push(record);
          }
          break;
        }
        case 'last-writer-wins':
          // Theirs wins (assumed more recent)
          merged[field] = theirVal;
          attempts.push({ field, ourValue: ourVal, theirValue: theirVal, merged: theirVal, strategy: 'last-writer-wins', success: true });
          break;
        case 'prompt-user': {
          const record = this.createConflictRecord(params.documentId, params.sessionId, field, ourVal, theirVal);
          conflicts.push(record);
          this.notifyObservers(record);
          break;
        }
      }
    }

    return { merged, conflicts, attempts };
  }

  // Resolve a specific conflict with a chosen value
  resolveConflict(conflictId: string, resolution: ConflictResolution): ConflictRecord {
    const record = this.conflicts.get(conflictId);
    if (!record) throw new Error(`Conflict '${conflictId}' not found`);

    record.resolution = resolution;
    record.resolvedAt = new Date();
    this.history.push({ ...record });
    this.conflicts.delete(conflictId);
    return record;
  }

  // Get all unresolved conflicts
  getUnresolvedConflicts(): ConflictRecord[] {
    return [...this.conflicts.values()];
  }

  // Get a conflict by ID
  getConflict(id: string): ConflictRecord | undefined {
    return this.conflicts.get(id);
  }

  // Get conflict history (resolved)
  getHistory(documentId?: string): ConflictRecord[] {
    if (documentId) {
      return this.history.filter(c => c.documentId === documentId);
    }
    return [...this.history];
  }

  // Register a notification callback for new conflicts (e.g., for UI prompts)
  onConflict(callbackId: string, fn: (conflict: ConflictRecord) => void): void {
    this.notificationCallbacks.set(callbackId, fn);
  }

  // Unregister a notification callback
  offConflict(callbackId: string): void {
    this.notificationCallbacks.delete(callbackId);
  }

  // Field-level resolution: choose our value
  resolveWithOurs(conflictId: string): ConflictRecord {
    const record = this.conflicts.get(conflictId);
    if (!record) throw new Error(`Conflict '${conflictId}' not found`);
    return this.resolveConflict(conflictId, {
      strategy: 'last-writer-wins',
      winner: 'ours',
      result: JSON.stringify(record.ourValue),
    });
  }

  // Field-level resolution: choose their value
  resolveWithTheirs(conflictId: string): ConflictRecord {
    const record = this.conflicts.get(conflictId);
    if (!record) throw new Error(`Conflict '${conflictId}' not found`);
    return this.resolveConflict(conflictId, {
      strategy: 'last-writer-wins',
      winner: 'theirs',
      result: JSON.stringify(record.theirValue),
    });
  }

  // Auto-resolve all pending conflicts using a strategy
  autoResolveAll(strategy: ResolutionStrategy): ConflictRecord[] {
    const resolved: ConflictRecord[] = [];
    for (const record of this.conflicts.values()) {
      if (strategy === 'last-writer-wins') {
        const r = this.resolveWithTheirs(record.id);
        resolved.push(r);
      } else if (strategy === 'auto-merge') {
        const attempt = this.autoMerge(record.field, record.ourValue, record.theirValue);
        if (attempt.success) {
          const r = this.resolveConflict(record.id, {
            strategy: 'auto-merge',
            result: JSON.stringify(attempt.merged),
          });
          resolved.push(r);
        }
      }
    }
    return resolved;
  }

  // Clear all conflicts (e.g., on session close)
  clear(): void {
    this.conflicts.clear();
  }

  private createConflictRecord(
    documentId: string,
    sessionId: string,
    field: string,
    ourValue: unknown,
    theirValue: unknown,
  ): ConflictRecord {
    const record: ConflictRecord = {
      id: generateId(),
      documentId,
      sessionId,
      field,
      ourValue,
      theirValue,
      resolvedAt: null,
      resolution: null,
      createdAt: new Date(),
    };
    this.conflicts.set(record.id, record);
    return record;
  }

  private notifyObservers(conflict: ConflictRecord): void {
    for (const fn of this.notificationCallbacks.values()) {
      fn(conflict);
    }
  }
}
