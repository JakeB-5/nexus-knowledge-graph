// Core types for the collaboration system

export enum SessionStatus {
  Active = 'active',
  Idle = 'idle',
  Closed = 'closed',
  Recovering = 'recovering',
}

export enum ActivityStatus {
  Active = 'active',
  Idle = 'idle',
  Away = 'away',
  Offline = 'offline',
}

export interface CursorPosition {
  line: number;
  column: number;
  offset: number;
}

export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
  direction: 'forward' | 'backward' | 'none';
}

export interface Participant {
  id: string;
  name: string;
  color: string;
  joinedAt: Date;
  lastSeenAt: Date;
  status: ActivityStatus;
  cursor: CursorPosition | null;
  selection: SelectionRange | null;
  metadata: Record<string, unknown>;
}

export interface CollaborationSession {
  id: string;
  documentId: string;
  participants: Map<string, Participant>;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  maxParticipants: number;
  metadata: Record<string, unknown>;
}

export type InsertOperation = {
  type: 'insert';
  position: number;
  text: string;
  author: string;
  timestamp: number;
  id: string;
};

export type DeleteOperation = {
  type: 'delete';
  position: number;
  length: number;
  author: string;
  timestamp: number;
  id: string;
};

export type RetainOperation = {
  type: 'retain';
  length: number;
};

export type EditOperation = InsertOperation | DeleteOperation | RetainOperation;

export type ConflictResolution =
  | { strategy: 'auto-merge'; result: string }
  | { strategy: 'last-writer-wins'; winner: string; result: string }
  | { strategy: 'manual'; field: string; resolvedValue: unknown };

export interface AwarenessState {
  userId: string;
  sessionId: string;
  cursor: CursorPosition | null;
  selection: SelectionRange | null;
  scrollTop: number;
  name: string;
  color: string;
  customData: Record<string, unknown>;
  updatedAt: number;
}

export interface PresenceEntry {
  userId: string;
  documentId: string;
  sessionId: string;
  status: ActivityStatus;
  cursor: CursorPosition | null;
  selection: SelectionRange | null;
  color: string;
  name: string;
  lastHeartbeat: Date;
  joinedAt: Date;
}

export interface ConflictRecord {
  id: string;
  documentId: string;
  sessionId: string;
  field: string;
  ourValue: unknown;
  theirValue: unknown;
  resolvedAt: Date | null;
  resolution: ConflictResolution | null;
  createdAt: Date;
}
