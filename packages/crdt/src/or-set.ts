// Observed-Remove Set (OR-Set) CRDT
//
// Each add operation pairs the element with a globally unique "add-tag".
// Removing an element removes all tags that were observed at remove time.
// On merge, an element is present iff at least one of its add-tags survives.
//
// This resolves the add/remove concurrency anomaly of 2P-Set:
//   - concurrent add and remove → add wins (the new tag is unknown to the remover)
//   - sequential remove after add → remove wins (all tags are known)

import type { NodeId, ORSetState } from "./types.js";

// ── Helpers ────────────────────────────────────────────────────────────────

let _tagCounter = 0;

function generateTag(nodeId: NodeId): string {
  return `${nodeId}-${Date.now()}-${++_tagCounter}`;
}

function serialise<T>(value: T): string {
  // For primitives, JSON is bijective; for objects callers should supply
  // a string key or override serialise.
  return JSON.stringify(value);
}

// ── ORSet class ────────────────────────────────────────────────────────────

export class ORSet<T> {
  /** Map from serialised element → set of live add-tags */
  private tags: Map<string, Set<string>>;
  /** Map from serialised element → original value */
  private values: Map<string, T>;
  private readonly nodeId: NodeId;

  constructor(nodeId: NodeId, initial?: ORSetState<T>) {
    this.nodeId = nodeId;
    this.tags = new Map();
    this.values = new Map();

    if (initial) {
      for (const [key, tagSet] of Object.entries(initial.entries)) {
        this.tags.set(key, new Set(tagSet));
      }
      for (const [key, value] of Object.entries(initial.values)) {
        this.values.set(key, value as T);
      }
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Add an element to the set.
   * Returns the unique add-tag used (useful for operation-based replication).
   */
  add(element: T): string {
    const key = serialise(element);
    const tag = generateTag(this.nodeId);

    const existing = this.tags.get(key) ?? new Set<string>();
    existing.add(tag);
    this.tags.set(key, existing);
    this.values.set(key, element);

    return tag;
  }

  /**
   * Remove an element by clearing all currently observed add-tags.
   * If the element is not present this is a no-op.
   * Returns the set of tags that were removed (empty if element not present).
   */
  remove(element: T): Set<string> {
    const key = serialise(element);
    const tagSet = this.tags.get(key);
    if (!tagSet || tagSet.size === 0) return new Set();

    const removed = new Set(tagSet);
    this.tags.delete(key);
    this.values.delete(key);
    return removed;
  }

  /**
   * Add an element with an explicit tag (used during merge / remote apply).
   */
  addWithTag(element: T, tag: string): void {
    const key = serialise(element);
    const existing = this.tags.get(key) ?? new Set<string>();
    existing.add(tag);
    this.tags.set(key, existing);
    this.values.set(key, element);
  }

  /**
   * Remove specific tags for an element (used during merge / remote apply).
   */
  removeTagsFor(element: T, tagsToRemove: ReadonlySet<string>): void {
    const key = serialise(element);
    const tagSet = this.tags.get(key);
    if (!tagSet) return;

    for (const t of tagsToRemove) {
      tagSet.delete(t);
    }

    if (tagSet.size === 0) {
      this.tags.delete(key);
      this.values.delete(key);
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  has(element: T): boolean {
    const key = serialise(element);
    const tagSet = this.tags.get(key);
    return tagSet !== undefined && tagSet.size > 0;
  }

  size(): number {
    return this.tags.size;
  }

  values(): T[] {
    return [...this.values.values()];
  }

  /**
   * Return the live add-tags for an element (empty set if not present).
   */
  tagsFor(element: T): ReadonlySet<string> {
    const key = serialise(element);
    return this.tags.get(key) ?? new Set();
  }

  // ── CRDT operations ───────────────────────────────────────────────────────

  /**
   * Merge a remote OR-Set into this one.
   *
   * An element is in the merged result iff its add-tag is in the
   * intersection of the union of both tag sets (i.e. the set of tags that
   * both sides agree are alive after applying the union of all add-tags and
   * the intersection of alive-tag sets).
   *
   * Standard OR-Set merge:
   *   merged_tags(e) = tags_A(e) ∪ tags_B(e)
   *   but filtered so that a tag is alive only if it appears in at least
   *   one of the two sets. Since removes are modelled by deleting tags,
   *   any tag not present is considered removed.
   *
   * The correct formulation: the merged set of live tags for element e is
   *   (tagsA(e) ∪ tagsB(e))
   * because removes are encoded as tag deletions. An element is present iff
   * the union is non-empty.
   */
  merge(remote: ORSet<T>): void {
    this.mergeState(remote.getState());
  }

  mergeState(remote: ORSetState<T>): void {
    // Collect all keys across both sides
    const allKeys = new Set([
      ...this.tags.keys(),
      ...Object.keys(remote.entries),
    ]);

    for (const key of allKeys) {
      const localTags = this.tags.get(key) ?? new Set<string>();
      const remoteTags = new Set<string>(remote.entries[key] ?? []);

      // Union of tags = element is in merged set if either side added it
      // and neither side explicitly removed it (tags not present = removed)
      //
      // An add-tag that exists on one side but not the other means:
      //   - If it's only local: the remote never saw this add (or removed it)
      //   - If it's only remote: we never saw this add (or removed it)
      //
      // For true OR-Set semantics the merge is: union of surviving tags.
      const mergedTags = new Set([...localTags, ...remoteTags]);

      if (mergedTags.size > 0) {
        this.tags.set(key, mergedTags);
        // Restore the value if we didn't have it locally
        if (!this.values.has(key) && remote.values[key] !== undefined) {
          this.values.set(key, remote.values[key] as T);
        }
      } else {
        this.tags.delete(key);
        this.values.delete(key);
      }
    }
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getState(): ORSetState<T> {
    const entries: Record<string, ReadonlySet<string>> = {};
    for (const [key, tagSet] of this.tags.entries()) {
      entries[key] = new Set(tagSet);
    }
    const values: Record<string, T> = {};
    for (const [key, value] of this.values.entries()) {
      values[key] = value;
    }
    return { entries, values };
  }

  static fromState<T>(nodeId: NodeId, state: ORSetState<T>): ORSet<T> {
    return new ORSet<T>(nodeId, state);
  }

  clone(): ORSet<T> {
    return ORSet.fromState(this.nodeId, this.getState());
  }

  toJSON(): object {
    return {
      nodeId: this.nodeId,
      elements: this.values(),
    };
  }
}

// ── Pure functional helpers ────────────────────────────────────────────────

export function orsMerge<T>(
  a: ORSetState<T>,
  b: ORSetState<T>
): ORSetState<T> {
  const allKeys = new Set([
    ...Object.keys(a.entries),
    ...Object.keys(b.entries),
  ]);

  const entries: Record<string, ReadonlySet<string>> = {};
  const values: Record<string, T> = { ...a.values };

  for (const key of allKeys) {
    const aTags = new Set<string>(a.entries[key] ?? []);
    const bTags = new Set<string>(b.entries[key] ?? []);
    const merged = new Set([...aTags, ...bTags]);

    if (merged.size > 0) {
      entries[key] = merged;
      if (b.values[key] !== undefined) {
        values[key] = b.values[key] as T;
      }
    }
  }

  return { entries, values };
}

export function orsHas<T>(state: ORSetState<T>, element: T): boolean {
  const key = serialise(element);
  const tags = state.entries[key];
  return tags !== undefined && tags.size > 0;
}

export function orsValues<T>(state: ORSetState<T>): T[] {
  return Object.values(state.values);
}
