import { describe, it, expect } from "vitest";
import { Random } from "../random.js";

describe("Random", () => {
  describe("seeded PRNG", () => {
    it("produces same values for same seed", () => {
      const r1 = new Random(42);
      const r2 = new Random(42);
      for (let i = 0; i < 20; i++) {
        expect(r1.float()).toBe(r2.float());
      }
    });

    it("produces different values for different seeds", () => {
      const r1 = new Random(1);
      const r2 = new Random(2);
      let diff = false;
      for (let i = 0; i < 20; i++) {
        if (r1.float() !== r2.float()) { diff = true; break; }
      }
      expect(diff).toBe(true);
    });

    it("accepts string seed", () => {
      const r1 = new Random("hello");
      const r2 = new Random("hello");
      expect(r1.float()).toBe(r2.float());
    });
  });

  describe("float", () => {
    it("returns values in [0, 1)", () => {
      const r = new Random(99);
      for (let i = 0; i < 100; i++) {
        const v = r.float();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe("floatRange", () => {
    it("returns values in [min, max)", () => {
      const r = new Random(1);
      for (let i = 0; i < 100; i++) {
        const v = r.floatRange(-5, 5);
        expect(v).toBeGreaterThanOrEqual(-5);
        expect(v).toBeLessThan(5);
      }
    });
  });

  describe("int", () => {
    it("returns integer values in [min, max]", () => {
      const r = new Random(7);
      const seen = new Set<number>();
      for (let i = 0; i < 1000; i++) {
        const v = r.int(1, 6);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(6);
        expect(Number.isInteger(v)).toBe(true);
        seen.add(v);
      }
      // Should see most values between 1 and 6
      expect(seen.size).toBeGreaterThanOrEqual(5);
    });
  });

  describe("normal distribution", () => {
    it("has approximately correct mean and stddev", () => {
      const r = new Random(123);
      const samples = Array.from({ length: 10000 }, () => r.normal(5, 2));
      const mean = samples.reduce((a, b) => a + b) / samples.length;
      const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
      expect(mean).toBeCloseTo(5, 0);
      expect(Math.sqrt(variance)).toBeCloseTo(2, 0);
    });
  });

  describe("exponential distribution", () => {
    it("has approximately correct mean (1/lambda)", () => {
      const r = new Random(456);
      const lambda = 2;
      const samples = Array.from({ length: 10000 }, () => r.exponential(lambda));
      const mean = samples.reduce((a, b) => a + b) / samples.length;
      expect(mean).toBeCloseTo(1 / lambda, 0);
    });

    it("throws for non-positive lambda", () => {
      const r = new Random(1);
      expect(() => r.exponential(0)).toThrow();
    });
  });

  describe("poisson distribution", () => {
    it("has approximately correct mean", () => {
      const r = new Random(789);
      const lambda = 4;
      const samples = Array.from({ length: 10000 }, () => r.poisson(lambda));
      const mean = samples.reduce((a, b) => a + b) / samples.length;
      expect(mean).toBeCloseTo(lambda, 0);
    });
  });

  describe("powerLaw distribution", () => {
    it("returns values >= xMin", () => {
      const r = new Random(321);
      for (let i = 0; i < 100; i++) {
        expect(r.powerLaw(2.5, 1)).toBeGreaterThanOrEqual(1);
      }
    });

    it("throws for alpha <= 1", () => {
      const r = new Random(1);
      expect(() => r.powerLaw(1, 1)).toThrow();
    });
  });

  describe("choice", () => {
    it("picks from the array", () => {
      const r = new Random(11);
      const arr = [10, 20, 30, 40, 50];
      for (let i = 0; i < 50; i++) {
        expect(arr).toContain(r.choice(arr));
      }
    });

    it("throws on empty array", () => {
      expect(() => new Random(1).choice([])).toThrow();
    });
  });

  describe("weightedChoice", () => {
    it("strongly favors high-weight items", () => {
      const r = new Random(22);
      const items = ["a", "b", "c"];
      const weights = [1, 100, 1];
      const counts = { a: 0, b: 0, c: 0 };
      for (let i = 0; i < 1000; i++) {
        const chosen = r.weightedChoice(items, weights) as "a" | "b" | "c";
        counts[chosen]++;
      }
      expect(counts.b).toBeGreaterThan(counts.a * 10);
    });
  });

  describe("shuffle", () => {
    it("returns array with same elements", () => {
      const r = new Random(33);
      const arr = [1, 2, 3, 4, 5];
      const shuffled = r.shuffle(arr);
      expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it("does not mutate original", () => {
      const r = new Random(33);
      const arr = [1, 2, 3];
      r.shuffle(arr);
      expect(arr).toEqual([1, 2, 3]);
    });
  });

  describe("uuid", () => {
    it("generates valid UUID format", () => {
      const r = new Random(44);
      const uuid = r.uuid();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("generates unique UUIDs", () => {
      const r = new Random(55);
      const uuids = new Set(Array.from({ length: 100 }, () => r.uuid()));
      expect(uuids.size).toBe(100);
    });
  });

  describe("string", () => {
    it("generates string of correct length", () => {
      const r = new Random(66);
      expect(r.string(16)).toHaveLength(16);
    });

    it("uses custom charset", () => {
      const r = new Random(77);
      const s = r.string(100, "abc");
      expect([...s].every((c) => "abc".includes(c))).toBe(true);
    });
  });

  describe("sample", () => {
    it("returns k unique elements", () => {
      const r = new Random(88);
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const sample = r.sample(arr, 5);
      expect(sample).toHaveLength(5);
      expect(new Set(sample).size).toBe(5);
    });

    it("throws if k > arr.length", () => {
      expect(() => new Random(1).sample([1, 2], 5)).toThrow();
    });
  });
});
