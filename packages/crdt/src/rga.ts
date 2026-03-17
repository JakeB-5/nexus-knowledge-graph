// Replicated Growable Array (RGA) CRDT
//
// RGA enables collaborative text editing by assigning each character a
// globally unique, causally-ordered identifier.  Insertions are applied
// relative to a predecessor node; concurrent insertions at the same position
// are ordered deterministically by (counter DESC, nodeId DESC).
//
// Deletions are handled as tombstones so that position identifiers remain
// stable; the text view simply skips tombstoned nodes.
//
// Reference: Roh et al., "Replicated abstract data types: Building blocks
// for collaborative applications" (2011)

import type {
  NodeId,
  RGAId,
  RGANode,
  RGAState,
  RichTextMarker,
} from "./types.js";

// ── ID helpers ─────────────────────────────────────────────────────────────

export function rgaIdToString(id: RGAId): string {
  return `${id.counter}:${id.nodeId}`;
}

export function rgaIdFromString(s: string): RGAId {
  const idx = s.indexOf(":");
  return {
    counter: parseInt(s.slice(0, idx), 10),
    nodeId: s.slice(idx + 1),
  };
}

function rgaIdsEqual(a: RGAId | null, b: RGAId | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.counter === b.counter && a.nodeId === b.nodeId;
}

/**
 * Comparison for concurrent insertions at the same position.
 * Higher counter wins; ties broken by nodeId (lexicographic DESC).
 * Returns positive when a should come BEFORE b in the list.
 */
function rgaIdPriority(a: RGAId, b: RGAId): number {
  if (a.counter !== b.counter) return b.counter - a.counter; // higher counter first
  if (a.nodeId > b.nodeId) return -1; // higher nodeId first
  if (a.nodeId < b.nodeId) return 1;
  return 0;
}

// ── RGA class ──────────────────────────────────────────────────────────────

export class RGA<T = string> {
  /** The ordered list of all nodes (including tombstones). */
  private nodes: Array<RGANode<T>>;
  /** Fast lookup: serialised RGAId → index in nodes array */
  private idIndex: Map<string, number>;
  /** Monotonically increasing local counter */
  private counter: number;
  private readonly nodeId: NodeId;

  constructor(nodeId: NodeId, initial?: RGAState<T>) {
    this.nodeId = nodeId;
    this.counter = 0;
    this.nodes = [];
    this.idIndex = new Map();

    if (initial) {
      this.nodes = initial.nodes.map((n) => ({ ...n }));
      this.rebuildIndex();
      // Recover counter from existing nodes
      for (const node of this.nodes) {
        if (node.id.nodeId === nodeId && node.id.counter >= this.counter) {
          this.counter = node.id.counter + 1;
        }
      }
    }
  }

  // ── Index management ───────────────────────────────────────────────────────

  private rebuildIndex(): void {
    this.idIndex.clear();
    for (let i = 0; i < this.nodes.length; i++) {
      this.idIndex.set(rgaIdToString(this.nodes[i]!.id), i);
    }
  }

  private getNodeIndex(id: RGAId): number | undefined {
    return this.idIndex.get(rgaIdToString(id));
  }

  // ── Core insert logic ─────────────────────────────────────────────────────

  /**
   * Find the position at which to splice a new node that follows `afterId`.
   *
   * RGA invariant: among nodes with the same `originId`, sort by
   * (counter DESC, nodeId DESC) — i.e. the "winning" concurrent insert
   * comes first.
   */
  private findInsertPosition(node: RGANode<T>): number {
    // Find the index of the predecessor node
    let startIdx: number;
    if (node.originId === null) {
      startIdx = -1; // Insert relative to virtual head
    } else {
      const idx = this.getNodeIndex(node.originId);
      if (idx === undefined) {
        // Predecessor not yet received — this shouldn't happen in causal delivery;
        // fall back to appending at end.
        return this.nodes.length;
      }
      startIdx = idx;
    }

    // Scan forward past all nodes that should come BEFORE our new node
    // (i.e. nodes whose originId matches our originId and have higher priority)
    let pos = startIdx + 1;
    while (pos < this.nodes.length) {
      const candidate = this.nodes[pos]!;

      // Stop when we reach a node whose predecessor is "earlier" than ours
      if (!rgaIdsEqual(candidate.originId, node.originId)) {
        // If this candidate's origin is not the same as ours, check if it's
        // a descendant of our predecessor — if so we skip past it.
        // Otherwise we've found our insertion point.
        const candidateOriginIdx =
          candidate.originId === null
            ? -1
            : this.getNodeIndex(candidate.originId) ?? -1;
        if (candidateOriginIdx <= startIdx) break;
      } else {
        // Same origin — apply concurrent ordering
        if (rgaIdPriority(candidate.id, node.id) >= 0) {
          // candidate has higher or equal priority → it goes before our node
          pos++;
          continue;
        } else {
          break;
        }
      }
      pos++;
    }

    return pos;
  }

