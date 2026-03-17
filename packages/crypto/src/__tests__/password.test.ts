import { describe, it, expect } from "vitest";
import {
  hashPassword, verifyPassword,
  scorePassword,
  enforcePolicy,
  generatePassphrase, generateStrongPassphrase,
  checkBreach,
} from "../password.js";

describe("hashPassword / verifyPassword", () => {
  it("hashes a password", () => {
    const { hash } = hashPassword("my-secret-password");
    expect(typeof hash).toBe("string");
    expect(hash.startsWith("scrypt:")).toBe(true);
  });

  it("verifies correct password", () => {
    const { hash } = hashPassword("correct-horse");
    expect(verifyPassword("correct-horse", { hash })).toBe(true);
  });

  it("rejects incorrect password", () => {
    const { hash } = hashPassword("correct-horse");
    expect(verifyPassword("wrong-horse", { hash })).toBe(false);
  });

  it("different hashes for same password (random salt)", () => {
    const h1 = hashPassword("same").hash;
    const h2 = hashPassword("same").hash;
    expect(h1).not.toBe(h2);
  });

  it("returns false for malformed hash", () => {
    expect(verifyPassword("password", { hash: "invalid" })).toBe(false);
  });

  it("handles empty password", () => {
    const { hash } = hashPassword("");
    expect(verifyPassword("", { hash })).toBe(true);
    expect(verifyPassword("a", { hash })).toBe(false);
  });

  it("handles unicode passwords", () => {
    const pw = "p@$$w0rd!🔐";
    const { hash } = hashPassword(pw);
    expect(verifyPassword(pw, { hash })).toBe(true);
  });
}, { timeout: 30000 });

describe("scorePassword", () => {
  it("very weak password gets low score", () => {
    const { score, level } = scorePassword("123456");
    expect(score).toBeLessThan(40);
    expect(level).toMatch(/very-weak|weak/);
  });

  it("strong password gets high score", () => {
    const { score, level } = scorePassword("X7!kqM#2vZ@pLn9r");
    expect(score).toBeGreaterThan(60);
    expect(level).toMatch(/strong|very-strong/);
  });

  it("common password gets capped score", () => {
    const { score } = scorePassword("password");
    expect(score).toBeLessThanOrEqual(15);
  });

  it("score between 0 and 100", () => {
    const tests = ["a", "abc123", "Password1!", "G!$8xLqm#2Zp@K7n"];
    for (const pw of tests) {
      const { score } = scorePassword(pw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("provides feedback for weak passwords", () => {
    const { feedback } = scorePassword("abc");
    expect(feedback.length).toBeGreaterThan(0);
  });

  it("length bonus increases score", () => {
    const short = scorePassword("Abc!1234").score;
    const long = scorePassword("Abc!1234Abc!1234").score;
    expect(long).toBeGreaterThan(short);
  });
});

describe("enforcePolicy", () => {
  it("passes a strong password with strict policy", () => {
    const result = enforcePolicy("Str0ng!Pass#2024", {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecial: true,
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when too short", () => {
    const result = enforcePolicy("abc", { minLength: 8 });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("8"))).toBe(true);
  });

  it("fails when missing uppercase", () => {
    const result = enforcePolicy("lowercase123!", { requireUppercase: true });
    expect(result.valid).toBe(false);
  });

  it("fails when missing special chars", () => {
    const result = enforcePolicy("NoSpecial123", { requireSpecial: true });
    expect(result.valid).toBe(false);
  });

  it("fails for common password", () => {
    const result = enforcePolicy("password", { disallowCommon: true });
    expect(result.valid).toBe(false);
  });

  it("passes for common password when disallowCommon is false", () => {
    const result = enforcePolicy("password", { disallowCommon: false, minLength: 1 });
    // May still fail for other reasons, but not for common
    expect(result.violations.every((v) => !v.includes("common"))).toBe(true);
  });

  it("collects multiple violations", () => {
    const result = enforcePolicy("a", {
      minLength: 10,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecial: true,
    });
    expect(result.violations.length).toBeGreaterThan(2);
  });
});

describe("generatePassphrase", () => {
  it("generates passphrase with correct word count", () => {
    const passphrase = generatePassphrase(4);
    const words = passphrase.split("-");
    expect(words).toHaveLength(4);
  });

  it("uses custom separator", () => {
    const passphrase = generatePassphrase(3, " ");
    expect(passphrase.split(" ")).toHaveLength(3);
  });

  it("generates different passphrases", () => {
    const p1 = generatePassphrase(4);
    const p2 = generatePassphrase(4);
    // Very unlikely to be same
    expect(p1).not.toBe(p2);
  });

  it("words are lowercase strings", () => {
    const passphrase = generatePassphrase(4);
    const words = passphrase.split("-");
    for (const word of words) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });
});

describe("generateStrongPassphrase", () => {
  it("generates passphrase with numbers", () => {
    const phrase = generateStrongPassphrase(4);
    expect(/\d{4}/.test(phrase)).toBe(true);
  });

  it("has the expected segment count", () => {
    const phrase = generateStrongPassphrase(4);
    expect(phrase.split("-")).toHaveLength(4);
  });
});

describe("checkBreach (placeholder)", () => {
  it("returns breach check result", async () => {
    const result = await checkBreach("somepassword");
    expect(typeof result.breached).toBe("boolean");
  });
});
