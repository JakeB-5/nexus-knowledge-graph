// SessionManager: create, join, leave, and recover collaboration sessions

import type { CollaborationSession, Participant } from './types.js';
import { SessionStatus, ActivityStatus } from './types.js';

const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
];

function generateId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateParticipantId(): string {
  return `part_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function assignColor(index: number): string {
  return COLORS[index % COLORS.length]!;
}

export interface SessionOptions {
  documentId: string;
  maxParticipants?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface JoinResult {
  session: CollaborationSession;
  participant: Participant;
  isNewSession: boolean;
}

export interface LeaveResult {
  sessionId: string;
  participantId: string;
  remainingParticipants: number;
  sessionClosed: boolean;
}

export class SessionManager {
  private sessions: Map<string, CollaborationSession> = new Map();
  // documentId -> Set of sessionIds
  private documentSessions: Map<string, Set<string>> = new Map();
  private timeoutMs: number;
  private sessionTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  // Create a new collaboration session for a document
  createSession(options: SessionOptions): CollaborationSession {
    const id = generateId();
    const session: CollaborationSession = {
      id,
      documentId: options.documentId,
      participants: new Map(),
      status: SessionStatus.Active,
      createdAt: new Date(),
      updatedAt: new Date(),
      maxParticipants: options.maxParticipants ?? 20,
      metadata: options.metadata ?? {},
    };

    this.sessions.set(id, session);
    this.trackDocumentSession(options.documentId, id);
    return session;
  }

  // Join an existing session or create one if none exists for the document
  joinSession(params: {
    sessionId?: string;
    documentId: string;
    participantName: string;
    participantId?: string;
    metadata?: Record<string, unknown>;
  }): JoinResult {
    let session: CollaborationSession;
    let isNewSession = false;

    if (params.sessionId) {
      const existing = this.sessions.get(params.sessionId);
      if (!existing) throw new Error(`Session '${params.sessionId}' not found`);
      if (existing.status === SessionStatus.Closed) {
        throw new Error(`Session '${params.sessionId}' is closed`);
      }
      session = existing;
    } else {
      // Find active session for document or create new
      const docSessions = this.documentSessions.get(params.documentId);
      let found: CollaborationSession | undefined;
      if (docSessions) {
        for (const sid of docSessions) {
          const s = this.sessions.get(sid);
          if (s && s.status === SessionStatus.Active) {
            found = s;
            break;
          }
        }
      }
      if (found) {
        session = found;
      } else {
        session = this.createSession({ documentId: params.documentId });
        isNewSession = true;
      }
    }

    // Enforce max participants
    if (session.participants.size >= session.maxParticipants) {
      throw new Error(
        `Session '${session.id}' is full (max ${session.maxParticipants} participants)`,
      );
    }

    const participantIndex = session.participants.size;
    const participant: Participant = {
      id: params.participantId ?? generateParticipantId(),
      name: params.participantName,
      color: assignColor(participantIndex),
      joinedAt: new Date(),
      lastSeenAt: new Date(),
      status: ActivityStatus.Active,
      cursor: null,
      selection: null,
      metadata: params.metadata ?? {},
    };

    session.participants.set(participant.id, participant);
    session.updatedAt = new Date();

    return { session, participant, isNewSession };
  }

  // Leave a session
  leaveSession(sessionId: string, participantId: string): LeaveResult {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found`);

    session.participants.delete(participantId);
    session.updatedAt = new Date();

    const remainingParticipants = session.participants.size;
    let sessionClosed = false;

    if (remainingParticipants === 0) {
      session.status = SessionStatus.Closed;
      sessionClosed = true;
      this.scheduleSessionCleanup(sessionId);
    }

    return { sessionId, participantId, remainingParticipants, sessionClosed };
  }

  // Get a session by ID
  getSession(sessionId: string): CollaborationSession | undefined {
    return this.sessions.get(sessionId);
  }

  // Get all active sessions for a document
  getDocumentSessions(documentId: string): CollaborationSession[] {
    const sessionIds = this.documentSessions.get(documentId);
    if (!sessionIds) return [];
    return [...sessionIds]
      .map(id => this.sessions.get(id))
      .filter((s): s is CollaborationSession => s !== undefined && s.status !== SessionStatus.Closed);
  }

  // List all active sessions
  listActiveSessions(): CollaborationSession[] {
    return [...this.sessions.values()].filter(s => s.status === SessionStatus.Active);
  }

  // Update participant heartbeat
  heartbeat(sessionId: string, participantId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const participant = session.participants.get(participantId);
    if (!participant) return;
    participant.lastSeenAt = new Date();
    participant.status = ActivityStatus.Active;
    session.updatedAt = new Date();
  }

  // Mark participant as idle if no heartbeat within threshold
  checkIdleParticipants(idleThresholdMs = 5_000): string[] {
    const idled: string[] = [];
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.status !== SessionStatus.Active) continue;
      for (const participant of session.participants.values()) {
        const elapsed = now - participant.lastSeenAt.getTime();
        if (elapsed > idleThresholdMs && participant.status === ActivityStatus.Active) {
          participant.status = ActivityStatus.Idle;
          idled.push(participant.id);
        }
      }
    }
    return idled;
  }

  // Mark a session as recovering after a disconnect event
  markRecovering(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.status = SessionStatus.Recovering;
    session.updatedAt = new Date();
  }

  // Restore a recovering session to active
  recoverSession(sessionId: string): CollaborationSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found`);
    session.status = SessionStatus.Active;
    session.updatedAt = new Date();
    return session;
  }

  // Persist session snapshot (returns JSON-serializable object)
  persistSession(sessionId: string): Record<string, unknown> | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      id: session.id,
      documentId: session.documentId,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      maxParticipants: session.maxParticipants,
      participants: [...session.participants.entries()].map(([id, p]) => ({
        id,
        name: p.name,
        color: p.color,
        joinedAt: p.joinedAt.toISOString(),
        lastSeenAt: p.lastSeenAt.toISOString(),
        status: p.status,
        cursor: p.cursor,
        selection: p.selection,
        metadata: p.metadata,
      })),
      metadata: session.metadata,
    };
  }

  // Restore session from persisted snapshot
  restoreSession(snapshot: Record<string, unknown>): CollaborationSession {
    const participants = new Map<string, Participant>();
    const parts = snapshot['participants'] as Array<{
      id: string;
      name: string;
      color: string;
      joinedAt: string;
      lastSeenAt: string;
      status: ActivityStatus;
      cursor: Participant['cursor'];
      selection: Participant['selection'];
      metadata: Record<string, unknown>;
    }>;
    for (const p of parts) {
      participants.set(p.id, {
        ...p,
        joinedAt: new Date(p.joinedAt),
        lastSeenAt: new Date(p.lastSeenAt),
      });
    }

    const session: CollaborationSession = {
      id: snapshot['id'] as string,
      documentId: snapshot['documentId'] as string,
      participants,
      status: snapshot['status'] as SessionStatus,
      createdAt: new Date(snapshot['createdAt'] as string),
      updatedAt: new Date(snapshot['updatedAt'] as string),
      maxParticipants: snapshot['maxParticipants'] as number,
      metadata: (snapshot['metadata'] as Record<string, unknown>) ?? {},
    };

    this.sessions.set(session.id, session);
    this.trackDocumentSession(session.documentId, session.id);
    return session;
  }

  // Close and remove a session
  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.status = SessionStatus.Closed;
    session.updatedAt = new Date();
    this.scheduleSessionCleanup(sessionId);
    return true;
  }

  // Get participant by ID across all sessions
  findParticipant(participantId: string): { session: CollaborationSession; participant: Participant } | undefined {
    for (const session of this.sessions.values()) {
      const participant = session.participants.get(participantId);
      if (participant) return { session, participant };
    }
    return undefined;
  }

  private trackDocumentSession(documentId: string, sessionId: string): void {
    let set = this.documentSessions.get(documentId);
    if (!set) {
      set = new Set();
      this.documentSessions.set(documentId, set);
    }
    set.add(sessionId);
  }

  private scheduleSessionCleanup(sessionId: string): void {
    const existing = this.sessionTimeouts.get(sessionId);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      this.sessions.delete(sessionId);
      this.sessionTimeouts.delete(sessionId);
    }, this.timeoutMs);
    this.sessionTimeouts.set(sessionId, handle);
  }
}
