// AwarenessProtocol: share arbitrary user state across collaborators

import type { CursorPosition, SelectionRange, AwarenessState } from './types.js';

export interface AwarenessUpdate {
  userId: string;
  sessionId: string;
  state: AwarenessState;
  timestamp: number;
}

export interface AwarenessSnapshot {
  sessionId: string;
  states: AwarenessState[];
  timestamp: number;
}

export type AwarenessChangeCallback = (
  updates: AwarenessUpdate[],
  removed: string[],
) => void;

export class AwarenessProtocol {
  // sessionId -> userId -> AwarenessState
  private states: Map<string, Map<string, AwarenessState>> = new Map();
  private listeners: Map<string, AwarenessChangeCallback> = new Map();
  // Debounce: userId -> pending timeout handle
  private debounceHandles: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private debounceMs: number;
  // Pending updates per session for batched broadcast
  private pendingUpdates: Map<string, AwarenessUpdate[]> = new Map();

  constructor(options: { debounceMs?: number } = {}) {
    this.debounceMs = options.debounceMs ?? 50;
  }

  // Set state for a user in a session
  setState(
    sessionId: string,
    userId: string,
    partialState: Partial<Omit<AwarenessState, 'userId' | 'sessionId' | 'updatedAt'>>,
  ): AwarenessState {
    const sessionStates = this.getOrCreateSessionMap(sessionId);
    const existing = sessionStates.get(userId);

    const state: AwarenessState = {
      userId,
      sessionId,
      cursor: partialState.cursor ?? existing?.cursor ?? null,
      selection: partialState.selection ?? existing?.selection ?? null,
      scrollTop: partialState.scrollTop ?? existing?.scrollTop ?? 0,
      name: partialState.name ?? existing?.name ?? userId,
      color: partialState.color ?? existing?.color ?? '#000000',
      customData: { ...(existing?.customData ?? {}), ...(partialState.customData ?? {}) },
      updatedAt: Date.now(),
    };

    sessionStates.set(userId, state);

    const update: AwarenessUpdate = { userId, sessionId, state, timestamp: state.updatedAt };
    this.queueUpdate(sessionId, update);
    this.scheduleBroadcast(sessionId);

    return state;
  }

  // Update cursor position (convenience)
  setCursor(sessionId: string, userId: string, cursor: CursorPosition): AwarenessState {
    return this.setState(sessionId, userId, { cursor });
  }

  // Update selection (convenience)
  setSelection(sessionId: string, userId: string, selection: SelectionRange): AwarenessState {
    return this.setState(sessionId, userId, { selection });
  }

  // Update scroll position (convenience)
  setScrollTop(sessionId: string, userId: string, scrollTop: number): AwarenessState {
    return this.setState(sessionId, userId, { scrollTop });
  }

  // Update arbitrary custom data
  setCustomData(sessionId: string, userId: string, data: Record<string, unknown>): AwarenessState {
    return this.setState(sessionId, userId, { customData: data });
  }

  // Get current state for a specific user
  getState(sessionId: string, userId: string): AwarenessState | undefined {
    return this.states.get(sessionId)?.get(userId);
  }

  // Get all states for a session
  getAllStates(sessionId: string): AwarenessState[] {
    const sessionStates = this.states.get(sessionId);
    if (!sessionStates) return [];
    return [...sessionStates.values()];
  }

  // Create a snapshot of current awareness state for a session
  getSnapshot(sessionId: string): AwarenessSnapshot {
    return {
      sessionId,
      states: this.getAllStates(sessionId),
      timestamp: Date.now(),
    };
  }

  // Remove a user from awareness (on disconnect)
  removeUser(sessionId: string, userId: string): boolean {
    const sessionStates = this.states.get(sessionId);
    if (!sessionStates) return false;
    const existed = sessionStates.delete(userId);
    if (existed) {
      this.cancelDebounce(userId);
      this.notifyListeners(sessionId, [], [userId]);
    }
    return existed;
  }

