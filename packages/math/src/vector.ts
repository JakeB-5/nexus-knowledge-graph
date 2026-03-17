/**
 * Vector class for arbitrary-dimensional vector mathematics.
 */
export class Vector {
  private readonly data: Float64Array;

  constructor(components: number[]) {
    this.data = new Float64Array(components);
  }

  get length(): number {
    return this.data.length;
  }

  get(index: number): number {
    const v = this.data[index];
    if (v === undefined) throw new RangeError(`Index ${index} out of bounds`);
    return v;
  }

  toArray(): number[] {
    return Array.from(this.data);
  }

  // --- Arithmetic ---

  add(other: Vector): Vector {
    assertSameDim(this, other);
    return new Vector(this.toArray().map((v, i) => v + other.get(i)));
  }

  subtract(other: Vector): Vector {
    assertSameDim(this, other);
    return new Vector(this.toArray().map((v, i) => v - other.get(i)));
  }

  scale(scalar: number): Vector {
    return new Vector(this.toArray().map((v) => v * scalar));
  }

  dot(other: Vector): number {
    assertSameDim(this, other);
    let sum = 0;
    for (let i = 0; i < this.length; i++) {
      sum += this.get(i) * other.get(i);
    }
    return sum;
  }

  // --- Norms ---

  magnitude(): number {
    return Math.sqrt(this.dot(this));
  }

  normalize(): Vector {
    const mag = this.magnitude();
    if (mag === 0) throw new Error("Cannot normalize zero vector");
    return this.scale(1 / mag);
  }

  // --- Distance & Similarity ---

  cosineSimilarity(other: Vector): number {
    assertSameDim(this, other);
    const magProduct = this.magnitude() * other.magnitude();
    if (magProduct === 0) throw new Error("Cannot compute cosine similarity with zero vector");
    return this.dot(other) / magProduct;
  }

  euclideanDistance(other: Vector): number {
    assertSameDim(this, other);
    return this.subtract(other).magnitude();
  }

  manhattanDistance(other: Vector): number {
    assertSameDim(this, other);
    let sum = 0;
    for (let i = 0; i < this.length; i++) {
      sum += Math.abs(this.get(i) - other.get(i));
    }
    return sum;
  }

  // --- Cross Product (3D only) ---

  cross(other: Vector): Vector {
    if (this.length !== 3 || other.length !== 3) {
      throw new Error("Cross product is only defined for 3D vectors");
    }
    const [a0, a1, a2] = [this.get(0), this.get(1), this.get(2)];
    const [b0, b1, b2] = [other.get(0), other.get(1), other.get(2)];
    return new Vector([
      a1 * b2 - a2 * b1,
      a2 * b0 - a0 * b2,
      a0 * b1 - a1 * b0,
    ]);
  }

  // --- Angles ---

  angleTo(other: Vector): number {
    assertSameDim(this, other);
    const cos = Math.max(-1, Math.min(1, this.cosineSimilarity(other)));
    return Math.acos(cos);
  }

  // --- Projection ---

  projectOnto(other: Vector): Vector {
    assertSameDim(this, other);
    const otherMagSq = other.dot(other);
    if (otherMagSq === 0) throw new Error("Cannot project onto zero vector");
    return other.scale(this.dot(other) / otherMagSq);
  }

  // --- Element-wise ---

  multiply(other: Vector): Vector {
    assertSameDim(this, other);
    return new Vector(this.toArray().map((v, i) => v * other.get(i)));
  }

  divide(other: Vector): Vector {
    assertSameDim(this, other);
    return new Vector(
      this.toArray().map((v, i) => {
        const d = other.get(i);
        if (d === 0) throw new Error("Division by zero in element-wise divide");
        return v / d;
      })
    );
  }

  // --- Static Factories ---

  static zero(dim: number): Vector {
    return new Vector(new Array(dim).fill(0));
  }

  static ones(dim: number): Vector {
    return new Vector(new Array(dim).fill(1));
  }

  static random(dim: number, min = 0, max = 1): Vector {
    return new Vector(
      Array.from({ length: dim }, () => min + Math.random() * (max - min))
    );
  }

  static fromArray(arr: number[]): Vector {
    return new Vector(arr);
  }

  // --- Utility ---

  equals(other: Vector, epsilon = 1e-10): boolean {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) {
      if (Math.abs(this.get(i) - other.get(i)) > epsilon) return false;
    }
    return true;
  }

  toString(): string {
    return `Vector(${this.toArray().join(", ")})`;
  }

  clone(): Vector {
    return new Vector(this.toArray());
  }

  // --- Unary operations ---

  negate(): Vector {
    return this.scale(-1);
  }

  abs(): Vector {
    return new Vector(this.toArray().map(Math.abs));
  }

  sum(): number {
    return this.toArray().reduce((a, b) => a + b, 0);
  }

  min(): number {
    return Math.min(...this.toArray());
  }

  max(): number {
    return Math.max(...this.toArray());
  }

  map(fn: (value: number, index: number) => number): Vector {
    return new Vector(this.toArray().map(fn));
  }
}

function assertSameDim(a: Vector, b: Vector): void {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }
}
