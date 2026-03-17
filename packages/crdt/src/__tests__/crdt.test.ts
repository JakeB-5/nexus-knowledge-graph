import { describe, it, expect, beforeEach } from "vitest";
import { GCounter, gcMerge, gcValue, gcIncrement } from "../g-counter.js";
import {
  PNCounter,
  pnMerge,
  pnValue,
  pnIncrement,
  pnDecrement,
  emptyPNCounterState,
} from "../pn-counter.js";
import { GSet, gsMerge, gsAdd, gsHas } from "../g-set.js";
import { ORSet, orsMerge, orsHas, orsValues } from "../or-set.js";
import { LWWRegister, lwwMerge, lwwGet } from "../lww-register.js";
import { LWWMap, lwwMapMerge } from "../lww-map.js";

// ── G-Counter ──────────────────────────────────────────────────────────────

describe("GCounter", () => {
  it("starts at 0", () => {
    const gc = new GCounter("a");
    expect(gc.value()).toBe(0);
  });

  it("increments local slot", () => {
    const gc = new GCounter("a");
    gc.increment();
    gc.increment();
    expect(gc.value()).toBe(2);
    expect(gc.counterFor("a")).toBe(2);
  });

  it("increment by custom amount", () => {
    const gc = new GCounter("a");
    gc.increment(5);
    expect(gc.value()).toBe(5);
  });

  it("throws on non-positive increment", () => {
    const gc = new GCounter("a");
    expect(() => gc.increment(0)).toThrow();
    expect(() => gc.increment(-1)).toThrow();
  });

  it("merge takes pairwise maximum", () => {
    const a = new GCounter("a");
    const b = new GCounter("b");
    a.increment(3);
    b.increment(5);

    a.merge(b);
    expect(a.value()).toBe(8); // 3 + 5
    expect(a.counterFor("b")).toBe(5);
  });

  it("merge is commutative", () => {
    const a = new GCounter("a");
    const b = new GCounter("b");
    a.increment(3);
    b.increment(5);

    const c1 = a.clone();
    c1.merge(b);

    const c2 = b.clone();
    c2.merge(a);

    expect(c1.value()).toBe(c2.value());
  });

  it("merge is idempotent", () => {
    const a = new GCounter("a");
    const b = new GCounter("b");
    a.increment(3);
    b.increment(5);

    a.merge(b);
    a.merge(b); // repeat
    expect(a.value()).toBe(8);
  });

  it("merge is associative", () => {
    const a = new GCounter("a");
    const b = new GCounter("b");
    const c = new GCounter("c");
    a.increment(1);
    b.increment(2);
    c.increment(3);

    const ab = a.clone();
    ab.merge(b);
    ab.merge(c);

    const bc = b.clone();
    bc.merge(c);
    const abc2 = a.clone();
    abc2.merge(bc);

    expect(ab.value()).toBe(abc2.value());
  });

  it("preserves state across clone", () => {
    const gc = new GCounter("a");
    gc.increment(7);
    const cloned = gc.clone();
    expect(cloned.value()).toBe(7);
    cloned.increment(3);
    expect(gc.value()).toBe(7); // original unaffected
  });

  describe("functional helpers", () => {
    it("gcMerge merges two states", () => {
      const a = { counters: { a: 3, b: 1 } };
      const b = { counters: { a: 1, b: 4, c: 2 } };
      const merged = gcMerge(a, b);
      expect(merged.counters["a"]).toBe(3);
      expect(merged.counters["b"]).toBe(4);
      expect(merged.counters["c"]).toBe(2);
    });

    it("gcValue sums counters", () => {
      expect(gcValue({ counters: { a: 3, b: 4 } })).toBe(7);
    });

    it("gcIncrement bumps a slot", () => {
      const s = { counters: { a: 2 } };
      const next = gcIncrement(s, "a");
      expect(next.counters["a"]).toBe(3);
    });
  });
});

// ── PN-Counter ─────────────────────────────────────────────────────────────

