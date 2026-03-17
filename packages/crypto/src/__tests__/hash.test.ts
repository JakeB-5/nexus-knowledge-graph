import { describe, it, expect } from "vitest";
import {
  sha256, sha256Base64, sha256Base64Url, sha256Buffer,
  md5, md5Base64,
  hmacSha256, hmacSha256Base64,
  contentHash, compareHashes,
  hexToBase64, hexToBase64Url, base64ToHex,
  murmur3, murmur3Hex,
  hashMany, sameContent,
  createHashStream,
} from "../hash.js";

describe("sha256", () => {
  it("produces correct hex hash", () => {
    expect(sha256("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("produces same hash for same input", () => {
    expect(sha256("test")).toBe(sha256("test"));
  });

  it("produces different hashes for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  it("base64 encoding", () => {
    const hex = sha256("hello");
    const b64 = sha256Base64("hello");
    expect(Buffer.from(b64, "base64").toString("hex")).toBe(hex);
  });

  it("base64url encoding", () => {
    const b64url = sha256Base64Url("hello");
    expect(b64url).not.toContain("+");
    expect(b64url).not.toContain("/");
  });

  it("buffer output", () => {
    const buf = sha256Buffer("hello");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(32);
  });
});

describe("md5", () => {
  it("produces correct md5 hash", () => {
    expect(md5("hello")).toBe("5d41402abc4b2a76b9719d911017c592");
  });

  it("base64 encoding", () => {
    const b64 = md5Base64("hello");
    expect(typeof b64).toBe("string");
  });
});

describe("hmacSha256", () => {
  it("produces correct HMAC", () => {
    const mac = hmacSha256("secret", "message");
    expect(mac).toHaveLength(64);
  });

  it("same key + data = same HMAC", () => {
    expect(hmacSha256("key", "data")).toBe(hmacSha256("key", "data"));
  });

  it("different key = different HMAC", () => {
    expect(hmacSha256("key1", "data")).not.toBe(hmacSha256("key2", "data"));
  });

  it("base64 encoding", () => {
    const b64 = hmacSha256Base64("key", "data");
    expect(typeof b64).toBe("string");
    expect(b64.length).toBeGreaterThan(0);
  });
});

describe("contentHash", () => {
  it("same object = same hash", () => {
    const obj = { b: 2, a: 1 };
    expect(contentHash(obj)).toBe(contentHash(obj));
  });

  it("key order independent", () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });

  it("different content = different hash", () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });

  it("works with arrays", () => {
    expect(contentHash([1, 2, 3])).toBe(contentHash([1, 2, 3]));
    expect(contentHash([1, 2, 3])).not.toBe(contentHash([3, 2, 1]));
  });
});

describe("compareHashes", () => {
  it("returns true for equal hashes", () => {
    const h = sha256("test");
    expect(compareHashes(h, h)).toBe(true);
  });

  it("returns false for different hashes", () => {
    expect(compareHashes(sha256("a"), sha256("b"))).toBe(false);
  });

  it("returns false for different length", () => {
    expect(compareHashes("abc", "abcd")).toBe(false);
  });
});

describe("hex / base64 conversions", () => {
  it("hexToBase64 and back", () => {
    const hex = sha256("roundtrip");
    const b64 = hexToBase64(hex);
    expect(base64ToHex(b64)).toBe(hex);
  });

  it("hexToBase64Url produces no + or /", () => {
    const b64url = hexToBase64Url(sha256("test"));
    expect(b64url).not.toContain("+");
    expect(b64url).not.toContain("/");
  });
});

describe("murmur3", () => {
  it("is deterministic", () => {
    expect(murmur3("hello")).toBe(murmur3("hello"));
  });

  it("different inputs give different hashes", () => {
    expect(murmur3("hello")).not.toBe(murmur3("world"));
  });

  it("seed affects output", () => {
    expect(murmur3("hello", 0)).not.toBe(murmur3("hello", 42));
  });

  it("returns unsigned 32-bit integer", () => {
    const h = murmur3("test");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it("hex variant returns 8 chars", () => {
    expect(murmur3Hex("test")).toHaveLength(8);
  });

  it("handles empty string", () => {
    expect(typeof murmur3("")).toBe("number");
  });
});

describe("hashMany", () => {
  it("hashes multiple values together", () => {
    const h = hashMany("a", "b", "c");
    expect(h).toHaveLength(64);
  });

  it("order matters", () => {
    expect(hashMany("a", "b")).not.toBe(hashMany("b", "a"));
  });
});

describe("sameContent", () => {
  it("returns true for equivalent objects", () => {
    expect(sameContent({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("returns false for different objects", () => {
    expect(sameContent({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("createHashStream", () => {
  it("computes correct hash through stream", async () => {
    const { stream, digest } = createHashStream("sha256");
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
      stream.write("hello");
      stream.end();
    });
    expect(digest()).toBe(sha256("hello"));
  });
});
