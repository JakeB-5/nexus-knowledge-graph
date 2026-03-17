import { describe, it, expect, beforeEach } from "vitest";
import {
  createLamport,
  tickLamport,
  updateLamport,
  compareLamport,
  lamportToString,
  createVectorClock,
  tickVector,
  mergeVectorClocks,
  compareVectorClocks,
  happensBefore,
  areConcurrent,
  createHLC,
  tickHLC,
  updateHLC,
  compareHLC,
  maxHLC,
  hlcToString,
  hlcFromString,
} from "../clock.js";

// ── Lamport ────────────────────────────────────────────────────────────────

describe("Lamport timestamps", () => {
  it("creates a timestamp with counter 0", () => {
    const ts = createLamport("nodeA");
    expect(ts.counter).toBe(0);
    expect(ts.nodeId).toBe("nodeA");
  });

  it("tick increments counter by 1", () => {
    const ts = createLamport("nodeA", 5);
    const next = tickLamport(ts);
    expect(next.counter).toBe(6);
    expect(next.nodeId).toBe("nodeA");
  });

  it("update takes max + 1", () => {
    const local = createLamport("a", 3);
    const remote = createLamport("b", 7);
    const updated = updateLamport(local, remote);
    expect(updated.counter).toBe(8); // max(3,7) + 1
    expect(updated.nodeId).toBe("a");
  });

  it("update with lower remote does not decrease counter", () => {
    const local = createLamport("a", 10);
    const remote = createLamport("b", 2);
    const updated = updateLamport(local, remote);
    expect(updated.counter).toBe(11); // max(10,2) + 1
  });

  describe("compareLamport", () => {
    it("less when counter is smaller", () => {
      expect(compareLamport(createLamport("a", 1), createLamport("b", 2))).toBe("less");
    });
    it("greater when counter is larger", () => {
      expect(compareLamport(createLamport("a", 5), createLamport("b", 3))).toBe("greater");
    });
    it("breaks ties by nodeId (lexicographic)", () => {
      expect(compareLamport(createLamport("a", 1), createLamport("b", 1))).toBe("less");
      expect(compareLamport(createLamport("z", 1), createLamport("a", 1))).toBe("greater");
    });
    it("equal when counter and nodeId match", () => {
      expect(compareLamport(createLamport("x", 3), createLamport("x", 3))).toBe("equal");
    });
  });

  it("serialises to string", () => {
    expect(lamportToString(createLamport("nodeA", 42))).toBe("42@nodeA");
  });
});

// ── Vector clock ───────────────────────────────────────────────────────────

describe("Vector clocks", () => {
  it("creates clock with single entry", () => {
    const vc = createVectorClock("a");
    expect(vc.clocks["a"]).toBe(0);
  });

  it("tick increments only the specified node", () => {
    const vc = createVectorClock("a");
    const ticked = tickVector(vc, "a");
    expect(ticked.clocks["a"]).toBe(1);
  });

  it("tick creates entry for new node", () => {
    const vc = createVectorClock("a");
    const ticked = tickVector(vc, "b");
    expect(ticked.clocks["b"]).toBe(1);
    expect(ticked.clocks["a"]).toBe(0);
  });

  it("merge takes pairwise maximum", () => {
    const a = { clocks: { a: 3, b: 1 } };
    const b = { clocks: { a: 1, b: 4, c: 2 } };
    const merged = mergeVectorClocks(a, b);
    expect(merged.clocks["a"]).toBe(3);
    expect(merged.clocks["b"]).toBe(4);
    expect(merged.clocks["c"]).toBe(2);
  });

  describe("compareVectorClocks", () => {
    it("equal clocks", () => {
      const a = { clocks: { a: 2, b: 2 } };
      expect(compareVectorClocks(a, a)).toBe("equal");
    });

    it("a < b when a is dominated", () => {
      const a = { clocks: { a: 1, b: 1 } };
      const b = { clocks: { a: 2, b: 2 } };
      expect(compareVectorClocks(a, b)).toBe("less");
    });

    it("a > b when a dominates", () => {
      const a = { clocks: { a: 3, b: 3 } };
      const b = { clocks: { a: 1, b: 2 } };
      expect(compareVectorClocks(a, b)).toBe("greater");
    });

    it("concurrent when neither dominates", () => {
      const a = { clocks: { a: 2, b: 1 } };
      const b = { clocks: { a: 1, b: 2 } };
      expect(compareVectorClocks(a, b)).toBe("concurrent");
    });
  });

  it("happensBefore detects causal order", () => {
    const a = { clocks: { a: 1, b: 0 } };
    const b = { clocks: { a: 2, b: 1 } };
    expect(happensBefore(a, b)).toBe(true);
    expect(happensBefore(b, a)).toBe(false);
  });

  it("areConcurrent detects concurrent events", () => {
    const a = { clocks: { a: 2, b: 0 } };
    const b = { clocks: { a: 0, b: 2 } };
    expect(areConcurrent(a, b)).toBe(true);
  });
});

