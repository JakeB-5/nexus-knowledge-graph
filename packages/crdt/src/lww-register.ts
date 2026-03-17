// Last-Writer-Wins Register (LWW-Register) CRDT
//
// Stores a single value with an HLC timestamp.
// On merge, the value with the later timestamp wins.
// Tie-breaking: higher nodeId wins (deterministic total order).

import type { NodeId, LWWRegisterState, HLCTimestamp } from "./types.js";
import {
  createHLC,
  tickHLC,
  updateHLC,
  compareHLC,
  maxHLC,
} from "./clock.js";

export class LWWRegister<T> {
  private state: LWWRegisterState<T>;
  private hlc: HLCTimestamp;

  constructor(nodeId: NodeId, initial?: LWWRegisterState<T>) {
    this.hlc = createHLC(nodeId);
    this.state = initial ?? { value: undefined, timestamp: undefined };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Set the register value. Advances the local HLC.
   */
  set(value: T, now?: number): HLCTimestamp {
    this.hlc = tickHLC(this.hlc, now);
    this.state = { value, timestamp: this.hlc };
    return this.hlc;
  }

  /**
   * Set with an explicit timestamp (used when replaying remote operations).
   */
  setWithTimestamp(value: T, timestamp: HLCTimestamp): void {
    // Only apply if the incoming timestamp is later than current
    if (
      this.state.timestamp === undefined ||
      compareHLC(timestamp, this.state.timestamp) === "greater"
    ) {
      this.state = { value, timestamp };
      // Update local HLC to be aware of this timestamp
      this.hlc = updateHLC(this.hlc, timestamp);
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Current value (undefined if never written).
   */
  get(): T | undefined {
    return this.state.value;
  }

  /**
   * Current timestamp (undefined if never written).
   */
  timestamp(): HLCTimestamp | undefined {
    return this.state.timestamp;
  }

  /**
   * True if the register has been written at least once.
   */
  hasValue(): boolean {
    return this.state.value !== undefined;
  }

  // ── CRDT operations ───────────────────────────────────────────────────────

  /**
   * Merge a remote LWWRegister. Later timestamp wins; tie broken by nodeId.
   */
  merge(remote: LWWRegister<T>): void {
    this.mergeState(remote.state);
  }

  mergeState(remote: LWWRegisterState<T>): void {
    if (remote.timestamp === undefined) return;

    // Update our HLC to account for the remote timestamp
    this.hlc = updateHLC(this.hlc, remote.timestamp);

    if (this.state.timestamp === undefined) {
      // We have no value yet — take the remote
      this.state = { value: remote.value, timestamp: remote.timestamp };
      return;
    }

    const cmp = compareHLC(remote.timestamp, this.state.timestamp);
    if (cmp === "greater") {
      this.state = { value: remote.value, timestamp: remote.timestamp };
    }
    // "equal" means same wallTime, same logical, same nodeId → truly same write, no-op
    // "less" → local wins, no-op
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getState(): LWWRegisterState<T> {
    return this.state;
  }

  static fromState<T>(
    nodeId: NodeId,
    state: LWWRegisterState<T>
  ): LWWRegister<T> {
    const reg = new LWWRegister<T>(nodeId, state);
    if (state.timestamp) {
      reg.hlc = updateHLC(reg.hlc, state.timestamp);
    }
    return reg;
  }

  clone(): LWWRegister<T> {
    const nodeId = this.hlc.nodeId;
    return LWWRegister.fromState(nodeId, {
      value: this.state.value,
      timestamp: this.state.timestamp,
    });
  }

  toJSON(): object {
    return {
      value: this.state.value,
      timestamp: this.state.timestamp,
    };
  }
}

// ── Pure functional helpers ────────────────────────────────────────────────

export function lwwMerge<T>(
  a: LWWRegisterState<T>,
  b: LWWRegisterState<T>
): LWWRegisterState<T> {
  if (a.timestamp === undefined) return b;
  if (b.timestamp === undefined) return a;

  const winner = maxHLC(a.timestamp, b.timestamp);
  const cmp = compareHLC(winner, a.timestamp);
  return cmp === "equal" ? a : b;
}

export function lwwGet<T>(state: LWWRegisterState<T>): T | undefined {
  return state.value;
}
