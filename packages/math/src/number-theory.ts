/**
 * Number theory utilities: primes, modular arithmetic, combinatorics.
 */

// --- Prime Utilities ---

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

export function primeFactors(n: number): number[] {
  if (n < 2) return [];
  const factors: number[] = [];
  let remaining = n;
  for (let f = 2; f * f <= remaining; f++) {
    while (remaining % f === 0) {
      factors.push(f);
      remaining = Math.floor(remaining / f);
    }
  }
  if (remaining > 1) factors.push(remaining);
  return factors;
}

export function nextPrime(n: number): number {
  let candidate = Math.max(2, n + 1);
  while (!isPrime(candidate)) candidate++;
  return candidate;
}

export function primesUpTo(n: number): number[] {
  if (n < 2) return [];
  // Sieve of Eratosthenes
  const sieve = new Uint8Array(n + 1).fill(1);
  sieve[0] = 0;
  sieve[1] = 0;
  for (let i = 2; i * i <= n; i++) {
    if (sieve[i]) {
      for (let j = i * i; j <= n; j += i) sieve[j] = 0;
    }
  }
  const primes: number[] = [];
  for (let i = 2; i <= n; i++) {
    if (sieve[i]) primes.push(i);
  }
  return primes;
}

// --- GCD / LCM ---

export function gcd(a: number, b: number): number {
  a = Math.abs(Math.floor(a));
  b = Math.abs(Math.floor(b));
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

// --- Modular Arithmetic ---

/** Computes base^exp mod modulus using fast exponentiation */
export function modPow(base: number, exp: number, modulus: number): number {
  if (modulus === 1) return 0;
  let result = 1n;
  let b = BigInt(base) % BigInt(modulus);
  let e = BigInt(exp);
  const m = BigInt(modulus);
  b = ((b % m) + m) % m;
  while (e > 0n) {
    if (e % 2n === 1n) result = (result * b) % m;
    e = e / 2n;
    b = (b * b) % m;
  }
  return Number(result);
}

/** Modular inverse using extended Euclidean algorithm */
export function modInverse(a: number, m: number): number {
  const [g, x] = extendedGcd(((a % m) + m) % m, m);
  if (g !== 1) throw new Error(`Modular inverse does not exist for a=${a}, m=${m}`);
  return ((x % m) + m) % m;
}

function extendedGcd(a: number, b: number): [number, number, number] {
  if (a === 0) return [b, 0, 1];
  const [g, x1, y1] = extendedGcd(b % a, a);
  return [g, y1 - Math.floor(b / a) * x1, x1];
}

// --- Fibonacci ---

const fibCache = new Map<number, bigint>([[0, 0n], [1, 1n]]);

export function fibonacci(n: number): bigint {
  if (n < 0) throw new Error("Fibonacci not defined for negative integers");
  if (fibCache.has(n)) return fibCache.get(n)!;
  const result = fibonacci(n - 1) + fibonacci(n - 2);
  fibCache.set(n, result);
  return result;
}

/** Fast Fibonacci via matrix exponentiation — O(log n) */
export function fibonacciMatrix(n: number): bigint {
  if (n < 0) throw new Error("Fibonacci not defined for negative integers");
  if (n === 0) return 0n;
  if (n === 1) return 1n;
  // [[1,1],[1,0]]^n gives [[F(n+1),F(n)],[F(n),F(n-1)]]
  const result = matPow([[1n, 1n], [1n, 0n]], n);
  return result[0]![1]!;
}

type Mat2x2 = [[bigint, bigint], [bigint, bigint]];

function matMul(a: Mat2x2, b: Mat2x2): Mat2x2 {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
  ];
}

function matPow(m: Mat2x2, n: number): Mat2x2 {
  if (n === 1) return m;
  if (n % 2 === 0) {
    const half = matPow(m, n / 2);
    return matMul(half, half);
  }
  return matMul(m, matPow(m, n - 1));
}

// --- Combinatorics ---

const factCache = new Map<number, bigint>([[0, 1n], [1, 1n]]);

export function factorial(n: number): bigint {
  if (n < 0) throw new Error("Factorial not defined for negative integers");
  if (factCache.has(n)) return factCache.get(n)!;
  const result = BigInt(n) * factorial(n - 1);
  factCache.set(n, result);
  return result;
}

export function factorialApprox(n: number): number {
  if (n < 0) throw new Error("Factorial not defined for negative integers");
  return Number(factorial(Math.min(n, 170))) || Infinity;
}

/** Binomial coefficient C(n, r) */
export function combination(n: number, r: number): bigint {
  if (r < 0 || r > n) return 0n;
  if (r === 0 || r === n) return 1n;
  r = Math.min(r, n - r); // optimization
  let result = 1n;
  for (let i = 0; i < r; i++) {
    result = (result * BigInt(n - i)) / BigInt(i + 1);
  }
  return result;
}

/** Permutation P(n, r) */
export function permutation(n: number, r: number): bigint {
  if (r < 0 || r > n) return 0n;
  let result = 1n;
  for (let i = 0; i < r; i++) {
    result *= BigInt(n - i);
  }
  return result;
}

// --- Catalan Numbers ---

export function catalanNumber(n: number): bigint {
  if (n < 0) throw new Error("Catalan number not defined for negative n");
  return combination(2 * n, n) / BigInt(n + 1);
}

// --- Euler's Totient Function ---

export function eulerTotient(n: number): number {
  if (n <= 0) throw new Error("Euler totient requires positive integer");
  let result = n;
  let p = 2;
  let temp = n;
  while (p * p <= temp) {
    if (temp % p === 0) {
      while (temp % p === 0) temp = Math.floor(temp / p);
      result -= Math.floor(result / p);
    }
    p++;
  }
  if (temp > 1) result -= Math.floor(result / temp);
  return result;
}

/** Check if two numbers are coprime */
export function areCoprime(a: number, b: number): boolean {
  return gcd(a, b) === 1;
}

/** Digital root of a number */
export function digitalRoot(n: number): number {
  if (n === 0) return 0;
  const r = n % 9;
  return r === 0 ? 9 : r;
}

/** Sum of divisors */
export function sumOfDivisors(n: number): number {
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      sum += i;
      if (i !== n / i) sum += n / i;
    }
  }
  return sum;
}

/** Check if n is a perfect number */
export function isPerfect(n: number): boolean {
  return n > 1 && sumOfDivisors(n) - n === n;
}