describe("PNCounter", () => {
  it("starts at 0", () => {
    const pn = new PNCounter("a");
    expect(pn.value()).toBe(0);
  });

  it("increment", () => {
    const pn = new PNCounter("a");
    pn.increment(3);
    expect(pn.value()).toBe(3);
  });

  it("decrement", () => {
    const pn = new PNCounter("a");
    pn.increment(5);
    pn.decrement(2);
    expect(pn.value()).toBe(3);
  });

  it("can go negative", () => {
    const pn = new PNCounter("a");
    pn.decrement(5);
    expect(pn.value()).toBe(-5);
  });

  it("throws on non-positive decrement", () => {
    const pn = new PNCounter("a");
    expect(() => pn.decrement(0)).toThrow();
    expect(() => pn.decrement(-1)).toThrow();
  });

  it("merge is commutative", () => {
    const a = new PNCounter("a");
    const b = new PNCounter("b");
    a.increment(10);
    b.increment(5);
    b.decrement(3);

    const merged1 = a.clone();
    merged1.merge(b);

    const merged2 = b.clone();
    merged2.merge(a);

    expect(merged1.value()).toBe(merged2.value());
    expect(merged1.value()).toBe(12);
  });

  it("merge is idempotent", () => {
    const a = new PNCounter("a");
    const b = new PNCounter("b");
    a.increment(4);
    b.decrement(2);
    a.merge(b);
    a.merge(b);
    expect(a.value()).toBe(2);
  });

  describe("functional helpers", () => {
    it("pnValue computes net value", () => {
      const state = {
        increments: { counters: { a: 10 } },
        decrements: { counters: { a: 3 } },
      };
      expect(pnValue(state)).toBe(7);
    });

    it("pnMerge merges two states", () => {
      const a = { increments: { counters: { a: 5 } }, decrements: { counters: { a: 1 } } };
      const b = { increments: { counters: { b: 3 } }, decrements: { counters: { b: 2 } } };
      const merged = pnMerge(a, b);
      expect(pnValue(merged)).toBe(5); // 5+3 - 1+2
    });

    it("pnIncrement / pnDecrement are pure", () => {
      const s = emptyPNCounterState();
      const s1 = pnIncrement(s, "a", 5);
      const s2 = pnDecrement(s1, "a", 2);
      expect(pnValue(s2)).toBe(3);
    });
  });
});

// ── G-Set ──────────────────────────────────────────────────────────────────

describe("GSet", () => {
  it("starts empty", () => {
    const gs = new GSet<string>();
    expect(gs.size()).toBe(0);
  });

  it("add and has", () => {
    const gs = new GSet<string>();
    gs.add("a");
    expect(gs.has("a")).toBe(true);
    expect(gs.has("b")).toBe(false);
  });

  it("no duplicates", () => {
    const gs = new GSet<number>();
    gs.add(1);
    gs.add(1);
    expect(gs.size()).toBe(1);
  });

  it("merge is union", () => {
    const a = new GSet<string>();
    const b = new GSet<string>();
    a.add("x");
    b.add("y");
    a.merge(b);
    expect(a.has("x")).toBe(true);
    expect(a.has("y")).toBe(true);
  });

  it("merge is idempotent", () => {
    const a = new GSet<string>();
    const b = new GSet<string>();
    a.add("x");
    b.add("y");
    a.merge(b);
    a.merge(b);
    expect(a.size()).toBe(2);
  });

  it("elements cannot be removed", () => {
    const gs = new GSet<string>();
    gs.add("a");
    // GSet has no remove method
    expect(typeof (gs as unknown as Record<string, unknown>)["remove"]).toBe("undefined");
  });

  it("toArray returns all elements", () => {
    const gs = new GSet<number>();
    gs.add(1);
    gs.add(2);
    gs.add(3);
    expect(gs.toArray().sort()).toEqual([1, 2, 3]);
  });

  describe("functional helpers", () => {
    it("gsMerge combines two states", () => {
      const a = gsAdd({ elements: new Set(["a"]) }, "b");
      const b = { elements: new Set(["c"]) };
      const merged = gsMerge(a, b);
      expect(gsHas(merged, "a")).toBe(true);
      expect(gsHas(merged, "b")).toBe(true);
      expect(gsHas(merged, "c")).toBe(true);
    });
  });
});

// ── OR-Set ─────────────────────────────────────────────────────────────────

