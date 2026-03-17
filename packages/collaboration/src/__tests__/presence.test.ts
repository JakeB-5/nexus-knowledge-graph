import { describe, it, expect, beforeEach } from 'vitest';
import { PresenceManager } from '../presence.js';
import { ActivityStatus } from '../types.js';

describe('PresenceManager', () => {
  let manager: PresenceManager;

  beforeEach(() => {
    manager = new PresenceManager({
      idleThresholdMs: 5_000,
      awayThresholdMs: 15_000,
    });
  });

  describe('join', () => {
    it('adds a presence entry for the user', () => {
      const entry = manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      expect(entry.userId).toBe('u1');
      expect(entry.documentId).toBe('doc1');
      expect(entry.name).toBe('Alice');
      expect(entry.status).toBe(ActivityStatus.Active);
      expect(entry.cursor).toBeNull();
    });

    it('assigns a color to the user', () => {
      const entry = manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      expect(entry.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('assigns different colors to different users', () => {
      const e1 = manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const e2 = manager.join({ userId: 'u2', documentId: 'doc1', sessionId: 's1', name: 'Bob' });
      expect(e1.color).not.toBe(e2.color);
    });

    it('records join event in history', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const history = manager.getHistory('doc1');
      expect(history.some(h => h.action === 'joined' && h.userId === 'u1')).toBe(true);
    });
  });

  describe('leave', () => {
    it('removes user from presence', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const result = manager.leave('u1', 'doc1');
      expect(result).toBe(true);
      expect(manager.isPresent('u1', 'doc1')).toBe(false);
    });

    it('returns false for non-present user', () => {
      expect(manager.leave('nope', 'doc1')).toBe(false);
    });

    it('records leave event in history', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      manager.leave('u1', 'doc1');
      const history = manager.getHistory('doc1');
      expect(history.some(h => h.action === 'left' && h.userId === 'u1')).toBe(true);
    });
  });

  describe('updateCursor', () => {
    it('sets cursor position for user', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      manager.updateCursor('u1', 'doc1', { line: 5, column: 10, offset: 50 });
      const entry = manager.getUserPresence('u1', 'doc1');
      expect(entry!.cursor).toEqual({ line: 5, column: 10, offset: 50 });
    });

    it('updates status to Active on cursor move', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const entry = manager.getUserPresence('u1', 'doc1')!;
      entry.status = ActivityStatus.Idle;
      manager.updateCursor('u1', 'doc1', { line: 1, column: 1, offset: 0 });
      expect(entry.status).toBe(ActivityStatus.Active);
    });

    it('silently ignores cursor update for non-present user', () => {
      expect(() => manager.updateCursor('nope', 'doc1', { line: 1, column: 1, offset: 0 })).not.toThrow();
    });
  });

  describe('updateSelection', () => {
    it('sets selection range for user', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const selection = {
        start: { line: 1, column: 0, offset: 0 },
        end: { line: 1, column: 10, offset: 10 },
        direction: 'forward' as const,
      };
      manager.updateSelection('u1', 'doc1', selection);
      const entry = manager.getUserPresence('u1', 'doc1');
      expect(entry!.selection).toEqual(selection);
    });
  });

  describe('heartbeat', () => {
    it('updates lastHeartbeat for user', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const before = manager.getUserPresence('u1', 'doc1')!.lastHeartbeat;
      manager.heartbeat('u1', 'doc1');
      const after = manager.getUserPresence('u1', 'doc1')!.lastHeartbeat;
      expect(after >= before).toBe(true);
    });

    it('restores Active status', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const entry = manager.getUserPresence('u1', 'doc1')!;
      entry.status = ActivityStatus.Idle;
      manager.heartbeat('u1', 'doc1');
      expect(entry.status).toBe(ActivityStatus.Active);
    });
  });

  describe('getPresence', () => {
    it('returns all present users for a document', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      manager.join({ userId: 'u2', documentId: 'doc1', sessionId: 's1', name: 'Bob' });
      manager.join({ userId: 'u3', documentId: 'doc2', sessionId: 's2', name: 'Carol' });
      const entries = manager.getPresence('doc1');
      expect(entries).toHaveLength(2);
      expect(entries.map(e => e.userId)).toContain('u1');
      expect(entries.map(e => e.userId)).toContain('u2');
    });

    it('returns empty array for unknown document', () => {
      expect(manager.getPresence('nope')).toHaveLength(0);
    });
  });

  describe('checkStalePresence', () => {
    it('marks users as Idle after idle threshold', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const entry = manager.getUserPresence('u1', 'doc1')!;
      entry.lastHeartbeat = new Date(Date.now() - 10_000);
      const result = manager.checkStalePresence();
      expect(result.idled).toContain('u1');
      expect(entry.status).toBe(ActivityStatus.Idle);
    });

    it('marks users as Away after away threshold', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const entry = manager.getUserPresence('u1', 'doc1')!;
      entry.lastHeartbeat = new Date(Date.now() - 20_000);
      const result = manager.checkStalePresence();
      expect(result.awayUsers).toContain('u1');
      expect(entry.status).toBe(ActivityStatus.Away);
    });
  });

  describe('broadcastPresence', () => {
    it('returns snapshot with all entries and timestamp', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const broadcast = manager.broadcastPresence('doc1');
      expect(broadcast.documentId).toBe('doc1');
      expect(broadcast.entries).toHaveLength(1);
      expect(broadcast.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('getHistoryAtTime', () => {
    it('returns users who were present at a given time', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const t1 = new Date();
      manager.leave('u1', 'doc1');
      const users = manager.getHistoryAtTime('doc1', t1);
      expect(users).toContain('u1');
    });
  });

  describe('getUserColor', () => {
    it('returns consistent color for user', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      const color1 = manager.getUserColor('u1');
      const color2 = manager.getUserColor('u1');
      expect(color1).toBe(color2);
    });

    it('returns undefined for unknown user', () => {
      expect(manager.getUserColor('nope')).toBeUndefined();
    });
  });

  describe('isPresent', () => {
    it('returns true when user is present', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      expect(manager.isPresent('u1', 'doc1')).toBe(true);
    });

    it('returns false when user is not present', () => {
      expect(manager.isPresent('u1', 'doc1')).toBe(false);
    });

    it('returns false after leave', () => {
      manager.join({ userId: 'u1', documentId: 'doc1', sessionId: 's1', name: 'Alice' });
      manager.leave('u1', 'doc1');
      expect(manager.isPresent('u1', 'doc1')).toBe(false);
    });
  });
});
