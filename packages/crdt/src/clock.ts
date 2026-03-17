// Clock implementations: Lamport, Vector, and Hybrid Logical Clock (HLC)

import type {
  NodeId,
  LamportTimestamp,
  VectorClock,
  HLCTimestamp,
  ClockComparison,
} from "./types.js";

// ── Lamport Timestamp ──────────────────────────────────────────────────────

export function createLamport(nodeId: NodeId, counter = 0): LamportTimestamp {
  return { counter, nodeId };
}

/**
 * Increment the local Lamport clock by 1.
 */
export function tickLamport(clock: LamportTimestamp): LamportTimestamp {
  return { counter: clock.counter + 1, nodeId: clock.nodeId };
}

/**
 * Update the local clock after receiving a remote clock (take max + 1).
 */
export function updateLamport(
  local: LamportTimestamp,
  remote: LamportTimestamp
): LamportTimestamp {
  return {
    counter: Math.max(local.counter, remote.counter) + 1,
    nodeId: local.nodeId,
  };
}

/**
 * Total order comparison for Lamport timestamps.
 * Ties broken by nodeId lexicographic order.
 */
export function compareLamport(
  a: LamportTimestamp,
  b: LamportTimestamp
): ClockComparison {
  if (a.counter < b.counter) return "less";
  if (a.counter > b.counter) return "greater";
  if (a.nodeId < b.nodeId) return "less";
  if (a.nodeId > b.nodeId) return "greater";
  return "equal";
}

export function lamportToString(ts: LamportTimestamp): string {
  return `${ts.counter}@${ts.nodeId}`;
}

// ── Vector Clock ───────────────────────────────────────────────────────────

export function createVectorClock(nodeId: NodeId): VectorClock {
  return { clocks: { [nodeId]: 0 } };
}

/**
 * Increment the entry for nodeId.
 */
export function tickVector(clock: VectorClock, nodeId: NodeId): VectorClock {
  const current = clock.clocks[nodeId] ?? 0;
  return {
    clocks: { ...clock.clocks, [nodeId]: current + 1 },
  };
}

/**
 * Merge two vector clocks by taking the pairwise maximum.
 */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const merged: Record<NodeId, number> = { ...a.clocks };
  for (const [node, counter] of Object.entries(b.clocks)) {
    merged[node] = Math.max(merged[node] ?? 0, counter);
  }
  return { clocks: merged };
}

/**
 * Partial-order comparison for vector clocks.
 * Returns "concurrent" when neither dominates the other.
 */
export function compareVectorClocks(
  a: VectorClock,
  b: VectorClock
): ClockComparison {
  const allNodes = new Set([
    ...Object.keys(a.clocks),
    ...Object.keys(b.clocks),
  ]);

  let aLessOrEqual = true;
  let bLessOrEqual = true;

  for (const node of allNodes) {
    const aVal = a.clocks[node] ?? 0;
    const bVal = b.clocks[node] ?? 0;
    if (aVal > bVal) bLessOrEqual = false;
    if (bVal > aVal) aLessOrEqual = false;
  }

  if (aLessOrEqual && bLessOrEqual) return "equal";
  if (aLessOrEqual) return "less";
  if (bLessOrEqual) return "greater";
  return "concurrent";
}

/**
 * True if event a causally precedes b (a < b).
 */
export function happensBefore(a: VectorClock, b: VectorClock): boolean {
  return compareVectorClocks(a, b) === "less";
}

/**
 * True if neither a < b nor b < a.
 */
export function areConcurrent(a: VectorClock, b: VectorClock): boolean {
  return compareVectorClocks(a, b) === "concurrent";
}

// ── Hybrid Logical Clock (HLC) ─────────────────────────────────────────────
//
// HLC combines physical wall time with a logical counter so that:
//   - timestamps monotonically increase
//   - timestamps are close to wall-clock time
//   - causality is preserved across nodes
//
// Reference: Kulkarni et al., "Logical Physical Clocks and Consistent
// Snapshots in Globally Distributed Databases" (2014)

export function createHLC(nodeId: NodeId): HLCTimestamp {
  return { wallTime: Date.now(), logical: 0, nodeId };
}

/**
 * Generate a new HLC timestamp on the local node (send / local event).
 */
export function tickHLC(
  local: HLCTimestamp,
  now: number = Date.now()
): HLCTimestamp {
  const wallTime = Math.max(local.wallTime, now);
  const logical = wallTime === local.wallTime ? local.logical + 1 : 0;
  return { wallTime, logical, nodeId: local.nodeId };
}

/**
 * Update the local HLC after receiving a remote HLC timestamp.
 */
export function updateHLC(
  local: HLCTimestamp,
  remote: HLCTimestamp,
  now: number = Date.now()
): HLCTimestamp {
  const wallTime = Math.max(local.wallTime, remote.wallTime, now);

  let logical: number;
  if (
    wallTime === local.wallTime &&
    wallTime === remote.wallTime
  ) {
    logical = Math.max(local.logical, remote.logical) + 1;
  } else if (wallTime === local.wallTime) {
    logical = local.logical + 1;
  } else if (wallTime === remote.wallTime) {
    logical = remote.logical + 1;
  } else {
    logical = 0;
  }

  return { wallTime, logical, nodeId: local.nodeId };
}

/**
 * Total order comparison for HLC timestamps.
 * Primary key: wallTime, secondary: logical, tertiary: nodeId.
 */
export function compareHLC(
  a: HLCTimestamp,
  b: HLCTimestamp
): ClockComparison {
  if (a.wallTime < b.wallTime) return "less";
  if (a.wallTime > b.wallTime) return "greater";
  if (a.logical < b.logical) return "less";
  if (a.logical > b.logical) return "greater";
  if (a.nodeId < b.nodeId) return "less";
  if (a.nodeId > b.nodeId) return "greater";
  return "equal";
}

/**
 * Returns the later of two HLC timestamps (true total order).
 */
export function maxHLC(a: HLCTimestamp, b: HLCTimestamp): HLCTimestamp {
  return compareHLC(a, b) === "less" ? b : a;
}

export function hlcToString(ts: HLCTimestamp): string {
  return `${ts.wallTime}.${ts.logical}@${ts.nodeId}`;
}

export function hlcFromString(s: string): HLCTimestamp {
  const atIdx = s.lastIndexOf("@");
  const nodeId = s.slice(atIdx + 1);
  const timePart = s.slice(0, atIdx);
  const dotIdx = timePart.indexOf(".");
  const wallTime = parseInt(timePart.slice(0, dotIdx), 10);
  const logical = parseInt(timePart.slice(dotIdx + 1), 10);
  return { wallTime, logical, nodeId };
}
