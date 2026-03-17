import { describe, it, expect, beforeEach } from "vitest";
import { RGA, createTextRGA, rgaInsertString, rgaIdToString } from "../rga.js";
import type { RGAId } from "../types.js";

// ── Basic operations ───────────────────────────────────────────────────────

describe("RGA - basic operations", () => {
  let rga: RGA<string>;

  beforeEach(() => {
    rga = createTextRGA("node1");
  });

  it("starts empty", () => {
    expect(rga.toString()).toBe("");
    expect(rga.length()).toBe(0);
  });

  it("insert at beginning", () => {
    rga.insert("a", null);
    expect(rga.toString()).toBe("a");
  });

  it("insert multiple characters sequentially", () => {
    const ids = rga.insertMany(["h", "e", "l", "l", "o"], null);
    expect(rga.toString()).toBe("hello");
    expect(ids.length).toBe(5);
  });

  it("insertAt index 0 prepends", () => {
    rga.insertMany(["b", "c"], null);
    rga.insertAt(0, "a");
    expect(rga.toString()).toBe("abc");
  });

  it("insertAt appends when index >= length", () => {
    rga.insertMany(["a", "b"], null);
    rga.insertAt(2, "c");
    expect(rga.toString()).toBe("abc");
  });

  it("insertAt middle inserts correctly", () => {
    rga.insertMany(["a", "c"], null);
    rga.insertAt(1, "b");
    expect(rga.toString()).toBe("abc");
  });

  it("delete marks node as tombstone", () => {
    const ids = rga.insertMany(["a", "b", "c"], null);
    expect(ids[1]).toBeDefined();
    rga.delete(ids[1]!);
    expect(rga.toString()).toBe("ac");
    expect(rga.length()).toBe(2);
    expect(rga.totalNodes()).toBe(3); // tombstone still counted
  });

  it("deleteAt by visible index", () => {
    rga.insertMany(["x", "y", "z"], null);
    rga.deleteAt(1);
    expect(rga.toString()).toBe("xz");
  });

  it("deleteRange removes multiple characters", () => {
    rga.insertMany(["a", "b", "c", "d", "e"], null);
    rga.deleteRange(1, 4); // delete "bcd"
    expect(rga.toString()).toBe("ae");
  });

  it("delete same node twice is idempotent", () => {
    const ids = rga.insertMany(["a", "b"], null);
    rga.delete(ids[0]!);
    rga.delete(ids[0]!); // second delete is a no-op
    expect(rga.toString()).toBe("b");
  });

  it("charAt returns correct character", () => {
    rga.insertMany(["x", "y", "z"], null);
    expect(rga.charAt(0)).toBe("x");
    expect(rga.charAt(1)).toBe("y");
    expect(rga.charAt(2)).toBe("z");
    expect(rga.charAt(3)).toBeUndefined();
  });

  it("idAtVisibleIndex returns correct id", () => {
    const ids = rga.insertMany(["a", "b", "c"], null);
    expect(rga.idAtVisibleIndex(0)).toEqual(ids[0]);
    expect(rga.idAtVisibleIndex(1)).toEqual(ids[1]);
    expect(rga.idAtVisibleIndex(-1)).toBeNull();
  });

  it("visibleIds returns ids in document order", () => {
    const ids = rga.insertMany(["a", "b", "c"], null);
    const visible = rga.visibleIds();
    expect(visible).toEqual(ids);
  });

  it("visibleIndexOf returns -1 for deleted node", () => {
    const ids = rga.insertMany(["a", "b"], null);
    rga.delete(ids[0]!);
    expect(rga.visibleIndexOf(ids[0]!)).toBe(-1);
    expect(rga.visibleIndexOf(ids[1]!)).toBe(0);
  });
});

// ── Merge / concurrent operations ─────────────────────────────────────────

