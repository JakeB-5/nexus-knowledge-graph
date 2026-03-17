// SnapshotManager: full and incremental entity snapshots with compression

import type { SnapshotRecord, SnapshotStats } from './types.js';
import { DiffEngine } from './diff-engine.js';
import { VersionStore } from './version-store.js';

function generateId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function estimateSize(obj: unknown): number {
  return JSON.stringify(obj).length;
}

// Simple delta: store only changed fields
function computeDelta(
  base: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(base), ...Object.keys(current)]);
  for (const key of allKeys) {
    if (JSON.stringify(base[key]) !== JSON.stringify(current[key])) {
      delta[key] = current[key];
    }
  }
  return delta;
}

// Apply delta on top of base to reconstruct full object
function applyDelta(
  base: Record<string, unknown>,
  delta: Record<string, unknown>,
): Record<string, unknown> {
  const result = structuredClone(base);
  for (const key of Object.keys(delta)) {
    if (delta[key] === undefined) {
      delete result[key];
    } else {
      result[key] = delta[key];
    }
  }
  return result;
}

export interface SnapshotSchedule {
  entityId: string;
  intervalMs: number;
  lastSnapshotAt: Date | null;
  maxSnapshots: number;
}

export class SnapshotManager {
  private snapshots: Map<string, SnapshotRecord[]> = new Map(); // entityId -> snapshots
  private byId: Map<string, SnapshotRecord> = new Map();
  private schedules: Map<string, SnapshotSchedule> = new Map();
  private diffEngine = new DiffEngine();

  constructor(private store: VersionStore) {}

  // Create a full snapshot of the entity's current data
  createSnapshot(params: {
    entityId: string;
    versionId: string;
    data: Record<string, unknown>;
    compressed?: boolean;
  }): SnapshotRecord {
    const list = this.getOrCreateList(params.entityId);
    const lastSnapshot = list[list.length - 1];

    let storedData: Record<string, unknown>;
    let deltaFromSnapshotId: string | null = null;
    let compressed = params.compressed ?? false;

    if (lastSnapshot && compressed) {
      // Store as delta from last snapshot
      const baseData = this.reconstructData(lastSnapshot);
      storedData = computeDelta(baseData, params.data);
      deltaFromSnapshotId = lastSnapshot.id;
    } else {
      storedData = structuredClone(params.data);
    }

    const snapshot: SnapshotRecord = {
      id: generateId(),
      entityId: params.entityId,
      versionId: params.versionId,
      data: storedData,
      compressed,
      deltaFromSnapshotId,
      createdAt: new Date(),
      size: estimateSize(storedData),
    };

    list.push(snapshot);
    this.byId.set(snapshot.id, snapshot);
    return snapshot;
  }

  // Create an incremental snapshot (only changed fields from last snapshot)
  createIncrementalSnapshot(params: {
    entityId: string;
    versionId: string;
    data: Record<string, unknown>;
  }): SnapshotRecord {
    return this.createSnapshot({ ...params, compressed: true });
  }

