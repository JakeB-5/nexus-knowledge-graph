/**
 * Seedable PRNG and distribution utilities.
 * Uses Xoshiro256** algorithm.
 */

function toBigUint64(n: bigint): bigint {
  return BigInt.asUintN(64, n);
}

function rotl(x: bigint, k: bigint): bigint {
  return toBigUint64((x << k) | (x >> (64n - k)));
}

export class Random {
  private s: [bigint, bigint, bigint, bigint];

  constructor(seed?: number | string) {
    // Initialize state from seed using splitmix64
    let s = seed !== undefined ? this.hashSeed(seed) : BigInt(Date.now()) ^ BigInt(Math.floor(Math.random() * 2 ** 32));
    this.s = [0n, 0n, 0n, 0n];
    for (let i = 0; i < 4; i++) {
      s = toBigUint64(s + 0x9e3779b97f4a7c15n);
      let z = s;
      z = toBigUint64((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
      z = toBigUint64((z ^ (z >> 27n)) * 0x94d049bb133111ebn);
      z = z ^ (z >> 31n);
      this.s[i] = z;
    }
  }

  private hashSeed(seed: number | string): bigint {
    if (typeof seed === "number") return BigInt(Math.floor(seed)) & 0xffffffffffffffffn;
    let h = 0n;
    for (let i = 0; i < seed.length; i++) {
      h = toBigUint64(h * 31n + BigInt(seed.charCodeAt(i)));
    }
    return h;
  }

  /** Returns a random uint64 via Xoshiro256** */
  private nextUint64(): bigint {
    const result = toBigUint64(rotl(toBigUint64(this.s[1]! * 5n), 7n) * 9n);
    const t = toBigUint64(this.s[1]! << 17n);
    this.s[2] = toBigUint64(this.s[2]! ^ this.s[0]!);
    this.s[3] = toBigUint64(this.s[3]! ^ this.s[1]!);
    this.s[1] = toBigUint64(this.s[1]! ^ this.s[2]!);
    this.s[0] = toBigUint64(this.s[0]! ^ this.s[3]!);
    this.s[2] = toBigUint64(this.s[2]! ^ t);
    this.s[3] = rotl(this.s[3]!, 45n);
    return result;
  }

  /** Uniform float in [0, 1) */
  float(): number {
    return Number(this.nextUint64() >> 11n) / 2 ** 53;
  }

  /** Uniform float in [min, max) */
  floatRange(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive */
  int(min: number, max: number): number {
    if (min > max) throw new Error("min must be <= max");
    return Math.floor(this.floatRange(min, max + 1 - 1e-15));
  }

  /** Normal distribution via Box-Muller transform */
  normal(mean = 0, stddev = 1): number {
    const u1 = Math.max(this.float(), 1e-15);
    const u2 = this.float();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stddev * z;
  }

  /** Exponential distribution with given rate λ */
  exponential(lambda = 1): number {
    if (lambda <= 0) throw new Error("lambda must be positive");
    return -Math.log(Math.max(this.float(), 1e-15)) / lambda;
  }

  /** Poisson distribution with given mean λ */
  poisson(lambda: number): number {
    if (lambda <= 0) throw new Error("lambda must be positive");
    // Knuth algorithm for small lambda
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      while (p > L) {
        k++;
        p *= this.float();
      }
      return k - 1;
    }
    // Normal approximation for large lambda
    return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
  }

  /** Power law distribution: P(x) ~ x^(-alpha), x >= xmin */
  powerLaw(alpha: number, xMin = 1): number {
    if (alpha <= 1) throw new Error("alpha must be > 1");
    return xMin * Math.pow(1 - this.float(), -1 / (alpha - 1));
  }

  /** Pick a random element from array (uniform) */
  choice<T>(arr: T[]): T {
    if (arr.length === 0) throw new Error("Cannot choose from empty array");
    return arr[this.int(0, arr.length - 1)]!;
  }

  /** Pick a random element with weights */
  weightedChoice<T>(items: T[], weights: number[]): T {
    if (items.length !== weights.length) throw new Error("Items and weights must have same length");
    if (items.length === 0) throw new Error("Cannot choose from empty array");
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) throw new Error("Total weight must be positive");
    let r = this.float() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  /** Fisher-Yates shuffle (in-place, returns new array) */
  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }

  /** Generate a random UUID v4 */
  uuid(): string {
    const hex = () => this.int(0, 15).toString(16);
    const hex2 = () => hex() + hex();
    const hex4 = () => hex2() + hex2();
    const hex8 = () => hex4() + hex4();
    const variant = (this.int(8, 11)).toString(16);
    return `${hex8()}-${hex4()}-4${hex2()}${hex()}-${variant}${hex2()}${hex()}-${hex8()}${hex4()}`;
  }

  /** Generate a random string of given length from charset */
  string(length: number, charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"): string {
    return Array.from({ length }, () => charset[this.int(0, charset.length - 1)]!).join("");
  }

  /** Sample k elements from array without replacement */
  sample<T>(arr: T[], k: number): T[] {
    if (k > arr.length) throw new Error("k cannot exceed array length");
    return this.shuffle(arr).slice(0, k);
  }

  /** Generate array of n random floats in [min, max) */
  floatArray(n: number, min = 0, max = 1): number[] {
    return Array.from({ length: n }, () => this.floatRange(min, max));
  }

  /** Generate array of n random integers in [min, max] */
  intArray(n: number, min: number, max: number): number[] {
    return Array.from({ length: n }, () => this.int(min, max));
  }
}

/** Default global Random instance */
export const random = new Random();
