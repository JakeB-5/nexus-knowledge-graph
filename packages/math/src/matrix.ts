/**
 * Matrix class for 2D matrix mathematics.
 */
export class Matrix {
  private readonly data: Float64Array[];
  readonly rows: number;
  readonly cols: number;

  constructor(rows: number, cols: number, data?: number[][]) {
    this.rows = rows;
    this.cols = cols;
    if (data) {
      if (data.length !== rows) throw new Error("Row count mismatch");
      this.data = data.map((row) => {
        if (row.length !== cols) throw new Error("Column count mismatch");
        return new Float64Array(row);
      });
    } else {
      this.data = Array.from({ length: rows }, () => new Float64Array(cols));
    }
  }

  get(row: number, col: number): number {
    const r = this.data[row];
    if (!r) throw new RangeError(`Row ${row} out of bounds`);
    const v = r[col];
    if (v === undefined) throw new RangeError(`Col ${col} out of bounds`);
    return v;
  }

  set(row: number, col: number, value: number): Matrix {
    const clone = this.clone();
    const r = clone.data[row];
    if (!r) throw new RangeError(`Row ${row} out of bounds`);
    r[col] = value;
    return clone;
  }

  toArray(): number[][] {
    return this.data.map((row) => Array.from(row));
  }

  // --- Static Factories ---

  static zeros(rows: number, cols: number): Matrix {
    return new Matrix(rows, cols);
  }

  static ones(rows: number, cols: number): Matrix {
    return new Matrix(
      rows,
      cols,
      Array.from({ length: rows }, () => new Array(cols).fill(1))
    );
  }

