// Grow-only Set (G-Set) CRDT
// Elements can be added but never removed.
// Merge = set union. Lookup = membership test.

import type { GSetState } from "./types.js";

export class GSet<T> {
  private elements: Set<T>;

  constructor(initial?: GSetState<T>) {
    this.elements = new Set(initial?.elements ?? []);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Add an element to the set.
   */
  add(element: T): void {
    this.elements.add(element);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Check if an element is in the set.
   */
  has(element: T): boolean {
    return this.elements.has(element);
  }

  /**
   * Return the number of elements.
   */
  size(): number {
    return this.elements.size;
  }

  /**
   * Return all elements as a readonly Set.
   */
  values(): ReadonlySet<T> {
    return this.elements;
  }

  /**
   * Return all elements as an array.
   */
  toArray(): T[] {
    return [...this.elements];
  }

  // ── CRDT operations ───────────────────────────────────────────────────────

  /**
   * Merge a remote G-Set into this one (set union).
   * Commutative, associative, idempotent.
   */
  merge(remote: GSet<T>): void {
    for (const element of remote.elements) {
      this.elements.add(element);
    }
  }

  mergeState(remote: GSetState<T>): void {
    for (const element of remote.elements) {
      this.elements.add(element);
    }
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getState(): GSetState<T> {
    return { elements: new Set(this.elements) };
  }

  static fromState<T>(state: GSetState<T>): GSet<T> {
    return new GSet<T>(state);
  }

  clone(): GSet<T> {
    return new GSet<T>({ elements: new Set(this.elements) });
  }

  toJSON(): object {
    return { elements: [...this.elements] };
  }
}

// ── Pure functional helpers ────────────────────────────────────────────────

export function gsMerge<T>(a: GSetState<T>, b: GSetState<T>): GSetState<T> {
  const merged = new Set(a.elements);
  for (const element of b.elements) {
    merged.add(element);
  }
  return { elements: merged };
}

export function gsAdd<T>(state: GSetState<T>, element: T): GSetState<T> {
  const next = new Set(state.elements);
  next.add(element);
  return { elements: next };
}

export function gsHas<T>(state: GSetState<T>, element: T): boolean {
  return state.elements.has(element);
}