// ── HLC ───────────────────────────────────────────────────────────────────

describe("Hybrid Logical Clock", () => {
  it("creates HLC with current wall time", () => {
    const before = Date.now();
    const hlc = createHLC("nodeA");
    const after = Date.now();
    expect(hlc.wallTime).toBeGreaterThanOrEqual(before);
    expect(hlc.wallTime).toBeLessThanOrEqual(after);
    expect(hlc.logical).toBe(0);
    expect(hlc.nodeId).toBe("nodeA");
  });

  it("tick with same wall time increments logical", () => {
    const hlc = createHLC("nodeA");
    const ticked = tickHLC(hlc, hlc.wallTime); // same wall time
    expect(ticked.wallTime).toBe(hlc.wallTime);
    expect(ticked.logical).toBe(hlc.logical + 1);
  });

  it("tick with advanced wall time resets logical to 0", () => {
    const hlc = { wallTime: 1000, logical: 5, nodeId: "a" };
    const ticked = tickHLC(hlc, 2000);
    expect(ticked.wallTime).toBe(2000);
    expect(ticked.logical).toBe(0);
  });

  it("updateHLC takes max of all three timestamps", () => {
    const local = { wallTime: 100, logical: 0, nodeId: "a" };
    const remote = { wallTime: 200, logical: 3, nodeId: "b" };
    const updated = updateHLC(local, remote, 50);
    expect(updated.wallTime).toBe(200); // max(100, 200, 50)
    expect(updated.logical).toBe(4); // remote.logical + 1
    expect(updated.nodeId).toBe("a");
  });

  it("updateHLC with same wallTime on both increments max logical + 1", () => {
    const local = { wallTime: 100, logical: 2, nodeId: "a" };
    const remote = { wallTime: 100, logical: 5, nodeId: "b" };
    const updated = updateHLC(local, remote, 100);
    expect(updated.wallTime).toBe(100);
    expect(updated.logical).toBe(6); // max(2,5) + 1
  });

  describe("compareHLC", () => {
    it("compares by wallTime first", () => {
      const a = { wallTime: 100, logical: 9, nodeId: "z" };
      const b = { wallTime: 200, logical: 0, nodeId: "a" };
      expect(compareHLC(a, b)).toBe("less");
    });

    it("breaks ties with logical", () => {
      const a = { wallTime: 100, logical: 0, nodeId: "z" };
      const b = { wallTime: 100, logical: 1, nodeId: "a" };
      expect(compareHLC(a, b)).toBe("less");
    });

    it("breaks ties with nodeId", () => {
      const a = { wallTime: 100, logical: 0, nodeId: "a" };
      const b = { wallTime: 100, logical: 0, nodeId: "z" };
      expect(compareHLC(a, b)).toBe("less");
    });

    it("equal when all fields match", () => {
      const a = { wallTime: 100, logical: 0, nodeId: "a" };
      expect(compareHLC(a, { ...a })).toBe("equal");
    });
  });

  it("maxHLC returns the later timestamp", () => {
    const a = { wallTime: 100, logical: 0, nodeId: "a" };
    const b = { wallTime: 200, logical: 0, nodeId: "a" };
    expect(maxHLC(a, b)).toEqual(b);
    expect(maxHLC(b, a)).toEqual(b);
  });

  it("round-trips through string serialisation", () => {
    const hlc = { wallTime: 1700000000000, logical: 42, nodeId: "node-xyz" };
    const str = hlcToString(hlc);
    const parsed = hlcFromString(str);
    expect(parsed.wallTime).toBe(hlc.wallTime);
    expect(parsed.logical).toBe(hlc.logical);
    expect(parsed.nodeId).toBe(hlc.nodeId);
  });
});
