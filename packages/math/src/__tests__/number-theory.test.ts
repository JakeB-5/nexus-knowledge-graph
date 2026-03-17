import { describe, it, expect } from "vitest";
import {
  isPrime, primeFactors, nextPrime, primesUpTo,
  gcd, lcm,
  modPow, modInverse,
  fibonacci, fibonacciMatrix,
  factorial, combination, permutation,
  catalanNumber, eulerTotient,
  areCoprime, digitalRoot, sumOfDivisors, isPerfect,
} from "../number-theory.js";

describe("isPrime", () => {
  it("correctly identifies primes", () => {
    expect(isPrime(2)).toBe(true);
    expect(isPrime(3)).toBe(true);
    expect(isPrime(5)).toBe(true);
    expect(isPrime(7)).toBe(true);
    expect(isPrime(11)).toBe(true);
    expect(isPrime(97)).toBe(true);
  });

  it("correctly identifies non-primes", () => {
    expect(isPrime(0)).toBe(false);
    expect(isPrime(1)).toBe(false);
    expect(isPrime(4)).toBe(false);
    expect(isPrime(9)).toBe(false);
    expect(isPrime(100)).toBe(false);
  });
});

describe("primeFactors", () => {
  it("returns factors of 12", () => {
    expect(primeFactors(12)).toEqual([2, 2, 3]);
  });

  it("returns factor of prime", () => {
    expect(primeFactors(7)).toEqual([7]);
  });

  it("returns empty for 1", () => {
    expect(primeFactors(1)).toEqual([]);
  });

  it("returns factors of 360", () => {
    expect(primeFactors(360)).toEqual([2, 2, 2, 3, 3, 5]);
  });
});

describe("nextPrime", () => {
  it("next prime after 10 is 11", () => {
    expect(nextPrime(10)).toBe(11);
  });

  it("next prime after 2 is 3", () => {
    expect(nextPrime(2)).toBe(3);
  });

  it("next prime after 0 is 2", () => {
    expect(nextPrime(0)).toBe(2);
  });
});

describe("primesUpTo", () => {
  it("returns primes up to 10", () => {
    expect(primesUpTo(10)).toEqual([2, 3, 5, 7]);
  });

  it("returns empty for n < 2", () => {
    expect(primesUpTo(1)).toEqual([]);
  });
});

describe("gcd and lcm", () => {
  it("gcd(12, 8) = 4", () => {
    expect(gcd(12, 8)).toBe(4);
  });

  it("gcd(7, 13) = 1 (coprime)", () => {
    expect(gcd(7, 13)).toBe(1);
  });

  it("lcm(4, 6) = 12", () => {
    expect(lcm(4, 6)).toBe(12);
  });

  it("lcm(0, 5) = 0", () => {
    expect(lcm(0, 5)).toBe(0);
  });
});

describe("modPow", () => {
  it("2^10 mod 1000 = 24", () => {
    expect(modPow(2, 10, 1000)).toBe(24);
  });

  it("3^4 mod 5 = 1", () => {
    expect(modPow(3, 4, 5)).toBe(1);
  });

  it("any mod 1 = 0", () => {
    expect(modPow(12345, 67890, 1)).toBe(0);
  });
});

describe("modInverse", () => {
  it("modInverse(3, 7) = 5", () => {
    expect(modInverse(3, 7)).toBe(5);
    expect((3 * 5) % 7).toBe(1);
  });

  it("throws when inverse does not exist", () => {
    expect(() => modInverse(2, 4)).toThrow();
  });
});

describe("fibonacci", () => {
  it("fib(0) = 0", () => {
    expect(fibonacci(0)).toBe(0n);
  });

  it("fib(1) = 1", () => {
    expect(fibonacci(1)).toBe(1n);
  });

  it("fib(10) = 55", () => {
    expect(fibonacci(10)).toBe(55n);
  });

  it("fib(50) matches matrix exponentiation", () => {
    expect(fibonacci(50)).toBe(fibonacciMatrix(50));
  });

  it("throws for negative input", () => {
    expect(() => fibonacci(-1)).toThrow();
  });
});

describe("fibonacciMatrix", () => {
  it("fib(0) = 0", () => {
    expect(fibonacciMatrix(0)).toBe(0n);
  });

  it("fib(20) = 6765", () => {
    expect(fibonacciMatrix(20)).toBe(6765n);
  });
});

describe("factorial", () => {
  it("factorial(0) = 1", () => {
    expect(factorial(0)).toBe(1n);
  });

  it("factorial(5) = 120", () => {
    expect(factorial(5)).toBe(120n);
  });

  it("factorial(10) = 3628800", () => {
    expect(factorial(10)).toBe(3628800n);
  });

  it("throws for negative", () => {
    expect(() => factorial(-1)).toThrow();
  });
});

describe("combination", () => {
  it("C(5,2) = 10", () => {
    expect(combination(5, 2)).toBe(10n);
  });

  it("C(10,0) = 1", () => {
    expect(combination(10, 0)).toBe(1n);
  });

  it("C(n,n) = 1", () => {
    expect(combination(7, 7)).toBe(1n);
  });

  it("C(n,r) where r > n = 0", () => {
    expect(combination(3, 5)).toBe(0n);
  });
});

describe("permutation", () => {
  it("P(5,2) = 20", () => {
    expect(permutation(5, 2)).toBe(20n);
  });

  it("P(n,0) = 1", () => {
    expect(permutation(5, 0)).toBe(1n);
  });

  it("P(n,n) = n!", () => {
    expect(permutation(4, 4)).toBe(24n);
  });
});

describe("catalanNumber", () => {
  it("C0=1, C1=1, C2=2, C3=5, C4=14", () => {
    expect(catalanNumber(0)).toBe(1n);
    expect(catalanNumber(1)).toBe(1n);
    expect(catalanNumber(2)).toBe(2n);
    expect(catalanNumber(3)).toBe(5n);
    expect(catalanNumber(4)).toBe(14n);
  });
});

describe("eulerTotient", () => {
  it("phi(1) = 1", () => {
    expect(eulerTotient(1)).toBe(1);
  });

  it("phi(prime) = prime - 1", () => {
    expect(eulerTotient(7)).toBe(6);
    expect(eulerTotient(13)).toBe(12);
  });

  it("phi(12) = 4", () => {
    expect(eulerTotient(12)).toBe(4);
  });
});

describe("utility functions", () => {
  it("areCoprime", () => {
    expect(areCoprime(7, 13)).toBe(true);
    expect(areCoprime(6, 9)).toBe(false);
  });

  it("digitalRoot", () => {
    expect(digitalRoot(0)).toBe(0);
    expect(digitalRoot(9)).toBe(9);
    expect(digitalRoot(18)).toBe(9);
    expect(digitalRoot(493)).toBe(7);
  });

  it("sumOfDivisors", () => {
    expect(sumOfDivisors(6)).toBe(12);   // 1+2+3+6
    expect(sumOfDivisors(1)).toBe(1);
  });

  it("isPerfect", () => {
    expect(isPerfect(6)).toBe(true);
    expect(isPerfect(28)).toBe(true);
    expect(isPerfect(12)).toBe(false);
  });
});
