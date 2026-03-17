// Last-Writer-Wins Map (LWW-Map) CRDT
//
// A key-value store where each key is backed by a LWWRegister.
// Setting a key advances the clock; merging takes the winner per key.
// Deletion is modelled as setting the value to a tombstone sentinel,
// so deleted keys still track their timestamp for correct merge ordering.

import type { NodeId, LWWMapState, LWWRegisterState, HLCTimestamp } from "./types.js";
import { LWWRegister, lwwMerge } from "./lww-register.js";
import { createHLC, tickHLC, updateHLC } from "./clock.js";

const TOMBSTONE = Symbol("lww-tombstone");
type MaybeValue<T> = T | typeof TOMBSTONE;

export class LWWMap<T = unknown> {
  private registers: Map<string, LWWRegister<MaybeValue<T>>>;
  private hlc: HLCTimestamp;

  constructor(nodeId: NodeId, initial?: LWWMapState<T>) {
    this.hlc = createHLC(nodeId);
    this.registers = new Map();

    if (initial) {
      for (const [key, regState] of Object.entries(initial.registers)) {
        const reg = LWWRegister.fromState<MaybeValue<T>>(nodeId, regState as LWWRegisterState<MaybeValue<T>>);
        this.registers.set(key, reg);
        if (regState.timestamp) {
          this.hlc = updateHLC(this.hlc, regState.timestamp);
        }
      }
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Set a key to a value. Returns the HLC timestamp used.
   */
  set(key: string, value: T, now?: number): HLCTimestamp {
    this.hlc = tickHLC(this.hlc, now);
    const ts = this.hlc;

    let reg = this.registers.get(key);
    if (!reg) {
      reg = new LWWRegister<MaybeValue<T>>(this.hlc.nodeId);
      this.registers.set(key, reg);
    }
    reg.setWithTimestamp(value, ts);
    return ts;
  }

  /**
   * Delete a key by writing a tombstone with the current HLC.
   */
  delete(key: string, now?: number): HLCTimestamp {
    this.hlc = tickHLC(this.hlc, now);
    const ts = this.hlc;

    let reg = this.registers.get(key);
    if (!reg) {
      reg = new LWWRegister<MaybeValue<T>>(this.hlc.nodeId);
      this.registers.set(key, reg);
    }
    reg.setWithTimestamp(TOMBSTONE as MaybeValue<T>, ts);
    return ts;
  }

  /**
   * Set multiple key-value pairs atomically (same timestamp for all).
   */
  setMany(entries: Record<string, T>, now?: number): HLCTimestamp {
    this.hlc = tickHLC(this.hlc, now);
    const ts = this.hlc;

    for (const [key, value] of Object.entries(entries)) {
      let reg = this.registers.get(key);
      if (!reg) {
        reg = new LWWRegister<MaybeValue<T>>(this.hlc.nodeId);
        this.registers.set(key, reg);
      }
      reg.setWithTimestamp(value, ts);
    }
    return ts;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Get the value for a key (undefined if not present or deleted).
   */
  get(key: string): T | undefined {
    const reg = this.registers.get(key);
    if (!reg) return undefined;
    const val = reg.get();
    if (val === TOMBSTONE || val === undefined) return undefined;
    return val as T;
  }

  /**
   * True if key is present and not deleted.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * All non-deleted keys.
   */
  keys(): string[] {
    const result: string[] = [];
    for (const [key, reg] of this.registers) {
      const val = reg.get();
      if (val !== undefined && val !== TOMBSTONE) {
        result.push(key);
      }
    }
    return result;
  }

  /**
   * All non-deleted entries as [key, value] pairs.
   */
  entries(): Array<[string, T]> {
    const result: Array<[string, T]> = [];
    for (const [key, reg] of this.registers) {
      const val = reg.get();
      if (val !== undefined && val !== TOMBSTONE) {
        result.push([key, val as T]);
      }
    }
    return result;
  }

  /**
   * Number of live (non-deleted) keys.
   */
  size(): number {
    return this.keys().length;
  }

  /**
   * Return a plain object of all live key-value pairs.
   */
  toObject(): Record<string, T> {
    const obj: Record<string, T> = {};
    for (const [key, value] of this.entries()) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * The timestamp of the last write for a key (undefined if never written).
   */
  timestampFor(key: string): HLCTimestamp | undefined {
    return this.registers.get(key)?.timestamp();
  }

  // ── CRDT operations ───────────────────────────────────────────────────────

  /**
   * Merge a remote LWWMap. Per-key LWW wins.
   */
  merge(remote: LWWMap<T>): void {
    this.mergeState(remote.getState());
  }

  mergeState(remote: LWWMapState<T>): void {
    for (const [key, remoteRegState] of Object.entries(remote.registers)) {
      const remoteState = remoteRegState as LWWRegisterState<MaybeValue<T>>;

      let localReg = this.registers.get(key);
      if (!localReg) {
        localReg = new LWWRegister<MaybeValue<T>>(this.hlc.nodeId);
        this.registers.set(key, localReg);
      }
      localReg.mergeState(remoteState);

      // Keep our HLC up to date
      if (remoteState.timestamp) {
        this.hlc = updateHLC(this.hlc, remoteState.timestamp);
      }
    }
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getState(): LWWMapState<T> {
    const registers: Record<string, LWWRegisterState<T>> = {};
    for (const [key, reg] of this.registers) {
      registers[key] = reg.getState() as LWWRegisterState<T>;
    }
    return { registers };
  }

  static fromState<T>(nodeId: NodeId, state: LWWMapState<T>): LWWMap<T> {
    return new LWWMap<T>(nodeId, state);
  }

  clone(): LWWMap<T> {
    return LWWMap.fromState(this.hlc.nodeId, this.getState());
  }

  toJSON(): object {
    return { entries: this.toObject() };
  }
}

// ── Pure functional helpers ────────────────────────────────────────────────

export function lwwMapMerge<T>(
  a: LWWMapState<T>,
  b: LWWMapState<T>
): LWWMapState<T> {
  const registers: Record<string, LWWRegisterState<T>> = { ...a.registers };

  for (const [key, bState] of Object.entries(b.registers)) {
    const aState = registers[key];
    if (aState) {
      registers[key] = lwwMerge(aState, bState as LWWRegisterState<T>);
    } else {
      registers[key] = bState as LWWRegisterState<T>;
    }
  }

  return { registers };
}

export function lwwMapGet<T>(
  state: LWWMapState<T>,
  key: string
): T | undefined {
  const reg = state.registers[key];
  if (!reg) return undefined;
  const val = reg.value;
  // Filter tombstones — they serialise as a plain object with a special marker
  // Since TOMBSTONE is a Symbol it doesn't survive JSON; after deserialisation
  // deleted keys will have value === null or undefined. Callers that use the
  // class API won't need this helper for deletions.
  if (val === null || val === undefined) return undefined;
  return val;
}