describe("RGA - merge and concurrent operations", () => {
  it("merging two independent inserts produces union", () => {
    const a = createTextRGA("nodeA");
    const b = createTextRGA("nodeB");

    rgaInsertString(a, "Hello", null);
    rgaInsertString(b, "World", null);

    a.merge(b);
    // Both strings should be present (order is deterministic but depends on IDs)
    const text = a.toString();
    expect(text).toContain("Hello");
    expect(text).toContain("World");
    expect(text.length).toBe(10);
  });

  it("concurrent inserts at same position are ordered deterministically", () => {
    const a = createTextRGA("nodeA");
    const b = createTextRGA("nodeB");

    // Both insert at head concurrently
    a.insert("A", null);
    b.insert("B", null);

    const aCopy = a.clone();
    const bCopy = b.clone();

    aCopy.merge(b);
    bCopy.merge(a);

    // Both replicas must converge to the same string
    expect(aCopy.toString()).toBe(bCopy.toString());
    expect(aCopy.toString().length).toBe(2);
  });

  it("merge is idempotent", () => {
    const a = createTextRGA("nodeA");
    const b = createTextRGA("nodeB");

    rgaInsertString(a, "abc", null);
    rgaInsertString(b, "xyz", null);

    a.merge(b);
    const text1 = a.toString();
    a.merge(b);
    const text2 = a.toString();

    expect(text1).toBe(text2);
  });

  it("merge is commutative", () => {
    const a = createTextRGA("nodeA");
    const b = createTextRGA("nodeB");

    rgaInsertString(a, "abc", null);
    rgaInsertString(b, "xyz", null);

    const ab = a.clone();
    ab.merge(b);

    const ba = b.clone();
    ba.merge(a);

    expect(ab.toString()).toBe(ba.toString());
  });

  it("merge is associative", () => {
    const a = createTextRGA("nodeA");
    const b = createTextRGA("nodeB");
    const c = createTextRGA("nodeC");

    rgaInsertString(a, "aa", null);
    rgaInsertString(b, "bb", null);
    rgaInsertString(c, "cc", null);

    // (a ∪ b) ∪ c
    const ab = a.clone();
    ab.merge(b);
    const abc1 = ab.clone();
    abc1.merge(c);

    // a ∪ (b ∪ c)
    const bc = b.clone();
    bc.merge(c);
    const abc2 = a.clone();
    abc2.merge(bc);

    expect(abc1.toString()).toBe(abc2.toString());
  });

  it("delete on one replica propagates on merge", () => {
    const a = createTextRGA("nodeA");
    const b = createTextRGA("nodeB");

    const ids = rgaInsertString(a, "hello", null);
    b.merge(a); // b has "hello"

    // a deletes 'e' (index 1)
    a.delete(ids[1]!);

    // b hasn't seen the delete yet
    expect(b.toString()).toBe("hello");

    // after merge, b sees the delete
    b.merge(a);
    expect(b.toString()).toBe("hllo");
  });

  it("concurrent insert and delete converges", () => {
    const a = createTextRGA("nodeA");
    const b = createTextRGA("nodeB");

    const ids = rgaInsertString(a, "ab", null);
    b.merge(a); // both have "ab"

    // concurrent: a deletes 'a', b inserts 'X' after 'a'
    a.delete(ids[0]!);
    b.insert("X", ids[0]!); // insert after the 'a' position

    // merge
    const aCopy = a.clone();
    const bCopy = b.clone();
    aCopy.merge(b);
    bCopy.merge(a);

    // Both converge
    expect(aCopy.toString()).toBe(bCopy.toString());
  });

  it("three-way concurrent inserts converge", () => {
    const a = createTextRGA("nodeA");
    const b = createTextRGA("nodeB");
    const c = createTextRGA("nodeC");

    // All start from same state
    rgaInsertString(a, "X", null);
    b.merge(a);
    c.merge(a);

    // All concurrently insert at same position
    const xId = a.visibleIds()[0]!;
    a.insert("A", xId);
    b.insert("B", xId);
    c.insert("C", xId);

    // Full merge
    const merged = a.clone();
    merged.merge(b);
    merged.merge(c);

    const merged2 = b.clone();
    merged2.merge(a);
    merged2.merge(c);

    const merged3 = c.clone();
    merged3.merge(a);
    merged3.merge(b);

    expect(merged.toString()).toBe(merged2.toString());
    expect(merged2.toString()).toBe(merged3.toString());
    expect(merged.toString().length).toBe(4); // X + A + B + C
  });
});

// ── Collaborative text editing scenarios ───────────────────────────────────

