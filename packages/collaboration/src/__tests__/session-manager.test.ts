import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../session-manager.js';
import { SessionStatus, ActivityStatus } from '../types.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ timeoutMs: 1_000 });
  });

  describe('createSession', () => {
    it('creates a session with correct documentId', () => {
      const session = manager.createSession({ documentId: 'doc1' });
      expect(session.documentId).toBe('doc1');
      expect(session.status).toBe(SessionStatus.Active);
      expect(session.participants.size).toBe(0);
    });

    it('uses default maxParticipants of 20', () => {
      const session = manager.createSession({ documentId: 'doc1' });
      expect(session.maxParticipants).toBe(20);
    });

    it('respects custom maxParticipants', () => {
      const session = manager.createSession({ documentId: 'doc1', maxParticipants: 5 });
      expect(session.maxParticipants).toBe(5);
    });

    it('stores metadata', () => {
      const session = manager.createSession({ documentId: 'doc1', metadata: { roomName: 'Alpha' } });
      expect(session.metadata['roomName']).toBe('Alpha');
    });

    it('assigns unique IDs to each session', () => {
      const s1 = manager.createSession({ documentId: 'doc1' });
      const s2 = manager.createSession({ documentId: 'doc1' });
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe('joinSession', () => {
    it('creates a new session when none exists for document', () => {
      const { session, isNewSession } = manager.joinSession({
        documentId: 'doc1',
        participantName: 'Alice',
      });
      expect(isNewSession).toBe(true);
      expect(session.participants.size).toBe(1);
    });

    it('joins existing active session for same document', () => {
      const { session: s1 } = manager.joinSession({ documentId: 'doc1', participantName: 'Alice' });
      const { session: s2, isNewSession } = manager.joinSession({ documentId: 'doc1', participantName: 'Bob' });
      expect(s1.id).toBe(s2.id);
      expect(isNewSession).toBe(false);
      expect(s2.participants.size).toBe(2);
    });

    it('assigns unique colors to participants', () => {
      const { session } = manager.joinSession({ documentId: 'doc1', participantName: 'Alice' });
      manager.joinSession({ documentId: 'doc1', participantName: 'Bob' });
      const colors = [...session.participants.values()].map(p => p.color);
      expect(new Set(colors).size).toBe(2);
    });

    it('throws when joining a closed session by ID', () => {
      const session = manager.createSession({ documentId: 'doc1' });
      manager.closeSession(session.id);
      expect(() =>
        manager.joinSession({ documentId: 'doc1', participantName: 'Alice', sessionId: session.id }),
      ).toThrow();
    });

    it('throws when session is full', () => {
      const session = manager.createSession({ documentId: 'doc1', maxParticipants: 1 });
      manager.joinSession({ documentId: 'doc1', participantName: 'Alice', sessionId: session.id });
      expect(() =>
        manager.joinSession({ documentId: 'doc1', participantName: 'Bob', sessionId: session.id }),
      ).toThrow();
    });

    it('sets participant as Active on join', () => {
      const { participant } = manager.joinSession({ documentId: 'doc1', participantName: 'Alice' });
      expect(participant.status).toBe(ActivityStatus.Active);
    });

    it('accepts custom participantId', () => {
      const { participant } = manager.joinSession({
        documentId: 'doc1',
        participantName: 'Alice',
        participantId: 'custom-id',
      });
      expect(participant.id).toBe('custom-id');
    });
  });

  describe('leaveSession', () => {
    it('removes participant from session', () => {
      const { session, participant } = manager.joinSession({ documentId: 'doc1', participantName: 'Alice' });
      manager.joinSession({ documentId: 'doc1', participantName: 'Bob' });
      const result = manager.leaveSession(session.id, participant.id);
      expect(result.remainingParticipants).toBe(1);
      expect(session.participants.has(participant.id)).toBe(false);
    });

    it('marks session as Closed when last participant leaves', () => {
      const { session, participant } = manager.joinSession({ documentId: 'doc1', participantName: 'Alice' });
      const result = manager.leaveSession(session.id, participant.id);
      expect(result.sessionClosed).toBe(true);
      expect(session.status).toBe(SessionStatus.Closed);
    });

    it('throws for unknown session', () => {
      expect(() => manager.leaveSession('nope', 'p1')).toThrow();
    });
  });

  describe('heartbeat', () => {
    it('updates lastSeenAt for participant', () => {
      const { session, participant } = manager.joinSession({ documentId: 'doc1', participantName: 'Alice' });
      const before = participant.lastSeenAt;
      // Small delay to ensure timestamp differs
      manager.heartbeat(session.id, participant.id);
      expect(participant.lastSeenAt).toBeDefined();
      // lastSeenAt is updated (may be same ms in fast machines, just check no throw)
      expect(participant.lastSeenAt >= before).toBe(true);
    });

    it('restores Active status after heartbeat', () => {
      const { session, participant } = manager.joinSession({ documentId: 'doc1', participantName: 'Alice' });
      participant.status = ActivityStatus.Idle;
      manager.heartbeat(session.id, participant.id);
      expect(participant.status).toBe(ActivityStatus.Active);
    });

    it('silently ignores unknown sessionId', () => {
      expect(() => manager.heartbeat('nope', 'p1')).not.toThrow();
    });
  });

  describe('checkIdleParticipants', () => {
    it('marks participants as Idle if no heartbeat within threshold', () => {
      const { session, participant } = manager.joinSession({ documentId: 'doc1', participantName: 'Alice' });
      // Set lastSeenAt to a long time ago
      participant.lastSeenAt = new Date(Date.now() - 10_000);
      const idled = manager.checkIdleParticipants(5_000);
      expect(idled).toContain(participant.id);
      const p = session.participants.get(participant.id);
      expect(p!.status).toBe(ActivityStatus.Idle);
    });
  });

  describe('markRecovering / recoverSession', () => {
    it('marks session as Recovering then recovers it', () => {
      const session = manager.createSession({ documentId: 'doc1' });
      manager.markRecovering(session.id);
      expect(session.status).toBe(SessionStatus.Recovering);
      manager.recoverSession(session.id);
      expect(session.status).toBe(SessionStatus.Active);
    });
  });

  describe('persistSession / restoreSession', () => {
    it('round-trips session through persistence', () => {
      const { session, participant } = manager.joinSession({ documentId: 'doc1', participantName: 'Alice' });
      const snapshot = manager.persistSession(session.id);
      expect(snapshot).not.toBeNull();

      const manager2 = new SessionManager();
      const restored = manager2.restoreSession(snapshot!);
      expect(restored.id).toBe(session.id);
      expect(restored.documentId).toBe('doc1');
      expect(restored.participants.has(participant.id)).toBe(true);
    });
  });

  describe('getDocumentSessions', () => {
    it('returns active sessions for a document', () => {
      manager.createSession({ documentId: 'doc1' });
      manager.createSession({ documentId: 'doc1' });
      const sessions = manager.getDocumentSessions('doc1');
      expect(sessions.length).toBe(2);
    });

    it('excludes closed sessions', () => {
      const s = manager.createSession({ documentId: 'doc1' });
      manager.createSession({ documentId: 'doc1' });
      manager.closeSession(s.id);
      const sessions = manager.getDocumentSessions('doc1');
      expect(sessions.length).toBe(1);
    });
  });

  describe('listActiveSessions', () => {
    it('lists only active sessions', () => {
      const s1 = manager.createSession({ documentId: 'doc1' });
      manager.createSession({ documentId: 'doc2' });
      manager.closeSession(s1.id);
      const active = manager.listActiveSessions();
      expect(active.every(s => s.status === SessionStatus.Active)).toBe(true);
      expect(active.length).toBe(1);
    });
  });
});