  // ── Public mutations ───────────────────────────────────────────────────────

  /**
   * Insert `value` after the node identified by `afterId`.
   * Pass `null` for `afterId` to insert at the beginning.
   * Returns the new node's RGAId.
   */
  insert(value: T, afterId: RGAId | null = null): RGAId {
    const id: RGAId = { counter: this.counter++, nodeId: this.nodeId };
    const node: RGANode<T> = { id, value, deleted: false, originId: afterId };
    this.applyInsert(node);
    return id;
  }

  /**
   * Insert `value` at a logical index (ignoring tombstones).
   * index 0 = beginning, index >= length = end.
   */
  insertAt(index: number, value: T): RGAId {
    const afterId = this.idAtVisibleIndex(index - 1);
    return this.insert(value, afterId);
  }

  /**
   * Insert a string of characters after `afterId`, returning the ids in order.
   */
  insertMany(values: T[], afterId: RGAId | null = null): RGAId[] {
    const ids: RGAId[] = [];
    let prevId = afterId;
    for (const value of values) {
      const id = this.insert(value, prevId);
      ids.push(id);
      prevId = id;
    }
    return ids;
  }

  /**
   * Mark a node as deleted (tombstone). Returns false if already deleted or not found.
   */
  delete(id: RGAId): boolean {
    const idx = this.getNodeIndex(id);
    if (idx === undefined) return false;
    const node = this.nodes[idx]!;
    if (node.deleted) return false;
    this.nodes[idx] = { ...node, deleted: true };
    return true;
  }

  /**
   * Delete the character at a logical (visible) index.
   */
  deleteAt(index: number): RGAId | undefined {
    const id = this.idAtVisibleIndex(index);
    if (id === null) return undefined;
    this.delete(id);
    return id;
  }

  /**
   * Delete a range of visible characters [start, end).
   */
  deleteRange(start: number, end: number): RGAId[] {
    const deleted: RGAId[] = [];
    const visibleIds = this.visibleIds();
    for (let i = start; i < end && i < visibleIds.length; i++) {
      const id = visibleIds[i];
      if (id !== undefined) {
        this.delete(id);
        deleted.push(id);
      }
    }
    return deleted;
  }

  // ── Apply remote operations ────────────────────────────────────────────────

  /**
   * Apply a remote insert node. Idempotent.
   */
  applyInsert(node: RGANode<T>): void {
    const key = rgaIdToString(node.id);

    // Idempotency: skip if already present
    if (this.idIndex.has(key)) return;

    // Update counter to avoid future collisions
    if (node.id.nodeId === this.nodeId && node.id.counter >= this.counter) {
      this.counter = node.id.counter + 1;
    }

    const pos = this.findInsertPosition(node);
    this.nodes.splice(pos, 0, { ...node });

    // Rebuild index (splicing shifts indices after `pos`)
    this.rebuildIndex();
  }

  /**
   * Apply a remote delete. Idempotent.
   */
  applyDelete(id: RGAId): void {
    this.delete(id);
  }

  // ── Merge ──────────────────────────────────────────────────────────────────

  /**
   * Merge a remote RGA into this one.
   *
   * Strategy: replay all remote nodes that are not yet in our structure.
   * We sort them in causal order (by counter, so parents always precede
   * children within the same node's edits) before applying.
   */
  merge(remote: RGA<T>): void {
    this.mergeState(remote.getState());
  }

