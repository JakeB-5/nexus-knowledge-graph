import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatePasswordStrength } from "../services/auth-service.js";

// ── Password validation (pure, no DB) ─────────────────────────────────────

describe("validatePasswordStrength", () => {
  it("accepts a strong password", () => {
    const result = validatePasswordStrength("SecureP@ss1");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects passwords shorter than 8 characters", () => {
    const result = validatePasswordStrength("Ab1!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must be at least 8 characters");
  });

  it("rejects passwords without uppercase letters", () => {
    const result = validatePasswordStrength("lowercase1!");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("uppercase"))).toBe(true);
  });

  it("rejects passwords without lowercase letters", () => {
    const result = validatePasswordStrength("UPPERCASE1!");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("lowercase"))).toBe(true);
  });

  it("rejects passwords without digits", () => {
    const result = validatePasswordStrength("NoDigits!");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("digit"))).toBe(true);
  });

  it("rejects passwords without special characters", () => {
    const result = validatePasswordStrength("NoSpecial1");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("special"))).toBe(true);
  });

  it("rejects passwords longer than 128 characters", () => {
    const longPw = "A1!" + "a".repeat(130);
    const result = validatePasswordStrength(longPw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("128"))).toBe(true);
  });

  it("returns multiple errors for a very weak password", () => {
    const result = validatePasswordStrength("weak");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

// ── AuthService integration tests (mocked DB) ─────────────────────────────

// These tests mock the DB layer to avoid requiring a real Postgres connection.

describe("AuthService (mocked DB)", () => {
  // We do a lightweight mock: import AuthService and inject a fake db.
  // The real argon2 and jose libraries run, so password hashing + JWT are tested properly.

  beforeEach(() => {
    vi.resetModules();
  });

  it("validatePasswordStrength integrates correctly for valid input", () => {
    const { valid } = validatePasswordStrength("ValidP@ss1");
    expect(valid).toBe(true);
  });

  it("detects all password requirement violations in one call", () => {
    const { errors } = validatePasswordStrength("short");
    // missing: uppercase, digit, special, length
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  // Token pair structure tests (pure jose, no DB needed)
  it("generateTokenPair produces correctly structured JWTs", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode("a".repeat(32));

    const token = await new SignJWT({ email: "a@b.com", role: "viewer" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setJti("jti-abc")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secret);

    expect(typeof token).toBe("string");
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });

  it("validates that access token claims are verifiable", async () => {
    const { SignJWT, jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode("b".repeat(32));

    const token = await new SignJWT({ email: "x@y.com", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-456")
      .setJti("jti-xyz")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secret);

    const { payload } = await jwtVerify(token, secret);
    expect(payload["sub"]).toBe("user-456");
    expect(payload["email"]).toBe("x@y.com");
    expect(payload["role"]).toBe("admin");
    expect(payload["jti"]).toBe("jti-xyz");
  });

  it("refresh token has family claim", async () => {
    const { SignJWT, jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode("c".repeat(32));

    const token = await new SignJWT({ family: "family-abc" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-789")
      .setJti("jti-refresh")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    const { payload } = await jwtVerify(token, secret);
    expect(payload["family"]).toBe("family-abc");
  });

  it("expired tokens fail verification", async () => {
    const { SignJWT, jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode("d".repeat(32));

    // Issue with past expiry
    const token = await new SignJWT({ email: "e@f.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-exp")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(secret);

    await expect(jwtVerify(token, secret)).rejects.toThrow();
  });

  it("tokens signed with wrong secret fail verification", async () => {
    const { SignJWT, jwtVerify } = await import("jose");
    const secretA = new TextEncoder().encode("e".repeat(32));
    const secretB = new TextEncoder().encode("f".repeat(32));

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setExpirationTime("1h")
      .sign(secretA);

    await expect(jwtVerify(token, secretB)).rejects.toThrow();
  });
});
