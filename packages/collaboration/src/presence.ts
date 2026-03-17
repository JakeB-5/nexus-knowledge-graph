// PresenceManager: track user presence, cursors, selections, and activity per document

import type { CursorPosition, SelectionRange, PresenceEntry } from './types.js';
import { ActivityStatus } from './types.js';

const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
  '#c0392b', '#2980b9', '#27ae60', '#d35400',
];

export interface PresenceHistoryEntry {
  userId: string;
  documentId: string;
  action: 'joined' | 'left' | 'cursor' | 'idle' | 'away';
  timestamp: Date;
  data?: unknown;
}

export interface PresenceBroadcast {
  documentId: string;
  entries: PresenceEntry[];
  timestamp: Date;
}

export class PresenceManager {
  // documentId -> userId -> PresenceEntry
  private presence: Map<string, Map<string, PresenceEntry>> = new Map();
  // documentId -> history entries
  private history: Map<string, PresenceHistoryEntry[]> = new Map();
  // userId -> assigned color index
  private colorAssignments: Map<string, number> = new Map();
  private colorCounter = 0;

  private heartbeatIntervalMs: number;
  private idleThresholdMs: number;
  private awayThresholdMs: number;

  constructor(options: {
    heartbeatIntervalMs?: number;
    idleThresholdMs?: number;
    awayThresholdMs?: number;
  } = {}) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000;
    this.idleThresholdMs = options.idleThresholdMs ?? 30_000;
    this.awayThresholdMs = options.awayThresholdMs ?? 120_000;
  }

  // Track a user joining a document
  join(params: {
    userId: string;
    documentId: string;
    sessionId: string;
    name: string;
  }): PresenceEntry {
    const docMap = this.getOrCreateDocMap(params.documentId);
    const color = this.assignColor(params.userId);

    const entry: PresenceEntry = {
      userId: params.userId,
      documentId: params.documentId,
      sessionId: params.sessionId,
      status: ActivityStatus.Active,
      cursor: null,
      selection: null,
      color,
      name: params.name,
      lastHeartbeat: new Date(),
      joinedAt: new Date(),
    };

    docMap.set(params.userId, entry);
    this.recordHistory(params.documentId, {
      userId: params.userId,
      documentId: params.documentId,
      action: 'joined',
      timestamp: new Date(),
    });

    return entry;
  }

  // Remove a user from a document
  leave(userId: string, documentId: string): boolean {
    const docMap = this.presence.get(documentId);
    if (!docMap) return false;
    const existed = docMap.delete(userId);
    if (existed) {
      this.recordHistory(documentId, {
        userId,
        documentId,
        action: 'left',
        timestamp: new Date(),
      });
    }
    return existed;
  }

  // Update cursor position for a user
  updateCursor(userId: string, documentId: string, cursor: CursorPosition): void {
    const entry = this.getEntry(userId, documentId);
    if (!entry) return;
    entry.cursor = cursor;
    entry.lastHeartbeat = new Date();
    entry.status = ActivityStatus.Active;
    this.recordHistory(documentId, {
      userId,
      documentId,
      action: 'cursor',
      timestamp: new Date(),
      data: cursor,
    });
  }

  // Update selection range for a user
  updateSelection(userId: string, documentId: string, selection: SelectionRange): void {
    const entry = this.getEntry(userId, documentId);
    if (!entry) return;
    entry.selection = selection;
    entry.lastHeartbeat = new Date();
    entry.status = ActivityStatus.Active;
  }

  // Record a heartbeat for a user
  heartbeat(userId: string, documentId: string): void {
    const entry = this.getEntry(userId, documentId);
    if (!entry) return;
    entry.lastHeartbeat = new Date();
    if (entry.status !== ActivityStatus.Active) {
      entry.status = ActivityStatus.Active;
    }
  }

  // Get all present users for a document
  getPresence(documentId: string): PresenceEntry[] {
    const docMap = this.presence.get(documentId);
    if (!docMap) return [];
    return [...docMap.values()];
  }

  // Get presence entry for a specific user
  getUserPresence(userId: string, documentId: string): PresenceEntry | undefined {
    return this.getEntry(userId, documentId);
  }

  // Check and update stale presence statuses
  checkStalePresence(): {
    idled: string[];
    awayUsers: string[];
    removed: string[];
  } {
    const now = Date.now();
    const idled: string[] = [];
    const awayUsers: string[] = [];
    const removed: string[] = [];

    for (const [documentId, docMap] of this.presence.entries()) {
      for (const [userId, entry] of docMap.entries()) {
        const elapsed = now - entry.lastHeartbeat.getTime();

        if (elapsed > this.awayThresholdMs * 2) {
          // Too long gone: remove
          docMap.delete(userId);
          removed.push(userId);
          this.recordHistory(documentId, { userId, documentId, action: 'left', timestamp: new Date() });
        } else if (elapsed > this.awayThresholdMs && entry.status !== ActivityStatus.Away) {
          entry.status = ActivityStatus.Away;
          awayUsers.push(userId);
          this.recordHistory(documentId, { userId, documentId, action: 'away', timestamp: new Date() });
        } else if (elapsed > this.idleThresholdMs && entry.status === ActivityStatus.Active) {
          entry.status = ActivityStatus.Idle;
          idled.push(userId);
          this.recordHistory(documentId, { userId, documentId, action: 'idle', timestamp: new Date() });
        }
      }
    }

    return { idled, awayUsers, removed };
  }

  // Broadcast presence state for a document (snapshot for other clients)
  broadcastPresence(documentId: string): PresenceBroadcast {
    return {
      documentId,
      entries: this.getPresence(documentId),
      timestamp: new Date(),
    };
  }

  // Get presence history for a document
  getHistory(documentId: string, limit = 100): PresenceHistoryEntry[] {
    const hist = this.history.get(documentId) ?? [];
    return hist.slice(-limit);
  }

  // Get who was present at a given time
  getHistoryAtTime(documentId: string, timestamp: Date): string[] {
    const hist = this.history.get(documentId) ?? [];
    const active = new Set<string>();
    for (const entry of hist) {
      if (entry.timestamp > timestamp) break;
      if (entry.action === 'joined') active.add(entry.userId);
      else if (entry.action === 'left') active.delete(entry.userId);
    }
    return [...active];
  }

  // Get color assigned to a user
  getUserColor(userId: string): string | undefined {
    const index = this.colorAssignments.get(userId);
    if (index === undefined) return undefined;
    return COLORS[index % COLORS.length];
  }

  // Check if a user is present in a document
  isPresent(userId: string, documentId: string): boolean {
    return this.presence.get(documentId)?.has(userId) ?? false;
  }

  // Clear all presence for a document
  clearDocument(documentId: string): void {
    this.presence.delete(documentId);
  }

  // Get heartbeat interval configuration
  getHeartbeatIntervalMs(): number {
    return this.heartbeatIntervalMs;
  }

  private assignColor(userId: string): string {
    if (!this.colorAssignments.has(userId)) {
      this.colorAssignments.set(userId, this.colorCounter++);
    }
    return COLORS[this.colorAssignments.get(userId)! % COLORS.length]!;
  }

  private getEntry(userId: string, documentId: string): PresenceEntry | undefined {
    return this.presence.get(documentId)?.get(userId);
  }

  private getOrCreateDocMap(documentId: string): Map<string, PresenceEntry> {
    let map = this.presence.get(documentId);
    if (!map) {
      map = new Map();
      this.presence.set(documentId, map);
    }
    return map;
  }

  private recordHistory(documentId: string, entry: PresenceHistoryEntry): void {
    let hist = this.history.get(documentId);
    if (!hist) {
      hist = [];
      this.history.set(documentId, hist);
    }
    hist.push(entry);
    // Keep last 1000 entries per document
    if (hist.length > 1000) hist.splice(0, hist.length - 1000);
  }
}