  // Clean up a whole session
  removeSession(sessionId: string): void {
    const sessionStates = this.states.get(sessionId);
    if (!sessionStates) return;
    const removedUsers = [...sessionStates.keys()];
    this.states.delete(sessionId);
    this.pendingUpdates.delete(sessionId);
    for (const userId of removedUsers) {
      this.cancelDebounce(userId);
    }
    if (removedUsers.length > 0) {
      this.notifyListeners(sessionId, [], removedUsers);
    }
  }

  // Subscribe to awareness changes for a session
  subscribe(listenerId: string, callback: AwarenessChangeCallback): void {
    this.listeners.set(listenerId, callback);
  }

  // Unsubscribe from awareness changes
  unsubscribe(listenerId: string): void {
    this.listeners.delete(listenerId);
  }

  // Apply a received awareness update from another client (for network sync)
  applyUpdate(update: AwarenessUpdate): void {
    const sessionStates = this.getOrCreateSessionMap(update.sessionId);
    const existing = sessionStates.get(update.userId);

    // Only apply if update is newer
    if (existing && existing.updatedAt >= update.timestamp) return;

    sessionStates.set(update.userId, update.state);
    this.notifyListeners(update.sessionId, [update], []);
  }

  // Encode awareness state for transport (compact JSON)
  encodeState(state: AwarenessState): Uint8Array {
    const json = JSON.stringify(state);
    return new TextEncoder().encode(json);
  }

  // Decode awareness state from transport bytes
  decodeState(bytes: Uint8Array): AwarenessState {
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as AwarenessState;
  }

  // Compress snapshot by only including changed fields vs previous
  encodeSnapshot(snapshot: AwarenessSnapshot): string {
    return JSON.stringify({
      sessionId: snapshot.sessionId,
      timestamp: snapshot.timestamp,
      states: snapshot.states,
    });
  }

  // Check if user is active in session
  isActive(sessionId: string, userId: string): boolean {
    return this.states.get(sessionId)?.has(userId) ?? false;
  }

  // Get count of users in session
  getUserCount(sessionId: string): number {
    return this.states.get(sessionId)?.size ?? 0;
  }

  private getOrCreateSessionMap(sessionId: string): Map<string, AwarenessState> {
    let map = this.states.get(sessionId);
    if (!map) {
      map = new Map();
      this.states.set(sessionId, map);
    }
    return map;
  }

  private queueUpdate(sessionId: string, update: AwarenessUpdate): void {
    let pending = this.pendingUpdates.get(sessionId);
    if (!pending) {
      pending = [];
      this.pendingUpdates.set(sessionId, pending);
    }
    // Replace any previous pending update for this user
    const idx = pending.findIndex(u => u.userId === update.userId);
    if (idx !== -1) {
      pending[idx] = update;
    } else {
      pending.push(update);
    }
  }

  private scheduleBroadcast(sessionId: string): void {
    const key = `session_${sessionId}`;
    this.cancelDebounce(key);
    const handle = setTimeout(() => {
      this.flushUpdates(sessionId);
      this.debounceHandles.delete(key);
    }, this.debounceMs);
    this.debounceHandles.set(key, handle);
  }

  private flushUpdates(sessionId: string): void {
    const pending = this.pendingUpdates.get(sessionId);
    if (!pending || pending.length === 0) return;
    this.pendingUpdates.set(sessionId, []);
    this.notifyListeners(sessionId, pending, []);
  }

  private notifyListeners(
    sessionId: string,
    updates: AwarenessUpdate[],
    removed: string[],
  ): void {
    for (const cb of this.listeners.values()) {
      cb(updates, removed);
    }
    void sessionId; // used for future scoped listeners
  }

  private cancelDebounce(key: string): void {
    const handle = this.debounceHandles.get(key);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.debounceHandles.delete(key);
    }
  }
}
