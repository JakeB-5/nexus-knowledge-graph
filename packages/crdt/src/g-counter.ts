// Grow-only Counter (G-Counter) CRDT
// A counter that can only be incremented. Each node maintains its own slot.
// Value = sum of all slots. Merge = pairwise maximum.

import type { NodeId, GCounterState } from "./types.js";

export class GCounter {
  private state: GCounterState;
  private readonly nodeId: NodeId;

  constructor(nodeId: NodeId, initial?: GCounterState) {
    this.nodeId = nodeId;
    this.state = initial ?? { counters: {} };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Increment this node's counter by `amount` (default 1).
   * Amount must be a positive integer.
   */
  increment(amount = 1): void {
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new RangeError(`GCounter increment amount must be a positive integer, got ${amount}`);
    }
    const current = this.state.counters[this.nodeId] ?? 0;
    this.state = {
      counters: { ...this.state.counters, [this.nodeId]: current + amount },
    };
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * The aggregate value: sum of all node counters.
   */
  value(): number {
    return Object.values(this.state.counters).reduce((sum, v) => sum + v, 0);
  }

  /**
   * The raw counter for a specific node.
   */
  counterFor(nodeId: NodeId): number {
    return this.state.counters[nodeId] ?? 0;
  }

  // ── CRDT operations ───────────────────────────────────────────────────────

  /**
   * Merge a remote G-Counter into this one (pairwise maximum).
   * This operation is commutative, associative, and idempotent.
   */
  merge(remote: GCounter): void {
    this.mergeState(remote.state);
  }

  mergeState(remote: GCounterState): void {
    const merged: Record<NodeId, number> = { ...this.state.counters };
    for (const [nodeId, count] of Object.entries(remote.counters)) {
      merged[nodeId] = Math.max(merged[nodeId] ?? 0, count);
    }
    this.state = { counters: merged };
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getState(): GCounterState {
    return this.state;
  }

  static fromState(nodeId: NodeId, state: GCounterState): GCounter {
    return new GCounter(nodeId, state);
  }

  clone(): GCounter {
    return GCounter.fromState(this.nodeId, {
      counters: { ...this.state.counters },
    });
  }

  toJSON(): object {
    return { nodeId: this.nodeId, state: this.state };
  }
}

// ── Pure functional helpers ────────────────────────────────────────────────

export function gcMerge(a: GCounterState, b: GCounterState): GCounterState {
  const merged: Record<NodeId, number> = { ...a.counters };
  for (const [nodeId, count] of Object.entries(b.counters)) {
    merged[nodeId] = Math.max(merged[nodeId] ?? 0, count);
  }
  return { counters: merged };
}

export function gcValue(state: GCounterState): number {
  return Object.values(state.counters).reduce((sum, v) => sum + v, 0);
}

export function gcIncrement(
  state: GCounterState,
  nodeId: NodeId,
  amount = 1
): GCounterState {
  const current = state.counters[nodeId] ?? 0;
  return { counters: { ...state.counters, [nodeId]: current + amount } };
}
