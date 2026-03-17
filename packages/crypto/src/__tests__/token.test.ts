import { describe, it, expect, vi } from "vitest";
import {
  randomToken, randomTokenBase64Url, randomTokenUrlSafe, randomTokenBase62,
  generateApiKey, verifyApiKey,
  validateTokenFormat,
  hashTokenForStorage, verifyTokenHash,
  generateTOTP, verifyTOTP,
  generateHOTP,
  generateTimedToken, verifyTimedToken,
  generateNumericOTP,
} from "../token.js";
import { randomBytes } from "node:crypto";

describe("random token generation", () => {
  it("randomToken returns hex of correct length", () => {
    const t = randomToken(32);
    expect(t).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(/^[0-9a-f]+$/.test(t)).toBe(true);
  });

  it("randomToken generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => randomToken()));
    expect(tokens.size).toBe(100);
  });

  it("randomTokenBase64Url uses URL-safe chars", () => {
    const t = randomTokenBase64Url(32);
    expect(t).not.toContain("+");
    expect(t).not.toContain("/");
  });

  it("randomTokenUrlSafe uses base62-url charset", () => {
    const t = randomTokenUrlSafe(50);
    expect(t).toHaveLength(50);
    expect(/^[A-Za-z0-9\-_]+$/.test(t)).toBe(true);
  });

  it("randomTokenBase62 uses base62 charset", () => {
    const t = randomTokenBase62(50);
    expect(t).toHaveLength(50);
    expect(/^[A-Za-z0-9]+$/.test(t)).toBe(true);
  });
});

describe("API key generation", () => {
  it("generates key with correct prefix format", () => {
    const { key, prefix } = generateApiKey("sk");
    expect(key.startsWith("sk_")).toBe(true);
    expect(prefix.startsWith("sk_")).toBe(true);
  });

  it("key is longer than prefix", () => {
    const { key, prefix } = generateApiKey("ak");
    expect(key.length).toBeGreaterThan(prefix.length);
  });

  it("returns hash for storage", () => {
    const { hash } = generateApiKey();
    expect(hash).toHaveLength(64);
  });

  it("verifyApiKey returns true for valid key", () => {
    const { key, hash } = generateApiKey();
    expect(verifyApiKey(key, hash)).toBe(true);
  });

  it("verifyApiKey returns false for wrong key", () => {
    const { hash } = generateApiKey();
    expect(verifyApiKey("wrong_key", hash)).toBe(false);
  });

  it("generates unique keys", () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(k1.key).not.toBe(k2.key);
  });
});

describe("token validation", () => {
  it("validates correct hex token", () => {
    const token = randomToken(32);
    const result = validateTokenFormat(token, 32);
    expect(result.valid).toBe(true);
  });

  it("rejects token with wrong length", () => {
    const result = validateTokenFormat("abc", 32);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("rejects non-hex token", () => {
    const result = validateTokenFormat("g".repeat(64), 32);
    expect(result.valid).toBe(false);
  });
});

describe("token hashing for storage", () => {
  it("hashes token deterministically", () => {
    const token = randomToken();
    expect(hashTokenForStorage(token)).toBe(hashTokenForStorage(token));
  });

  it("verifyTokenHash returns true for matching token", () => {
    const token = randomToken();
    const hash = hashTokenForStorage(token);
    expect(verifyTokenHash(token, hash)).toBe(true);
  });

  it("verifyTokenHash returns false for wrong token", () => {
    const token = randomToken();
    const hash = hashTokenForStorage(token);
    expect(verifyTokenHash("wrong", hash)).toBe(false);
  });
});

describe("HOTP", () => {
  it("generates 6-digit code", () => {
    const secret = randomBytes(20);
    const code = generateHOTP(secret, 0);
    expect(code).toHaveLength(6);
    expect(/^\d+$/.test(code)).toBe(true);
  });

  it("different counters produce different codes", () => {
    const secret = randomBytes(20);
    const c0 = generateHOTP(secret, 0);
    const c1 = generateHOTP(secret, 1);
    expect(c0).not.toBe(c1);
  });

  it("same counter produces same code", () => {
    const secret = randomBytes(20);
    expect(generateHOTP(secret, 42)).toBe(generateHOTP(secret, 42));
  });

  it("supports custom digit count", () => {
    const secret = randomBytes(20);
    const code = generateHOTP(secret, 0, { digits: 8 });
    expect(code).toHaveLength(8);
  });
});

describe("TOTP", () => {
  it("generates 6-digit TOTP code", () => {
    const secret = randomBytes(20);
    const code = generateTOTP(secret);
    expect(code).toHaveLength(6);
    expect(/^\d+$/.test(code)).toBe(true);
  });

  it("verifies a valid TOTP code", () => {
    const secret = randomBytes(20);
    const code = generateTOTP(secret);
    expect(verifyTOTP(code, secret)).toBe(true);
  });

  it("rejects invalid TOTP code", () => {
    const secret = randomBytes(20);
    expect(verifyTOTP("000000", secret)).toBe(false);
  });
});

describe("timed tokens (magic links)", () => {
  it("generates and verifies a valid timed token", () => {
    const signingKey = randomBytes(32);
    const timed = generateTimedToken("user@example.com", signingKey);
    const result = verifyTimedToken(timed, "user@example.com", signingKey);
    expect(result.valid).toBe(true);
  });

  it("fails with wrong payload", () => {
    const signingKey = randomBytes(32);
    const timed = generateTimedToken("user@example.com", signingKey);
    const result = verifyTimedToken(timed, "other@example.com", signingKey);
    expect(result.valid).toBe(false);
  });

  it("fails with wrong signing key", () => {
    const signingKey = randomBytes(32);
    const wrongKey = randomBytes(32);
    const timed = generateTimedToken("user@example.com", signingKey);
    const result = verifyTimedToken(timed, "user@example.com", wrongKey);
    expect(result.valid).toBe(false);
  });

  it("fails after expiry", () => {
    const signingKey = randomBytes(32);
    const timed = generateTimedToken("user@example.com", signingKey, -1000); // already expired
    const result = verifyTimedToken(timed, "user@example.com", signingKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expired");
  });
});

describe("numeric OTP", () => {
  it("generates numeric OTP of correct length", () => {
    const otp = generateNumericOTP(6);
    expect(otp).toHaveLength(6);
    expect(/^\d+$/.test(otp)).toBe(true);
  });

  it("supports different lengths", () => {
    expect(generateNumericOTP(4)).toHaveLength(4);
    expect(generateNumericOTP(8)).toHaveLength(8);
  });
});