  // Restore entity data from a snapshot (resolves delta chains)
  restoreFromSnapshot(snapshotId: string): Record<string, unknown> {
    const snapshot = this.byId.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot '${snapshotId}' not found`);
    }
    return this.reconstructData(snapshot);
  }

  // Get the latest snapshot for an entity
  getLatestSnapshot(entityId: string): SnapshotRecord | undefined {
    const list = this.snapshots.get(entityId);
    if (!list || list.length === 0) return undefined;
    return list[list.length - 1];
  }

  // Get all snapshots for an entity
  getSnapshots(entityId: string): SnapshotRecord[] {
    return [...(this.snapshots.get(entityId) ?? [])];
  }

  // Get snapshot by ID
  getSnapshotById(id: string): SnapshotRecord | undefined {
    return this.byId.get(id);
  }

  // Compare two snapshots and return their diff summary
  compareSnapshots(
    snapshotId1: string,
    snapshotId2: string,
  ): ReturnType<DiffEngine['diffObjects']> {
    const data1 = this.restoreFromSnapshot(snapshotId1);
    const data2 = this.restoreFromSnapshot(snapshotId2);
    return this.diffEngine.diffObjects(data1, data2, '');
  }

  // Restore entity to state at a specific point in time via snapshots
  restoreAtTime(entityId: string, timestamp: Date): Record<string, unknown> | null {
    const list = this.snapshots.get(entityId);
    if (!list || list.length === 0) return null;

    let candidate: SnapshotRecord | undefined;
    for (const snap of list) {
      if (snap.createdAt <= timestamp) {
        candidate = snap;
      } else {
        break;
      }
    }

    if (!candidate) return null;
    return this.reconstructData(candidate);
  }

  // Register a schedule for automatic snapshots
  scheduleSnapshots(params: {
    entityId: string;
    intervalMs: number;
    maxSnapshots?: number;
  }): SnapshotSchedule {
    const schedule: SnapshotSchedule = {
      entityId: params.entityId,
      intervalMs: params.intervalMs,
      lastSnapshotAt: null,
      maxSnapshots: params.maxSnapshots ?? 100,
    };
    this.schedules.set(params.entityId, schedule);
    return schedule;
  }

  // Check if a scheduled snapshot should be taken and take it if so
  runScheduledSnapshot(entityId: string): SnapshotRecord | null {
    const schedule = this.schedules.get(entityId);
    if (!schedule) return null;

    const now = new Date();
    const lastTime = schedule.lastSnapshotAt?.getTime() ?? 0;
    if (now.getTime() - lastTime < schedule.intervalMs) {
      return null;
    }

    // Get current version data from the store
    const latestVersion = this.store.getLatestVersion(entityId);
    if (!latestVersion) return null;

    schedule.lastSnapshotAt = now;
    const snapshot = this.createIncrementalSnapshot({
      entityId,
      versionId: latestVersion.id,
      data: latestVersion.data,
    });

    // Enforce max snapshots
    this.enforceMaxSnapshots(entityId, schedule.maxSnapshots);
    return snapshot;
  }

  // Get storage statistics for snapshots
  getStats(): SnapshotStats {
    let totalSize = 0;
    let snapshotCount = 0;
    let compressedCount = 0;

    for (const list of this.snapshots.values()) {
      for (const snap of list) {
        snapshotCount++;
        totalSize += snap.size;
        if (snap.compressed) compressedCount++;
      }
    }

    return {
      snapshotCount,
      totalSize,
      compressedCount,
      averageSize: snapshotCount > 0 ? totalSize / snapshotCount : 0,
    };
  }

  // Delete a snapshot by ID
  deleteSnapshot(id: string): boolean {
    const snapshot = this.byId.get(id);
    if (!snapshot) return false;

    const list = this.snapshots.get(snapshot.entityId);
    if (!list) return false;

    // Cannot delete snapshot that others depend on (delta chain)
    const dependents = list.filter(s => s.deltaFromSnapshotId === id);
    if (dependents.length > 0) {
      throw new Error(`Cannot delete snapshot '${id}': ${dependents.length} snapshot(s) depend on it`);
    }

    const idx = list.findIndex(s => s.id === id);
    if (idx !== -1) list.splice(idx, 1);
    this.byId.delete(id);
    return true;
  }

  // Clear all snapshots for an entity
  clearSnapshots(entityId: string): number {
    const list = this.snapshots.get(entityId);
    if (!list) return 0;
    const count = list.length;
    for (const snap of list) {
      this.byId.delete(snap.id);
    }
    this.snapshots.delete(entityId);
    return count;
  }

  private reconstructData(snapshot: SnapshotRecord): Record<string, unknown> {
    if (!snapshot.deltaFromSnapshotId) {
      return structuredClone(snapshot.data);
    }

    const parent = this.byId.get(snapshot.deltaFromSnapshotId);
    if (!parent) {
      throw new Error(`Parent snapshot '${snapshot.deltaFromSnapshotId}' not found for delta chain`);
    }

    const baseData = this.reconstructData(parent);
    return applyDelta(baseData, snapshot.data);
  }

  private getOrCreateList(entityId: string): SnapshotRecord[] {
    let list = this.snapshots.get(entityId);
    if (!list) {
      list = [];
      this.snapshots.set(entityId, list);
    }
    return list;
  }

  private enforceMaxSnapshots(entityId: string, max: number): void {
    const list = this.snapshots.get(entityId);
    if (!list || list.length <= max) return;

    // Remove oldest non-anchor snapshots first
    while (list.length > max) {
      const candidate = list[0];
      if (!candidate) break;
      // Skip if others depend on it
      const hasDependents = list.some(s => s.deltaFromSnapshotId === candidate.id);
      if (hasDependents) {
        // Try next
        break;
      }
      list.shift();
      this.byId.delete(candidate.id);
    }
  }
}
