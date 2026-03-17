import { describe, it, expect } from "vitest";
import { Vector } from "../vector.js";

describe("Vector", () => {
  describe("construction", () => {
    it("creates a vector with given components", () => {
      const v = new Vector([1, 2, 3]);
      expect(v.length).toBe(3);
      expect(v.get(0)).toBe(1);
      expect(v.get(1)).toBe(2);
      expect(v.get(2)).toBe(3);
    });

    it("throws on out-of-bounds access", () => {
      const v = new Vector([1, 2]);
      expect(() => v.get(5)).toThrow();
    });

    it("converts to array", () => {
      const v = new Vector([4, 5, 6]);
      expect(v.toArray()).toEqual([4, 5, 6]);
    });
  });

  describe("arithmetic", () => {
    it("adds two vectors", () => {
      const a = new Vector([1, 2, 3]);
      const b = new Vector([4, 5, 6]);
      expect(a.add(b).toArray()).toEqual([5, 7, 9]);
    });

    it("subtracts two vectors", () => {
      const a = new Vector([4, 5, 6]);
      const b = new Vector([1, 2, 3]);
      expect(a.subtract(b).toArray()).toEqual([3, 3, 3]);
    });

    it("scales a vector", () => {
      const v = new Vector([1, 2, 3]);
      expect(v.scale(2).toArray()).toEqual([2, 4, 6]);
    });

    it("computes dot product", () => {
      const a = new Vector([1, 2, 3]);
      const b = new Vector([4, 5, 6]);
      expect(a.dot(b)).toBe(32);
    });

    it("throws on dimension mismatch", () => {
      const a = new Vector([1, 2]);
      const b = new Vector([1, 2, 3]);
      expect(() => a.add(b)).toThrow();
    });
  });

  describe("norms", () => {
    it("computes magnitude", () => {
      const v = new Vector([3, 4]);
      expect(v.magnitude()).toBeCloseTo(5);
    });

    it("normalizes a vector", () => {
      const v = new Vector([3, 4]);
      const n = v.normalize();
      expect(n.magnitude()).toBeCloseTo(1);
    });

    it("throws normalizing zero vector", () => {
      expect(() => new Vector([0, 0, 0]).normalize()).toThrow();
    });
  });

  describe("distance and similarity", () => {
    it("computes cosine similarity for identical vectors", () => {
      const v = new Vector([1, 2, 3]);
      expect(v.cosineSimilarity(v)).toBeCloseTo(1);
    });

    it("computes cosine similarity for orthogonal vectors", () => {
      const a = new Vector([1, 0]);
      const b = new Vector([0, 1]);
      expect(a.cosineSimilarity(b)).toBeCloseTo(0);
    });

    it("computes euclidean distance", () => {
      const a = new Vector([0, 0]);
      const b = new Vector([3, 4]);
      expect(a.euclideanDistance(b)).toBeCloseTo(5);
    });

    it("computes manhattan distance", () => {
      const a = new Vector([0, 0]);
      const b = new Vector([3, 4]);
      expect(a.manhattanDistance(b)).toBe(7);
    });
  });

  describe("cross product", () => {
    it("computes 3D cross product", () => {
      const a = new Vector([1, 0, 0]);
      const b = new Vector([0, 1, 0]);
      expect(a.cross(b).toArray()).toEqual([0, 0, 1]);
    });

    it("throws for non-3D vectors", () => {
      const a = new Vector([1, 2]);
      const b = new Vector([3, 4]);
      expect(() => a.cross(b)).toThrow();
    });
  });

  describe("angle", () => {
    it("angle between parallel vectors is 0", () => {
      const v = new Vector([1, 0]);
      expect(v.angleTo(v)).toBeCloseTo(0);
    });

    it("angle between orthogonal vectors is pi/2", () => {
      const a = new Vector([1, 0]);
      const b = new Vector([0, 1]);
      expect(a.angleTo(b)).toBeCloseTo(Math.PI / 2);
    });
  });

  describe("projection", () => {
    it("projects onto itself gives the same vector", () => {
      const v = new Vector([3, 4]);
      expect(v.projectOnto(v).equals(v)).toBe(true);
    });

    it("projects onto orthogonal gives zero", () => {
      const a = new Vector([1, 0]);
      const b = new Vector([0, 1]);
      const proj = a.projectOnto(b);
      expect(proj.magnitude()).toBeCloseTo(0);
    });
  });

  describe("element-wise operations", () => {
    it("element-wise multiply", () => {
      const a = new Vector([2, 3, 4]);
      const b = new Vector([5, 6, 7]);
      expect(a.multiply(b).toArray()).toEqual([10, 18, 28]);
    });

    it("element-wise divide", () => {
      const a = new Vector([10, 20, 30]);
      const b = new Vector([2, 4, 5]);
      expect(a.divide(b).toArray()).toEqual([5, 5, 6]);
    });

    it("throws on division by zero", () => {
      expect(() => new Vector([1, 2]).divide(new Vector([0, 1]))).toThrow();
    });
  });

  describe("static factories", () => {
    it("creates zero vector", () => {
      const v = Vector.zero(4);
      expect(v.toArray()).toEqual([0, 0, 0, 0]);
    });

    it("creates ones vector", () => {
      const v = Vector.ones(3);
      expect(v.toArray()).toEqual([1, 1, 1]);
    });

    it("creates random vector in range", () => {
      const v = Vector.random(10, -1, 1);
      expect(v.length).toBe(10);
      for (const c of v.toArray()) {
        expect(c).toBeGreaterThanOrEqual(-1);
        expect(c).toBeLessThan(1);
      }
    });

    it("creates from array", () => {
      const v = Vector.fromArray([7, 8, 9]);
      expect(v.toArray()).toEqual([7, 8, 9]);
    });
  });

  describe("utility", () => {
    it("negate flips sign", () => {
      expect(new Vector([1, -2, 3]).negate().toArray()).toEqual([-1, 2, -3]);
    });

    it("abs takes absolute value", () => {
      expect(new Vector([-1, -2, 3]).abs().toArray()).toEqual([1, 2, 3]);
    });

    it("sum adds all components", () => {
      expect(new Vector([1, 2, 3, 4]).sum()).toBe(10);
    });

    it("min and max", () => {
      const v = new Vector([3, 1, 4, 1, 5]);
      expect(v.min()).toBe(1);
      expect(v.max()).toBe(5);
    });

    it("clone creates independent copy", () => {
      const v = new Vector([1, 2, 3]);
      const c = v.clone();
      expect(c.equals(v)).toBe(true);
    });

    it("map applies function", () => {
      const v = new Vector([1, 2, 3]);
      expect(v.map((x) => x * 2).toArray()).toEqual([2, 4, 6]);
    });
  });
});