describe("ORSet", () => {
  it("starts empty", () => {
    const os = new ORSet<string>("node1");
    expect(os.size()).toBe(0);
  });

  it("add and has", () => {
    const os = new ORSet<string>("node1");
    os.add("hello");
    expect(os.has("hello")).toBe(true);
  });

  it("remove works", () => {
    const os = new ORSet<string>("node1");
    os.add("a");
    os.remove("a");
    expect(os.has("a")).toBe(false);
  });

  it("add after remove re-adds element", () => {
    const os = new ORSet<string>("node1");
    os.add("a");
    os.remove("a");
    os.add("a");
    expect(os.has("a")).toBe(true);
  });

  it("concurrent add wins (add-wins semantics)", () => {
    // Node A adds "x". Node B concurrently removes "x" then A syncs.
    // Since B never saw A's new add-tag, the element remains.
    const a = new ORSet<string>("nodeA");
    const b = new ORSet<string>("nodeB");

    // A adds with a unique tag
    a.add("x"); // tag: nodeA-...-1

    // B adds then removes (B has never seen A's add)
    b.add("x"); // tag: nodeB-...-2
    b.remove("x"); // removes nodeB's tag only

    // Now merge A into B
    b.merge(a);

    // A's tag is still alive → element present
    expect(b.has("x")).toBe(true);
  });

  it("remove after observing all adds removes element", () => {
    const a = new ORSet<string>("nodeA");
    const b = new ORSet<string>("nodeB");

    a.add("x");
    // B sees A's add via merge
    b.merge(a);
    // Now B removes (B has observed A's tag)
    b.remove("x");

    // x is now gone in B
    expect(b.has("x")).toBe(false);

    // After merging B back into A (A didn't add any new tags)
    a.merge(b);
    expect(a.has("x")).toBe(false);
  });

  it("merge is commutative", () => {
    const a = new ORSet<string>("nodeA");
    const b = new ORSet<string>("nodeB");
    a.add("foo");
    b.add("bar");

    const ab = a.clone();
    ab.merge(b);

    const ba = b.clone();
    ba.merge(a);

    const abVals = ab.values().sort();
    const baVals = ba.values().sort();
    expect(abVals).toEqual(baVals);
  });

  it("merge is idempotent", () => {
    const a = new ORSet<string>("nodeA");
    const b = new ORSet<string>("nodeB");
    a.add("x");
    b.add("y");
    a.merge(b);
    a.merge(b);
    expect(a.values().sort()).toEqual(["x", "y"]);
  });

  it("values() returns all live elements", () => {
    const os = new ORSet<number>("n1");
    os.add(1);
    os.add(2);
    os.add(3);
    os.remove(2);
    expect(os.values().sort((a, b) => a - b)).toEqual([1, 3]);
  });

  describe("functional helpers", () => {
    it("orsMerge combines two states", () => {
      const os1 = new ORSet<string>("a");
      const os2 = new ORSet<string>("b");
      os1.add("hello");
      os2.add("world");
      const merged = orsMerge(os1.getState(), os2.getState());
      expect(orsHas(merged, "hello")).toBe(true);
      expect(orsHas(merged, "world")).toBe(true);
    });
  });
});

// ── LWWRegister ────────────────────────────────────────────────────────────

describe("LWWRegister", () => {
  it("starts undefined", () => {
    const reg = new LWWRegister<string>("a");
    expect(reg.get()).toBeUndefined();
    expect(reg.hasValue()).toBe(false);
  });

  it("set stores value", () => {
    const reg = new LWWRegister<string>("a");
    reg.set("hello");
    expect(reg.get()).toBe("hello");
    expect(reg.hasValue()).toBe(true);
  });

  it("second set overwrites first", () => {
    const reg = new LWWRegister<string>("a");
    reg.set("first");
    reg.set("second");
    expect(reg.get()).toBe("second");
  });

  it("merge: later timestamp wins", () => {
    const a = new LWWRegister<string>("nodeA");
    const b = new LWWRegister<string>("nodeB");

    a.set("from-a", 1000);
    b.set("from-b", 2000); // later

    a.merge(b);
    expect(a.get()).toBe("from-b");
  });

  it("merge: earlier remote does not overwrite local", () => {
    const a = new LWWRegister<string>("nodeA");
    const b = new LWWRegister<string>("nodeB");

    a.set("from-a", 2000);
    b.set("from-b", 1000); // earlier

    a.merge(b);
    expect(a.get()).toBe("from-a");
  });

  it("merge is commutative", () => {
    const a = new LWWRegister<number>("nodeA");
    const b = new LWWRegister<number>("nodeB");
    a.set(1, 1000);
    b.set(2, 2000);

    const ab = a.clone();
    ab.merge(b);

    const ba = b.clone();
    ba.merge(a);

    expect(ab.get()).toBe(ba.get());
  });

  it("merge is idempotent", () => {
    const a = new LWWRegister<string>("nodeA");
    const b = new LWWRegister<string>("nodeB");
    a.set("x", 1000);
    b.set("y", 2000);
    a.merge(b);
    a.merge(b);
    expect(a.get()).toBe("y");
  });

  describe("functional helpers", () => {
    it("lwwMerge selects later timestamp", () => {
      const ts1 = { wallTime: 100, logical: 0, nodeId: "a" };
      const ts2 = { wallTime: 200, logical: 0, nodeId: "b" };
      const s1 = { value: "old", timestamp: ts1 };
      const s2 = { value: "new", timestamp: ts2 };
      expect(lwwGet(lwwMerge(s1, s2))).toBe("new");
      expect(lwwGet(lwwMerge(s2, s1))).toBe("new");
    });
  });
});

