import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AwarenessProtocol } from '../awareness.js';
import type { AwarenessUpdate } from '../awareness.js';

describe('AwarenessProtocol', () => {
  let awareness: AwarenessProtocol;

  beforeEach(() => {
    awareness = new AwarenessProtocol({ debounceMs: 0 });
  });

  describe('setState', () => {
    it('creates a new state entry for user', () => {
      const state = awareness.setState('sess1', 'u1', { name: 'Alice', color: '#ff0000' });
      expect(state.userId).toBe('u1');
      expect(state.sessionId).toBe('sess1');
      expect(state.name).toBe('Alice');
      expect(state.color).toBe('#ff0000');
    });

    it('merges partial updates with existing state', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice', scrollTop: 100 });
      const updated = awareness.setState('sess1', 'u1', { scrollTop: 200 });
      expect(updated.name).toBe('Alice');
      expect(updated.scrollTop).toBe(200);
    });

    it('merges customData deeply', () => {
      awareness.setState('sess1', 'u1', { customData: { a: 1 } });
      const updated = awareness.setState('sess1', 'u1', { customData: { b: 2 } });
      expect(updated.customData['a']).toBe(1);
      expect(updated.customData['b']).toBe(2);
    });

    it('updates the updatedAt timestamp', () => {
      const before = Date.now();
      const state = awareness.setState('sess1', 'u1', { name: 'Alice' });
      expect(state.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('setCursor', () => {
    it('sets cursor position', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      const state = awareness.setCursor('sess1', 'u1', { line: 3, column: 5, offset: 42 });
      expect(state.cursor).toEqual({ line: 3, column: 5, offset: 42 });
    });

    it('preserves other state fields', () => {
      awareness.setState('sess1', 'u1', { name: 'Bob', scrollTop: 50 });
      const state = awareness.setCursor('sess1', 'u1', { line: 1, column: 0, offset: 0 });
      expect(state.name).toBe('Bob');
      expect(state.scrollTop).toBe(50);
    });
  });

  describe('setSelection', () => {
    it('sets selection range', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      const selection = {
        start: { line: 1, column: 0, offset: 0 },
        end: { line: 2, column: 5, offset: 15 },
        direction: 'forward' as const,
      };
      const state = awareness.setSelection('sess1', 'u1', selection);
      expect(state.selection).toEqual(selection);
    });
  });

  describe('setScrollTop', () => {
    it('sets scroll position', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      const state = awareness.setScrollTop('sess1', 'u1', 350);
      expect(state.scrollTop).toBe(350);
    });
  });

  describe('setCustomData', () => {
    it('sets custom data', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      const state = awareness.setCustomData('sess1', 'u1', { theme: 'dark', zoom: 1.5 });
      expect(state.customData['theme']).toBe('dark');
      expect(state.customData['zoom']).toBe(1.5);
    });
  });

  describe('getState', () => {
    it('returns state for existing user', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      expect(awareness.getState('sess1', 'u1')).toBeDefined();
    });

    it('returns undefined for unknown user', () => {
      expect(awareness.getState('sess1', 'nope')).toBeUndefined();
    });
  });

  describe('getAllStates', () => {
    it('returns all states for a session', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      awareness.setState('sess1', 'u2', { name: 'Bob' });
      awareness.setState('sess2', 'u3', { name: 'Carol' });
      const states = awareness.getAllStates('sess1');
      expect(states).toHaveLength(2);
      expect(states.map(s => s.userId)).toContain('u1');
      expect(states.map(s => s.userId)).toContain('u2');
    });

    it('returns empty array for unknown session', () => {
      expect(awareness.getAllStates('nope')).toHaveLength(0);
    });
  });

  describe('getSnapshot', () => {
    it('returns snapshot with all session states', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      const snapshot = awareness.getSnapshot('sess1');
      expect(snapshot.sessionId).toBe('sess1');
      expect(snapshot.states).toHaveLength(1);
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });
  });

  describe('removeUser', () => {
    it('removes user from session', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      expect(awareness.removeUser('sess1', 'u1')).toBe(true);
      expect(awareness.isActive('sess1', 'u1')).toBe(false);
    });

    it('returns false for nonexistent user', () => {
      expect(awareness.removeUser('sess1', 'nope')).toBe(false);
    });

    it('notifies listeners on removal', () => {
      const removed: string[] = [];
      awareness.subscribe('listener1', (_, r) => removed.push(...r));
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      awareness.removeUser('sess1', 'u1');
      expect(removed).toContain('u1');
    });
  });

  describe('removeSession', () => {
    it('clears all users from session', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      awareness.setState('sess1', 'u2', { name: 'Bob' });
      awareness.removeSession('sess1');
      expect(awareness.getUserCount('sess1')).toBe(0);
    });

    it('notifies listeners with removed user IDs', () => {
      const removed: string[] = [];
      awareness.subscribe('l1', (_, r) => removed.push(...r));
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      awareness.setState('sess1', 'u2', { name: 'Bob' });
      awareness.removeSession('sess1');
      expect(removed).toContain('u1');
      expect(removed).toContain('u2');
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('notifies subscriber on state change', () => {
      const updates: AwarenessUpdate[] = [];
      awareness.subscribe('l1', (upds) => updates.push(...upds));
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      // With debounceMs: 0, should fire synchronously or very soon
      // Wait for microtask
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(updates.length).toBeGreaterThan(0);
          resolve();
        }, 10);
      });
    });

    it('does not notify after unsubscribe', () => {
      const updates: AwarenessUpdate[] = [];
      awareness.subscribe('l1', (upds) => updates.push(...upds));
      awareness.unsubscribe('l1');
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(updates).toHaveLength(0);
          resolve();
        }, 10);
      });
    });
  });

  describe('applyUpdate', () => {
    it('applies newer update from another client', () => {
      const state = awareness.setState('sess1', 'u1', { name: 'Alice' });
      const update: AwarenessUpdate = {
        userId: 'u1',
        sessionId: 'sess1',
        state: { ...state, name: 'Alice Updated', updatedAt: Date.now() + 1000 },
        timestamp: Date.now() + 1000,
      };
      awareness.applyUpdate(update);
      const current = awareness.getState('sess1', 'u1');
      expect(current!.name).toBe('Alice Updated');
    });

    it('ignores older updates', () => {
      const state = awareness.setState('sess1', 'u1', { name: 'Current' });
      const oldUpdate: AwarenessUpdate = {
        userId: 'u1',
        sessionId: 'sess1',
        state: { ...state, name: 'Old', updatedAt: state.updatedAt - 1000 },
        timestamp: state.updatedAt - 1000,
      };
      awareness.applyUpdate(oldUpdate);
      expect(awareness.getState('sess1', 'u1')!.name).toBe('Current');
    });
  });

  describe('encodeState / decodeState', () => {
    it('round-trips through encode and decode', () => {
      const state = awareness.setState('sess1', 'u1', { name: 'Alice', scrollTop: 42 });
      const encoded = awareness.encodeState(state);
      const decoded = awareness.decodeState(encoded);
      expect(decoded.userId).toBe('u1');
      expect(decoded.name).toBe('Alice');
      expect(decoded.scrollTop).toBe(42);
    });
  });

  describe('isActive', () => {
    it('returns true for active user', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      expect(awareness.isActive('sess1', 'u1')).toBe(true);
    });

    it('returns false for unknown user', () => {
      expect(awareness.isActive('sess1', 'nope')).toBe(false);
    });
  });

  describe('getUserCount', () => {
    it('returns correct user count', () => {
      awareness.setState('sess1', 'u1', { name: 'Alice' });
      awareness.setState('sess1', 'u2', { name: 'Bob' });
      expect(awareness.getUserCount('sess1')).toBe(2);
    });

    it('returns 0 for empty session', () => {
      expect(awareness.getUserCount('sess1')).toBe(0);
    });
  });
});
