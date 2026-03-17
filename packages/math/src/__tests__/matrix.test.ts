import { describe, it, expect } from "vitest";
import { Matrix } from "../matrix.js";

describe("Matrix", () => {
  describe("construction", () => {
    it("creates matrix with given data", () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]]);
      expect(m.rows).toBe(2);
      expect(m.cols).toBe(2);
      expect(m.get(0, 0)).toBe(1);
      expect(m.get(1, 1)).toBe(4);
    });

    it("throws on out-of-bounds access", () => {
      const m = Matrix.zeros(2, 2);
      expect(() => m.get(5, 0)).toThrow();
    });
  });

  describe("static factories", () => {
    it("zeros", () => {
      const m = Matrix.zeros(2, 3);
      expect(m.rows).toBe(2);
      expect(m.cols).toBe(3);
      expect(m.get(0, 0)).toBe(0);
      expect(m.get(1, 2)).toBe(0);
    });

    it("ones", () => {
      const m = Matrix.ones(2, 2);
      expect(m.get(0, 0)).toBe(1);
      expect(m.get(1, 1)).toBe(1);
    });

    it("identity", () => {
      const m = Matrix.identity(3);
      expect(m.get(0, 0)).toBe(1);
      expect(m.get(1, 1)).toBe(1);
      expect(m.get(2, 2)).toBe(1);
      expect(m.get(0, 1)).toBe(0);
      expect(m.get(1, 0)).toBe(0);
    });

    it("random values in range", () => {
      const m = Matrix.random(3, 3, 0, 1);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(m.get(i, j)).toBeGreaterThanOrEqual(0);
          expect(m.get(i, j)).toBeLessThan(1);
        }
      }
    });
  });

  describe("basic operations", () => {
    it("adds two matrices", () => {
      const a = Matrix.fromArray([[1, 2], [3, 4]]);
      const b = Matrix.fromArray([[5, 6], [7, 8]]);
      const result = a.add(b);
      expect(result.get(0, 0)).toBe(6);
      expect(result.get(1, 1)).toBe(12);
    });

    it("subtracts two matrices", () => {
      const a = Matrix.fromArray([[5, 6], [7, 8]]);
      const b = Matrix.fromArray([[1, 2], [3, 4]]);
      const result = a.subtract(b);
      expect(result.get(0, 0)).toBe(4);
      expect(result.get(1, 1)).toBe(4);
    });

    it("multiplies by scalar", () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]]);
      const result = m.multiplyScalar(3);
      expect(result.get(0, 0)).toBe(3);
      expect(result.get(1, 1)).toBe(12);
    });

    it("matrix multiplication 2x2", () => {
      const a = Matrix.fromArray([[1, 2], [3, 4]]);
      const b = Matrix.fromArray([[5, 6], [7, 8]]);
      const result = a.multiply(b);
      expect(result.get(0, 0)).toBe(19);  // 1*5 + 2*7
      expect(result.get(0, 1)).toBe(22);  // 1*6 + 2*8
      expect(result.get(1, 0)).toBe(43);  // 3*5 + 4*7
      expect(result.get(1, 1)).toBe(50);  // 3*6 + 4*8
    });

    it("matrix multiplication 2x3 * 3x2", () => {
      const a = Matrix.fromArray([[1, 2, 3], [4, 5, 6]]);
      const b = Matrix.fromArray([[7, 8], [9, 10], [11, 12]]);
      const result = a.multiply(b);
      expect(result.rows).toBe(2);
      expect(result.cols).toBe(2);
      expect(result.get(0, 0)).toBe(58);  // 1*7+2*9+3*11
    });

    it("throws on dimension mismatch for multiply", () => {
      const a = Matrix.fromArray([[1, 2]]);
      const b = Matrix.fromArray([[1, 2]]);
      expect(() => a.multiply(b)).toThrow();
    });

    it("throws on shape mismatch for add", () => {
      const a = Matrix.zeros(2, 2);
      const b = Matrix.zeros(3, 3);
      expect(() => a.add(b)).toThrow();
    });
  });

  describe("transpose", () => {
    it("transposes a matrix", () => {
      const m = Matrix.fromArray([[1, 2, 3], [4, 5, 6]]);
      const t = m.transpose();
      expect(t.rows).toBe(3);
      expect(t.cols).toBe(2);
      expect(t.get(0, 0)).toBe(1);
      expect(t.get(1, 0)).toBe(2);
      expect(t.get(2, 0)).toBe(3);
      expect(t.get(0, 1)).toBe(4);
    });

    it("double transpose returns original", () => {
      const m = Matrix.fromArray([[1, 2], [3, 4], [5, 6]]);
      expect(m.transpose().transpose().equals(m)).toBe(true);
    });
  });

  describe("trace", () => {
    it("computes trace of identity matrix", () => {
      expect(Matrix.identity(3).trace()).toBe(3);
    });

    it("computes trace of general matrix", () => {
      const m = Matrix.fromArray([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      expect(m.trace()).toBe(15);
    });

    it("throws for non-square", () => {
      expect(() => Matrix.zeros(2, 3).trace()).toThrow();
    });
  });

  describe("frobenius norm", () => {
    it("computes Frobenius norm", () => {
      const m = Matrix.fromArray([[1, 0], [0, 1]]);
      expect(m.frobeniusNorm()).toBeCloseTo(Math.sqrt(2));
    });
  });

  describe("determinant", () => {
    it("1x1 determinant", () => {
      expect(Matrix.fromArray([[5]]).determinant()).toBe(5);
    });

    it("2x2 determinant", () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]]);
      expect(m.determinant()).toBeCloseTo(-2);
    });

    it("3x3 determinant", () => {
      const m = Matrix.fromArray([[1, 2, 3], [0, 1, 4], [5, 6, 0]]);
      expect(m.determinant()).toBeCloseTo(1);
    });

    it("identity matrix has determinant 1", () => {
      expect(Matrix.identity(4).determinant()).toBeCloseTo(1);
    });

    it("throws for non-square", () => {
      expect(() => Matrix.zeros(2, 3).determinant()).toThrow();
    });
  });

  describe("inverse", () => {
    it("2x2 inverse", () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]]);
      const inv = m.inverse();
      const product = m.multiply(inv);
      expect(product.equals(Matrix.identity(2))).toBe(true);
    });

    it("3x3 inverse", () => {
      const m = Matrix.fromArray([[2, 1, 1], [4, 3, 3], [8, 7, 9]]);
      const inv = m.inverse();
      const product = m.multiply(inv);
      expect(product.equals(Matrix.identity(3))).toBe(true);
    });

    it("throws for singular matrix", () => {
      const m = Matrix.fromArray([[1, 2], [2, 4]]);
      expect(() => m.inverse()).toThrow();
    });
  });

  describe("LU decomposition", () => {
    it("decomposes a matrix", () => {
      const m = Matrix.fromArray([[2, 1], [4, 3]]);
      const { L, U } = m.luDecompose();
      // L is lower triangular, U is upper triangular
      expect(L.get(0, 1)).toBeCloseTo(0);
      expect(U.get(1, 0)).toBeCloseTo(0);
    });
  });

  describe("row echelon form", () => {
    it("produces row echelon form", () => {
      const m = Matrix.fromArray([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]]);
      const ref = m.rowEchelonForm();
      expect(ref.get(0, 0)).toBeCloseTo(1);
    });
  });

  describe("eigenvalue estimation", () => {
    it("finds dominant eigenvalue of simple matrix", () => {
      // [[2, 0], [0, 3]] has eigenvalues 2 and 3; dominant is 3
      const m = Matrix.fromArray([[2, 0], [0, 3]]);
      const { eigenvalue } = m.dominantEigenvalue();
      expect(Math.abs(eigenvalue)).toBeCloseTo(3, 0);
    });
  });

  describe("set and clone", () => {
    it("set returns new matrix with updated value", () => {
      const m = Matrix.zeros(2, 2);
      const m2 = m.set(1, 1, 99);
      expect(m.get(1, 1)).toBe(0);
      expect(m2.get(1, 1)).toBe(99);
    });

    it("clone creates independent copy", () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]]);
      const c = m.clone();
      expect(c.equals(m)).toBe(true);
    });
  });

  describe("toArray and toString", () => {
    it("converts to 2D array", () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]]);
      expect(m.toArray()).toEqual([[1, 2], [3, 4]]);
    });

    it("toString returns readable form", () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]]);
      expect(m.toString()).toContain("[1, 2]");
    });
  });
});
