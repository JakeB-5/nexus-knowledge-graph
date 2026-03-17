// Positive-Negative Counter (PN-Counter) CRDT
// Supports both increment and decrement by composing two G-Counters.
// Value = sum(increments) - sum(decrements)

import type { NodeId, PNCounterState, GCounterState } from "./types.js";
import { GCounter, gcMerge, gcValue, gcIncrement } from "./g-counter.js";

export class PNCounter {
  private readonly nodeId: NodeId;
  private positive: GCounter;
  private negative: GCounter;

  constructor(nodeId: NodeId, initial?: PNCounterState) {
    this.nodeId = nodeId;
    if (initial) {
      this.positive = GCounter.fromState(nodeId, initial.increments);
      this.negative = GCounter.fromState(nodeId, initial.decrements);
    } else {
      this.positive = new GCounter(nodeId);
      this.negative = new GCounter(nodeId);
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Increment the counter by `amount` (default 1).
   */
  increment(amount = 1): void {
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new RangeError(`PNCounter increment amount must be a positive integer, got ${amount}`);
    }
    this.positive.increment(amount);
  }

  /**
   * Decrement the counter by `amount` (default 1).
   */
  decrement(amount = 1): void {
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new RangeError(`PNCounter decrement amount must be a positive integer, got ${amount}`);
    }
    this.negative.increment(amount);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Current value: sum(increments) - sum(decrements).
   */
  value(): number {
    return this.positive.value() - this.negative.value();
  }

  /**
   * Total increments across all nodes.
   */
  totalIncrements(): number {
    return this.positive.value();
  }

  /**
   * Total decrements across all nodes.
   */
  totalDecrements(): number {
    return this.negative.value();
  }

  // ── CRDT operations ───────────────────────────────────────────────────────

  /**
   * Merge a remote PNCounter into this one.
   * Merges both the positive and negative G-Counters independently.
   */
  merge(remote: PNCounter): void {
    this.mergeState(remote.getState());
  }

  mergeState(remote: PNCounterState): void {
    this.positive.mergeState(remote.increments);
    this.negative.mergeState(remote.decrements);
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getState(): PNCounterState {
    return {
      increments: this.positive.getState(),
      decrements: this.negative.getState(),
    };
  }

  static fromState(nodeId: NodeId, state: PNCounterState): PNCounter {
    return new PNCounter(nodeId, state);
  }

  clone(): PNCounter {
    const state = this.getState();
    return new PNCounter(this.nodeId, {
      increments: { counters: { ...state.increments.counters } },
      decrements: { counters: { ...state.decrements.counters } },
    });
  }

  toJSON(): object {
    return {
      nodeId: this.nodeId,
      value: this.value(),
      state: this.getState(),
    };
  }
}

// ── Pure functional helpers ────────────────────────────────────────────────

export function pnMerge(a: PNCounterState, b: PNCounterState): PNCounterState {
  return {
    increments: gcMerge(a.increments, b.increments),
    decrements: gcMerge(a.decrements, b.decrements),
  };
}

export function pnValue(state: PNCounterState): number {
  return gcValue(state.increments) - gcValue(state.decrements);
}

export function pnIncrement(
  state: PNCounterState,
  nodeId: NodeId,
  amount = 1
): PNCounterState {
  return {
    increments: gcIncrement(state.increments, nodeId, amount),
    decrements: state.decrements,
  };
}

export function pnDecrement(
  state: PNCounterState,
  nodeId: NodeId,
  amount = 1
): PNCounterState {
  return {
    increments: state.increments,
    decrements: gcIncrement(state.decrements, nodeId, amount),
  };
}

export function emptyPNCounterState(): PNCounterState {
  return {
    increments: { counters: {} },
    decrements: { counters: {} },
  };
}

// ── Delta-state helpers ────────────────────────────────────────────────────

/**
 * Compute the delta between two G-Counter states (entries that changed).
 */
function gcDelta(base: GCounterState, current: GCounterState): GCounterState {
  const delta: Record<NodeId, number> = {};
  for (const [nodeId, count] of Object.entries(current.counters)) {
    const baseCount = base.counters[nodeId] ?? 0;
    if (count > baseCount) {
      delta[nodeId] = count;
    }
  }
  return { counters: delta };
}

/**
 * Compute the delta between two PN-Counter states.
 */
export function pnDelta(
  base: PNCounterState,
  current: PNCounterState
): PNCounterState {
  return {
    increments: gcDelta(base.increments, current.increments),
    decrements: gcDelta(base.decrements, current.decrements),
  };
}