  mergeState(remote: RGAState<T>): void {
    // Sort remote nodes: lower counter first (causal order)
    const sorted = [...remote.nodes].sort((a, b) => {
      if (a.id.counter !== b.id.counter) return a.id.counter - b.id.counter;
      return a.id.nodeId < b.id.nodeId ? -1 : 1;
    });

    for (const node of sorted) {
      const key = rgaIdToString(node.id);
      if (!this.idIndex.has(key)) {
        this.applyInsert(node);
      } else if (node.deleted) {
        // Apply tombstone
        this.applyDelete(node.id);
      }
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Return all live (non-tombstone) values in order.
   */
  toArray(): T[] {
    return this.nodes
      .filter((n) => !n.deleted)
      .map((n) => n.value);
  }

  /**
   * Reconstruct text (for T = string).
   */
  toString(): string {
    return (this.toArray() as unknown as string[]).join("");
  }

  /**
   * Number of visible (non-deleted) elements.
   */
  length(): number {
    return this.nodes.filter((n) => !n.deleted).length;
  }

  /**
   * Total nodes including tombstones.
   */
  totalNodes(): number {
    return this.nodes.length;
  }

  /**
   * Return the RGAId at a visible (non-tombstone) index.
   * Returns null if index is before the start (-1 means "head").
   */
  idAtVisibleIndex(index: number): RGAId | null {
    if (index < 0) return null;
    let visible = -1;
    for (const node of this.nodes) {
      if (!node.deleted) {
        visible++;
        if (visible === index) return node.id;
      }
    }
    return null; // index out of range → append at end (caller treats null as head)
  }

  /**
   * Return all visible RGAIds in order.
   */
  visibleIds(): RGAId[] {
    return this.nodes.filter((n) => !n.deleted).map((n) => n.id);
  }

  /**
   * Return the visible index of a node id (-1 if not found or tombstoned).
   */
  visibleIndexOf(id: RGAId): number {
    let visible = -1;
    for (const node of this.nodes) {
      if (!node.deleted) visible++;
      if (rgaIdsEqual(node.id, id)) {
        return node.deleted ? -1 : visible;
      }
    }
    return -1;
  }

  /**
   * Return the character (value) at a visible index, or undefined.
   */
  charAt(index: number): T | undefined {
    return this.toArray()[index];
  }

  // ── Rich text markers ─────────────────────────────────────────────────────
  //
  // Rich text markers are stored externally (not in the node sequence) as
  // spans keyed by RGAId ranges.  Here we provide helpers to translate
  // between RGAId-based ranges and visible-index-based ranges.

  /**
   * Resolve a marker's stable RGAId range to the current visible indices.
   * Returns undefined if either endpoint no longer exists.
   */
  resolveMarker(
    startId: RGAId,
    endId: RGAId
  ): { start: number; end: number } | undefined {
    const start = this.visibleIndexOf(startId);
    const end = this.visibleIndexOf(endId);
    if (start === -1 || end === -1) return undefined;
    return { start, end };
  }

  /**
   * Convert a visible-index range to stable RGAId endpoints.
   */
  idRangeFor(
    start: number,
    end: number
  ): { startId: RGAId; endId: RGAId } | undefined {
    const startId = this.idAtVisibleIndex(start);
    const endId = this.idAtVisibleIndex(end);
    if (startId === null || endId === null) return undefined;
    return { startId, endId };
  }

  /**
   * Build rich-text markers from a set of [startId, endId, type] triples.
   */
  buildMarkers(
    spans: Array<{ startId: RGAId; endId: RGAId; type: RichTextMarker["type"] }>
  ): RichTextMarker[] {
    const markers: RichTextMarker[] = [];
    for (const span of spans) {
      const resolved = this.resolveMarker(span.startId, span.endId);
      if (resolved) {
        markers.push({ type: span.type, ...resolved });
      }
    }
    return markers;
  }

  // ── Serialisation ──────────────────────────────────────────────────────────

  getState(): RGAState<T> {
    const tombstones = new Set<string>();
    for (const node of this.nodes) {
      if (node.deleted) tombstones.add(rgaIdToString(node.id));
    }
    return {
      nodes: this.nodes.map((n) => ({ ...n })),
      tombstones,
    };
  }

  static fromState<T>(nodeId: NodeId, state: RGAState<T>): RGA<T> {
    return new RGA<T>(nodeId, state);
  }

  clone(): RGA<T> {
    return RGA.fromState(this.nodeId, this.getState());
  }

  toJSON(): object {
    return {
      nodeId: this.nodeId,
      text: this.toString(),
      length: this.length(),
      totalNodes: this.totalNodes(),
    };
  }

  // ── Delta computation ──────────────────────────────────────────────────────

  /**
   * Compute the set of nodes that are in `this` but not in `base`.
   * Used for delta-sync: send only changes since last sync.
   */
  delta(base: RGA<T>): RGAState<T> {
    const baseKeys = new Set(
      base.nodes.map((n) => rgaIdToString(n.id))
    );
    const newNodes: RGANode<T>[] = [];
    const newTombstones = new Set<string>();

    for (const node of this.nodes) {
      const key = rgaIdToString(node.id);
      if (!baseKeys.has(key)) {
        newNodes.push({ ...node });
        if (node.deleted) newTombstones.add(key);
      } else if (node.deleted) {
        // Check if the base version had this node alive
        const baseNode = base.nodes.find((n) =>
          rgaIdToString(n.id) === key
        );
        if (baseNode && !baseNode.deleted) {
          // It was alive in base, now deleted → include as tombstone delta
          newNodes.push({ ...node });
          newTombstones.add(key);
        }
      }
    }

    return { nodes: newNodes, tombstones: newTombstones };
  }
}

// ── Convenience factory for text RGAs ────────────────────────────────────────

export function createTextRGA(nodeId: NodeId): RGA<string> {
  return new RGA<string>(nodeId);
}

/**
 * Insert a full string into an RGA at a given position.
 */
export function rgaInsertString(
  rga: RGA<string>,
  text: string,
  afterId: RGAId | null = null
): RGAId[] {
  return rga.insertMany([...text], afterId);
}