describe("RGA - collaborative text editing", () => {
  it("simulates two users editing same document", () => {
    // Start: both users have "Hello World"
    const alice = createTextRGA("alice");
    const bob = createTextRGA("bob");

    rgaInsertString(alice, "Hello World", null);
    bob.merge(alice);

    expect(alice.toString()).toBe("Hello World");
    expect(bob.toString()).toBe("Hello World");

    // Alice changes "Hello" to "Hi" (delete "ello", insert "i")
    const aliceIds = alice.visibleIds();
    alice.deleteRange(1, 5); // delete "ello"
    alice.insert("i", aliceIds[0]!); // insert "i" after "H"

    // Bob adds "!" at the end
    const bobIds = bob.visibleIds();
    bob.insert("!", bobIds[bobIds.length - 1]!);

    // Sync
    alice.merge(bob);
    bob.merge(alice);

    expect(alice.toString()).toBe(bob.toString());
    // Result should be "Hi World!"
    expect(alice.toString()).toBe("Hi World!");
  });

  it("handles insertion at the start by both users", () => {
    const a = createTextRGA("alice");
    const b = createTextRGA("bob");

    rgaInsertString(a, "world", null);
    b.merge(a);

    // Both insert at beginning simultaneously
    a.insertAt(0, "!");
    b.insertAt(0, "?");

    a.merge(b);
    b.merge(a);

    expect(a.toString()).toBe(b.toString());
    expect(a.length()).toBe(7);
  });

  it("rgaInsertString helper works correctly", () => {
    const rga = createTextRGA("test");
    const ids = rgaInsertString(rga, "test string", null);
    expect(rga.toString()).toBe("test string");
    expect(ids.length).toBe(11);
  });

  it("id serialization round-trips", () => {
    const rga = createTextRGA("node1");
    const id = rga.insert("x", null);
    const str = rgaIdToString(id);
    expect(str).toContain("node1");
    expect(str).toContain("0"); // counter starts at 0
  });
});

// ── State serialisation ────────────────────────────────────────────────────

describe("RGA - serialisation", () => {
  it("getState / fromState round-trip", () => {
    const rga = createTextRGA("node1");
    rgaInsertString(rga, "hello world", null);
    rga.deleteAt(5); // delete space

    const state = rga.getState();
    const restored = RGA.fromState("node2", state);

    expect(restored.toString()).toBe(rga.toString());
    expect(restored.length()).toBe(rga.length());
    expect(restored.totalNodes()).toBe(rga.totalNodes());
  });

  it("clone produces independent copy", () => {
    const rga = createTextRGA("node1");
    rgaInsertString(rga, "abc", null);

    const cloned = rga.clone();
    cloned.insert("X", null);

    expect(rga.toString()).toBe("abc");
    expect(cloned.toString()).toContain("abc");
  });

  it("delta captures only new nodes since base", () => {
    const base = createTextRGA("node1");
    rgaInsertString(base, "hello", null);

    const current = base.clone();
    rgaInsertString(current, " world", current.idAtVisibleIndex(4)!);

    const delta = current.delta(base);
    expect(delta.nodes.length).toBe(6); // " world"
  });
});

// ── Rich text markers ──────────────────────────────────────────────────────

describe("RGA - rich text markers", () => {
  it("idRangeFor returns stable IDs for a range", () => {
    const rga = createTextRGA("node1");
    rgaInsertString(rga, "hello", null);

    const range = rga.idRangeFor(1, 3);
    expect(range).toBeDefined();
    expect(range?.startId).toBeDefined();
    expect(range?.endId).toBeDefined();
  });

  it("buildMarkers resolves to current visible indices", () => {
    const rga = createTextRGA("node1");
    rgaInsertString(rga, "hello", null);

    const range = rga.idRangeFor(0, 4);
    expect(range).toBeDefined();

    const markers = rga.buildMarkers([
      { startId: range!.startId, endId: range!.endId, type: "bold" },
    ]);

    expect(markers.length).toBe(1);
    expect(markers[0]?.type).toBe("bold");
    expect(markers[0]?.startIndex).toBe(0);
    expect(markers[0]?.endIndex).toBe(4);
  });

  it("marker resolves correctly after deletions before range", () => {
    const rga = createTextRGA("node1");
    rgaInsertString(rga, "hello world", null);

    // Mark "world" (indices 6-10)
    const range = rga.idRangeFor(6, 10);
    expect(range).toBeDefined();

    // Delete "hello " (indices 0-5)
    rga.deleteRange(0, 6);

    // "world" is now at indices 0-4
    const markers = rga.buildMarkers([
      { startId: range!.startId, endId: range!.endId, type: "italic" },
    ]);

    expect(markers.length).toBe(1);
    expect(markers[0]?.startIndex).toBe(0);
  });
});
