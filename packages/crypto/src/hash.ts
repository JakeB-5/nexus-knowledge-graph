/**
 * Hashing utilities: SHA-256, MD5, HMAC, Murmur3, content hashing.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { BinaryLike } from "node:crypto";

// --- SHA-256 ---

export function sha256(data: BinaryLike): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256Base64(data: BinaryLike): string {
  return createHash("sha256").update(data).digest("base64");
}

export function sha256Base64Url(data: BinaryLike): string {
  return createHash("sha256").update(data).digest("base64url");
}

export function sha256Buffer(data: BinaryLike): Buffer {
  return createHash("sha256").update(data).digest();
}

// --- MD5 (non-security checksum only) ---

export function md5(data: BinaryLike): string {
  return createHash("md5").update(data).digest("hex");
}

export function md5Base64(data: BinaryLike): string {
  return createHash("md5").update(data).digest("base64");
}

// --- SHA-512 ---

export function sha512(data: BinaryLike): string {
  return createHash("sha512").update(data).digest("hex");
}

// --- HMAC-SHA256 ---

export function hmacSha256(key: BinaryLike, data: BinaryLike): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

export function hmacSha256Base64(key: BinaryLike, data: BinaryLike): string {
  return createHmac("sha256", key).update(data).digest("base64");
}

export function hmacSha256Buffer(key: BinaryLike, data: BinaryLike): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

// --- Content Hash (deduplication) ---

/**
 * Produces a deterministic content hash for any JSON-serializable value.
 * Stable key ordering ensures same hash for same logical content.
 */
export function contentHash(value: unknown): string {
  const serialized = JSON.stringify(value, (_, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      );
    }
    return v;
  });
  return sha256(serialized);
}

// --- Hash Comparison (constant-time) ---

/**
 * Compare two hex hash strings in constant time to prevent timing attacks.
 */
export function compareHashes(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// --- Hash Format Conversions ---

export function hexToBase64(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64");
}

export function hexToBase64Url(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64url");
}

export function base64ToHex(b64: string): string {
  return Buffer.from(b64, "base64").toString("hex");
}

// --- Stream Hashing ---

import { Transform } from "node:stream";

export interface HashStream {
  stream: Transform;
  digest: () => string;
  digestBuffer: () => Buffer;
}

/**
 * Creates a transform stream that passes data through while computing a hash.
 * Call digest() after the stream ends to get the hash.
 */
export function createHashStream(algorithm: "sha256" | "sha512" | "md5" = "sha256"): HashStream {
  const hash = createHash(algorithm);
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      this.push(chunk);
      callback();
    },
  });
  return {
    stream,
    digest: () => hash.digest("hex"),
    digestBuffer: () => hash.digest(),
  };
}

// --- Murmur3 (fast non-crypto hash for hash tables) ---

/**
 * MurmurHash3 32-bit implementation.
 * Good for hash tables and non-cryptographic purposes.
 */
export function murmur3(key: string, seed = 0): number {
  let h = seed;
  const len = key.length;
  let i = 0;

  while (i + 4 <= len) {
    let k =
      ((key.charCodeAt(i) & 0xff)) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);

    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);

    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;

    i += 4;
  }

  let k = 0;
  switch (len & 3) {
    case 3: k ^= (key.charCodeAt(i + 2) & 0xff) << 16; // fallthrough
    // eslint-disable-next-line no-fallthrough
    case 2: k ^= (key.charCodeAt(i + 1) & 0xff) << 8;  // fallthrough
    // eslint-disable-next-line no-fallthrough
    case 1:
      k ^= key.charCodeAt(i) & 0xff;
      k = Math.imul(k, 0xcc9e2d51);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, 0x1b873593);
      h ^= k;
  }

  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return h >>> 0; // Convert to unsigned 32-bit integer
}

export function murmur3Hex(key: string, seed = 0): string {
  return murmur3(key, seed).toString(16).padStart(8, "0");
}

// --- Combined / Utility ---

/** Hash multiple values together */
export function hashMany(...values: BinaryLike[]): string {
  const h = createHash("sha256");
  for (const v of values) h.update(v);
  return h.digest("hex");
}

/** Check if two values have the same content hash */
export function sameContent(a: unknown, b: unknown): boolean {
  return contentHash(a) === contentHash(b);
}
