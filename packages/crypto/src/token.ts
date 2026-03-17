/**
 * Secure token generation: API keys, OTP, time-based tokens, URL-safe tokens.
 */
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { sha256 } from "./hash.js";

// --- Constants ---
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE62_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// --- Random Token Generation ---

/** Generate a cryptographically secure random token of given byte length, returned as hex */
export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("hex");
}

/** Generate a URL-safe base64 token */
export function randomTokenBase64Url(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/** Generate a token using a custom charset */
function randomTokenFromCharset(length: number, charset: string): string {
  const bytes = randomBytes(length * 2); // extra bytes to avoid modulo bias
  let result = "";
  let i = 0;
  while (result.length < length) {
    const byte = bytes[i++ % bytes.length]!;
    // Rejection sampling to avoid modulo bias
    if (byte < Math.floor(256 / charset.length) * charset.length) {
      result += charset[byte % charset.length];
    }
  }
  return result;
}

/** Generate a URL-safe token using base62 chars */
export function randomTokenUrlSafe(length = 32): string {
  return randomTokenFromCharset(length, BASE62_URL);
}

/** Generate a base62 token */
export function randomTokenBase62(length = 32): string {
  return randomTokenFromCharset(length, BASE62);
}

// --- API Key Generation ---

export interface ApiKey {
  key: string;       // full key (show once)
  prefix: string;    // non-secret prefix for lookup
  hash: string;      // sha256 hash for storage
}

/**
 * Generate an API key with format: {prefix}_{randomBytes}
 * Only the hash is stored; the full key is shown once.
 */
export function generateApiKey(prefix = "sk"): ApiKey {
  const secret = randomTokenBase62(40);
  const key = `${prefix}_${secret}`;
  const hash = sha256(key);
  return { key, prefix: `${prefix}_${secret.slice(0, 8)}`, hash };
}

/** Verify an API key against its stored hash */
export function verifyApiKey(key: string, storedHash: string): boolean {
  const hash = sha256(key);
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}

// --- Token Validation ---

export interface TokenValidationResult {
  valid: boolean;
  reason?: string;
}

/** Validate token format (hex string of expected length) */
export function validateTokenFormat(token: string, expectedByteLength = 32): TokenValidationResult {
  const expectedHexLength = expectedByteLength * 2;
  if (typeof token !== "string") return { valid: false, reason: "Token must be a string" };
  if (token.length !== expectedHexLength) {
    return { valid: false, reason: `Token must be ${expectedHexLength} hex chars` };
  }
  if (!/^[0-9a-f]+$/i.test(token)) return { valid: false, reason: "Token must be hex" };
  return { valid: true };
}

// --- Token Hashing for Storage ---

/** Hash a token for safe storage (one-way) */
export function hashTokenForStorage(token: string): string {
  return sha256(`token:${token}`);
}

/** Verify a token against its stored hash */
export function verifyTokenHash(token: string, storedHash: string): boolean {
  const hash = hashTokenForStorage(token);
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}

// --- TOTP (Time-based One-Time Password) ---

export interface TOTPOptions {
  digits?: number;
  period?: number; // seconds
  algorithm?: "sha1" | "sha256" | "sha512";
}

/** Generate a TOTP code (RFC 6238) */
export function generateTOTP(
  secret: Buffer,
  options: TOTPOptions = {}
): string {
  const { digits = 6, period = 30, algorithm = "sha1" } = options;
  const counter = Math.floor(Date.now() / 1000 / period);
  return generateHOTP(secret, counter, { digits, algorithm });
}

/** Verify a TOTP code (allows 1 period drift) */
export function verifyTOTP(
  code: string,
  secret: Buffer,
  options: TOTPOptions = {}
): boolean {
  const { digits = 6, period = 30, algorithm = "sha1" } = options;
  const counter = Math.floor(Date.now() / 1000 / period);
  for (const drift of [-1, 0, 1]) {
    if (generateHOTP(secret, counter + drift, { digits, algorithm }) === code) return true;
  }
  return false;
}

// --- HOTP (HMAC-based One-Time Password) ---

export interface HOTPOptions {
  digits?: number;
  algorithm?: "sha1" | "sha256" | "sha512";
}

/** Generate an HOTP code (RFC 4226) */
export function generateHOTP(
  secret: Buffer,
  counter: number,
  options: HOTPOptions = {}
): string {
  const { digits = 6, algorithm = "sha1" } = options;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac(algorithm, secret).update(counterBuffer).digest();
  const offset = (hmac[hmac.length - 1]! & 0x0f);
  const code =
    (((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff)) %
    10 ** digits;

  return code.toString().padStart(digits, "0");
}

// --- Time-Based Magic Link Tokens ---

export interface TimedToken {
  token: string;
  expiresAt: number; // unix timestamp ms
  signature: string;
}

/**
 * Generate a time-limited signed token (for magic links, email verification, etc.)
 */
export function generateTimedToken(
  payload: string,
  signingKey: Buffer,
  ttlMs = 15 * 60 * 1000 // 15 minutes
): TimedToken {
  const token = randomTokenBase64Url(24);
  const expiresAt = Date.now() + ttlMs;
  const message = `${token}:${payload}:${expiresAt}`;
  const signature = createHmac("sha256", signingKey).update(message).digest("hex");
  return { token, expiresAt, signature };
}

/** Verify a timed token's signature and expiry */
export function verifyTimedToken(
  timedToken: TimedToken,
  payload: string,
  signingKey: Buffer
): { valid: boolean; reason?: string } {
  if (Date.now() > timedToken.expiresAt) {
    return { valid: false, reason: "Token expired" };
  }
  const message = `${timedToken.token}:${payload}:${timedToken.expiresAt}`;
  const expectedSig = createHmac("sha256", signingKey).update(message).digest("hex");
  try {
    const valid = timingSafeEqual(
      Buffer.from(timedToken.signature, "hex"),
      Buffer.from(expectedSig, "hex")
    );
    return valid ? { valid: true } : { valid: false, reason: "Invalid signature" };
  } catch {
    return { valid: false, reason: "Invalid signature format" };
  }
}

// --- Numeric OTP ---

/** Generate a random numeric OTP of given length */
export function generateNumericOTP(digits = 6): string {
  const max = 10 ** digits;
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % max;
  return num.toString().padStart(digits, "0");
}