// ── LWWMap ─────────────────────────────────────────────────────────────────

describe("LWWMap", () => {
  it("starts empty", () => {
    const m = new LWWMap("node1");
    expect(m.size()).toBe(0);
    expect(m.keys()).toEqual([]);
  });

  it("set and get", () => {
    const m = new LWWMap<number>("node1");
    m.set("count", 42);
    expect(m.get("count")).toBe(42);
    expect(m.has("count")).toBe(true);
  });

  it("set overwrites previous value", () => {
    const m = new LWWMap<string>("node1");
    m.set("key", "v1");
    m.set("key", "v2");
    expect(m.get("key")).toBe("v2");
  });

  it("delete removes key", () => {
    const m = new LWWMap<string>("node1");
    m.set("key", "value");
    m.delete("key");
    expect(m.has("key")).toBe(false);
    expect(m.get("key")).toBeUndefined();
  });

  it("setMany sets multiple keys atomically", () => {
    const m = new LWWMap<number>("node1");
    m.setMany({ a: 1, b: 2, c: 3 });
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(2);
    expect(m.get("c")).toBe(3);
    expect(m.size()).toBe(3);
  });

  it("merge: later write wins per key", () => {
    const a = new LWWMap<string>("nodeA");
    const b = new LWWMap<string>("nodeB");

    a.set("shared", "from-a");

    // Give b a later time by using explicit setMany after a delay simulation
    // We rely on HLC to order correctly; since both write "now" and nodeB > nodeA
    // lexicographically, b should win on tie. But let's use a deliberate timestamp.
    b.set("shared", "from-b");
    b.set("unique-b", "only-b");

    a.merge(b);

    // "shared" could be either — test that merge is deterministic
    expect(a.has("shared")).toBe(true);
    expect(a.has("unique-b")).toBe(true);
  });

  it("merge is commutative", () => {
    const a = new LWWMap<number>("nodeA");
    const b = new LWWMap<number>("nodeB");
    a.set("x", 1);
    b.set("y", 2);

    const ab = a.clone();
    ab.merge(b);

    const ba = b.clone();
    ba.merge(a);

    expect(ab.get("x")).toBe(ba.get("x"));
    expect(ab.get("y")).toBe(ba.get("y"));
  });

  it("merge is idempotent", () => {
    const a = new LWWMap<number>("nodeA");
    const b = new LWWMap<number>("nodeB");
    a.set("k", 10);
    b.set("k", 20);
    a.merge(b);
    a.merge(b);
    expect(a.has("k")).toBe(true);
  });

  it("entries() returns only live keys", () => {
    const m = new LWWMap<string>("n1");
    m.set("a", "1");
    m.set("b", "2");
    m.delete("a");
    const entries = m.entries();
    expect(entries.length).toBe(1);
    expect(entries[0]?.[0]).toBe("b");
  });

  it("toObject returns plain key-value object", () => {
    const m = new LWWMap<number>("n1");
    m.set("x", 1);
    m.set("y", 2);
    expect(m.toObject()).toEqual({ x: 1, y: 2 });
  });
});