  static identity(n: number): Matrix {
    const data = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (__, j) => (i === j ? 1 : 0))
    );
    return new Matrix(n, n, data);
  }

  static random(rows: number, cols: number, min = 0, max = 1): Matrix {
    return new Matrix(
      rows,
      cols,
      Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => min + Math.random() * (max - min))
      )
    );
  }

  static fromArray(data: number[][]): Matrix {
    if (data.length === 0) throw new Error("Empty matrix data");
    const rows = data.length;
    const cols = data[0]?.length ?? 0;
    return new Matrix(rows, cols, data);
  }

  // --- Basic Operations ---

  add(other: Matrix): Matrix {
    assertSameShape(this, other);
    return new Matrix(
      this.rows,
      this.cols,
      this.toArray().map((row, i) => row.map((v, j) => v + other.get(i, j)))
    );
  }

  subtract(other: Matrix): Matrix {
    assertSameShape(this, other);
    return new Matrix(
      this.rows,
      this.cols,
      this.toArray().map((row, i) => row.map((v, j) => v - other.get(i, j)))
    );
  }

  multiplyScalar(scalar: number): Matrix {
    return new Matrix(
      this.rows,
      this.cols,
      this.toArray().map((row) => row.map((v) => v * scalar))
    );
  }

  multiply(other: Matrix): Matrix {
    if (this.cols !== other.rows) {
      throw new Error(
        `Matrix multiply dimension mismatch: (${this.rows}x${this.cols}) * (${other.rows}x${other.cols})`
      );
    }
    const result = Matrix.zeros(this.rows, other.cols);
    const data = result.toArray();
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < other.cols; j++) {
        let sum = 0;
        for (let k = 0; k < this.cols; k++) {
          sum += this.get(i, k) * other.get(k, j);
        }
        data[i]![j] = sum;
      }
    }
    return Matrix.fromArray(data);
  }

  // --- Transpose ---

  transpose(): Matrix {
    const data = Array.from({ length: this.cols }, (_, j) =>
      Array.from({ length: this.rows }, (__, i) => this.get(i, j))
    );
    return new Matrix(this.cols, this.rows, data);
  }

  // --- Trace ---

  trace(): number {
    if (this.rows !== this.cols) throw new Error("Trace requires square matrix");
    let sum = 0;
    for (let i = 0; i < this.rows; i++) sum += this.get(i, i);
    return sum;
  }

  // --- Frobenius Norm ---

  frobeniusNorm(): number {
    let sum = 0;
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        sum += this.get(i, j) ** 2;
      }
    }
    return Math.sqrt(sum);
  }

  // --- Determinant ---

  determinant(): number {
    if (this.rows !== this.cols) throw new Error("Determinant requires square matrix");
    const n = this.rows;
    if (n === 1) return this.get(0, 0);
    if (n === 2) {
      return this.get(0, 0) * this.get(1, 1) - this.get(0, 1) * this.get(1, 0);
    }
    if (n === 3) {
      const a = this.toArray();
      return (
        a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) -
        a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) +
        a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!)
      );
    }
    // General via LU decomposition
    const { L, U, sign } = this.luDecompose();
    let detL = 1;
    let detU = 1;
    for (let i = 0; i < n; i++) {
      detL *= L.get(i, i);
      detU *= U.get(i, i);
    }
    return sign * detL * detU;
  }

  // --- LU Decomposition ---

  luDecompose(): { L: Matrix; U: Matrix; P: Matrix; sign: number } {
    if (this.rows !== this.cols) throw new Error("LU requires square matrix");
    const n = this.rows;
    const a = this.toArray();
    const perm = Array.from({ length: n }, (_, i) => i);
    let sign = 1;

    for (let col = 0; col < n; col++) {
      // Find pivot
      let maxRow = col;
      let maxVal = Math.abs(a[col]![col]!);
      for (let row = col + 1; row < n; row++) {
        const val = Math.abs(a[row]![col]!);
        if (val > maxVal) {
          maxVal = val;
          maxRow = row;
        }
      }
      if (maxRow !== col) {
        [a[col], a[maxRow]] = [a[maxRow]!, a[col]!];
        [perm[col], perm[maxRow]] = [perm[maxRow]!, perm[col]!];
        sign = -sign;
      }
      const pivot = a[col]![col]!;
      if (Math.abs(pivot) < 1e-12) continue;
      for (let row = col + 1; row < n; row++) {
        a[row]![col]! /= pivot;
        for (let k = col + 1; k < n; k++) {
          a[row]![k]! -= a[row]![col]! * a[col]![k]!;
        }
      }
    }

    const L = Matrix.identity(n);
    const U = Matrix.zeros(n, n);
    const lData = L.toArray();
    const uData = U.toArray();

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i > j) {
          lData[i]![j] = a[i]![j]!;
        } else {
          uData[i]![j] = a[i]![j]!;
        }
      }
    }

    const P = Matrix.zeros(n, n);
    const pData = P.toArray();
    for (let i = 0; i < n; i++) {
      pData[i]![perm[i]!] = 1;
    }

    return {
      L: Matrix.fromArray(lData),
      U: Matrix.fromArray(uData),
      P: Matrix.fromArray(pData),
      sign,
    };
  }

  // --- Row Echelon Form ---

  rowEchelonForm(): Matrix {
    const data = this.toArray();
    let pivotRow = 0;
    for (let col = 0; col < this.cols && pivotRow < this.rows; col++) {
      // Find pivot in this column
      let maxRow = pivotRow;
      for (let row = pivotRow + 1; row < this.rows; row++) {
        if (Math.abs(data[row]![col]!) > Math.abs(data[maxRow]![col]!)) {
          maxRow = row;
        }
      }
      if (Math.abs(data[maxRow]![col]!) < 1e-12) continue;
      [data[pivotRow], data[maxRow]] = [data[maxRow]!, data[pivotRow]!];

      const pivot = data[pivotRow]![col]!;
      for (let j = 0; j < this.cols; j++) {
        data[pivotRow]![j]! /= pivot;
      }
      for (let row = 0; row < this.rows; row++) {
        if (row === pivotRow) continue;
        const factor = data[row]![col]!;
        for (let j = 0; j < this.cols; j++) {
          data[row]![j]! -= factor * data[pivotRow]![j]!;
        }
      }
      pivotRow++;
    }
    return Matrix.fromArray(data);
  }

  // --- Inverse (Gauss-Jordan) ---

  inverse(): Matrix {
    if (this.rows !== this.cols) throw new Error("Inverse requires square matrix");
    const n = this.rows;
    // Augment [A | I]
    const aug = Array.from({ length: n }, (_, i) =>
      [...this.toArray()[i]!, ...Array.from({ length: n }, (__, j) => (i === j ? 1 : 0))]
    );

    for (let col = 0; col < n; col++) {
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row]![col]!) > Math.abs(aug[maxRow]![col]!)) maxRow = row;
      }
      [aug[col], aug[maxRow]] = [aug[maxRow]!, aug[col]!];
      const pivot = aug[col]![col]!;
      if (Math.abs(pivot) < 1e-12) throw new Error("Matrix is singular");
      for (let j = 0; j < 2 * n; j++) {
        aug[col]![j]! /= pivot;
      }
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = aug[row]![col]!;
        for (let j = 0; j < 2 * n; j++) {
          aug[row]![j]! -= factor * aug[col]![j]!;
        }
      }
    }

    const result = Array.from({ length: n }, (_, i) =>
      aug[i]!.slice(n)
    );
    return Matrix.fromArray(result);
  }

  // --- Eigenvalue (Power Iteration) ---

  dominantEigenvalue(maxIter = 1000, tol = 1e-10): { eigenvalue: number; eigenvector: number[] } {
    if (this.rows !== this.cols) throw new Error("Eigenvalue requires square matrix");
    const n = this.rows;
    let vec = Array.from({ length: n }, () => Math.random());
    // Normalize
    let norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    vec = vec.map((v) => v / norm);

    let eigenvalue = 0;
    for (let iter = 0; iter < maxIter; iter++) {
      // Multiply matrix by vec
      const next = Array.from({ length: n }, (_, i) =>
        vec.reduce((s, v, j) => s + this.get(i, j) * v, 0)
      );
      norm = Math.sqrt(next.reduce((s, v) => s + v * v, 0));
      if (norm < 1e-12) break;
      const newVec = next.map((v) => v / norm);
      const newEigenvalue = next.reduce((s, v, i) => s + v * vec[i]!, 0);
      if (Math.abs(newEigenvalue - eigenvalue) < tol) {
        eigenvalue = newEigenvalue;
        vec = newVec;
        break;
      }
      eigenvalue = newEigenvalue;
      vec = newVec;
    }
    return { eigenvalue, eigenvector: vec };
  }

  // --- Utility ---

  clone(): Matrix {
    return Matrix.fromArray(this.toArray());
  }

  equals(other: Matrix, epsilon = 1e-10): boolean {
    if (this.rows !== other.rows || this.cols !== other.cols) return false;
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        if (Math.abs(this.get(i, j) - other.get(i, j)) > epsilon) return false;
      }
    }
    return true;
  }

  toString(): string {
    return this.toArray()
      .map((row) => `[${row.join(", ")}]`)
      .join("\n");
  }
}

function assertSameShape(a: Matrix, b: Matrix): void {
  if (a.rows !== b.rows || a.cols !== b.cols) {
    throw new Error(
      `Matrix shape mismatch: (${a.rows}x${a.cols}) vs (${b.rows}x${b.cols})`
    );
  }
}
