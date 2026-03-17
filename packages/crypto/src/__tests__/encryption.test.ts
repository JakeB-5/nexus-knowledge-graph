import { describe, it, expect } from "vitest";
import {
  generateKey, generateIv, generateSalt,
  deriveKey, deriveKeyWithSalt,
  encryptBuffer, decryptBuffer,
  encryptString, decryptString,
  encryptJson, decryptJson,
  envelopeEncrypt, envelopeDecrypt,
  rotateKey, rotateEnvelopeKey,
  keyId, keysEqual, keyToHex, keyFromHex,
} from "../encryption.js";

describe("key generation", () => {
  it("generates 32-byte key", () => {
    const key = generateKey();
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  it("generates unique keys", () => {
    const k1 = generateKey();
    const k2 = generateKey();
    expect(k1.toString("hex")).not.toBe(k2.toString("hex"));
  });

  it("generates 12-byte IV", () => {
    const iv = generateIv();
    expect(iv.length).toBe(12);
  });

  it("generates salt of specified length", () => {
    const salt = generateSalt(16);
    expect(salt.length).toBe(16);
  });
});

describe("key derivation", () => {
  it("derives key from password", () => {
    const salt = generateSalt();
    const key = deriveKey("my-password", salt);
    expect(key.length).toBe(32);
  });

  it("same password + salt = same key", () => {
    const salt = generateSalt();
    const k1 = deriveKey("password", salt);
    const k2 = deriveKey("password", salt);
    expect(k1.toString("hex")).toBe(k2.toString("hex"));
  });

  it("different password = different key", () => {
    const salt = generateSalt();
    const k1 = deriveKey("password1", salt);
    const k2 = deriveKey("password2", salt);
    expect(k1.toString("hex")).not.toBe(k2.toString("hex"));
  });

  it("deriveKeyWithSalt returns key and salt", () => {
    const { key, salt } = deriveKeyWithSalt("password");
    expect(key.length).toBe(32);
    expect(salt.length).toBeGreaterThan(0);
  });
});

describe("buffer encryption/decryption", () => {
  it("encrypts and decrypts buffer", () => {
    const key = generateKey();
    const plaintext = Buffer.from("Hello, World!");
    const { ciphertext, iv, tag } = encryptBuffer(plaintext, key);
    const decrypted = decryptBuffer(ciphertext, key, iv, tag);
    expect(decrypted.toString()).toBe("Hello, World!");
  });

  it("ciphertext differs from plaintext", () => {
    const key = generateKey();
    const plaintext = Buffer.from("secret");
    const { ciphertext } = encryptBuffer(plaintext, key);
    expect(ciphertext.toString("hex")).not.toBe(plaintext.toString("hex"));
  });

  it("same plaintext + different key = different ciphertext", () => {
    const k1 = generateKey();
    const k2 = generateKey();
    const pt = Buffer.from("data");
    const c1 = encryptBuffer(pt, k1).ciphertext;
    const c2 = encryptBuffer(pt, k2).ciphertext;
    expect(c1.toString("hex")).not.toBe(c2.toString("hex"));
  });

  it("throws with wrong key", () => {
    const key = generateKey();
    const wrongKey = generateKey();
    const { ciphertext, iv, tag } = encryptBuffer(Buffer.from("secret"), key);
    expect(() => decryptBuffer(ciphertext, wrongKey, iv, tag)).toThrow();
  });

  it("throws with tampered ciphertext", () => {
    const key = generateKey();
    const { ciphertext, iv, tag } = encryptBuffer(Buffer.from("secret"), key);
    ciphertext[0] = (ciphertext[0]! ^ 0xff);
    expect(() => decryptBuffer(ciphertext, key, iv, tag)).toThrow();
  });
});

describe("string encryption/decryption", () => {
  it("encrypts and decrypts a string", () => {
    const key = generateKey();
    const encrypted = encryptString("hello world", key);
    expect(decryptString(encrypted, key)).toBe("hello world");
  });

  it("encrypted data is base64 string", () => {
    const key = generateKey();
    const { data } = encryptString("test", key);
    expect(typeof data).toBe("string");
    expect(() => Buffer.from(data, "base64")).not.toThrow();
  });

  it("different encryptions of same value differ (due to random IV)", () => {
    const key = generateKey();
    const e1 = encryptString("same", key);
    const e2 = encryptString("same", key);
    expect(e1.data).not.toBe(e2.data);
  });

  it("handles unicode strings", () => {
    const key = generateKey();
    const text = "こんにちは世界 🌍";
    expect(decryptString(encryptString(text, key), key)).toBe(text);
  });
});

describe("JSON encryption/decryption", () => {
  it("encrypts and decrypts an object", () => {
    const key = generateKey();
    const obj = { name: "Alice", age: 30, tags: ["a", "b"] };
    expect(decryptJson(encryptJson(obj, key), key)).toEqual(obj);
  });
});

describe("envelope encryption", () => {
  it("encrypts and decrypts with master key", () => {
    const masterKey = generateKey();
    const encrypted = envelopeEncrypt("secret payload", masterKey);
    expect(envelopeDecrypt(encrypted, masterKey)).toBe("secret payload");
  });

  it("cannot decrypt with wrong master key", () => {
    const masterKey = generateKey();
    const wrongKey = generateKey();
    const encrypted = envelopeEncrypt("secret", masterKey);
    expect(() => envelopeDecrypt(encrypted, wrongKey)).toThrow();
  });
});

describe("key rotation", () => {
  it("rotates string encryption key", () => {
    const oldKey = generateKey();
    const newKey = generateKey();
    const encrypted = encryptString("hello", oldKey);
    const { reencrypted } = rotateKey(encrypted, oldKey, newKey);
    expect(decryptString(reencrypted, newKey)).toBe("hello");
  });

  it("rotated string no longer decryptable with old key", () => {
    const oldKey = generateKey();
    const newKey = generateKey();
    const encrypted = encryptString("hello", oldKey);
    const { reencrypted } = rotateKey(encrypted, oldKey, newKey);
    expect(() => decryptString(reencrypted, oldKey)).toThrow();
  });

  it("rotates envelope key", () => {
    const oldMaster = generateKey();
    const newMaster = generateKey();
    const encrypted = envelopeEncrypt("payload", oldMaster);
    const rotated = rotateEnvelopeKey(encrypted, oldMaster, newMaster);
    expect(envelopeDecrypt(rotated, newMaster)).toBe("payload");
  });
});

describe("key utilities", () => {
  it("keyId produces 16-char hex string", () => {
    const key = generateKey();
    expect(keyId(key)).toHaveLength(16);
  });

  it("keysEqual returns true for same key", () => {
    const key = generateKey();
    expect(keysEqual(key, Buffer.from(key))).toBe(true);
  });

  it("keysEqual returns false for different keys", () => {
    expect(keysEqual(generateKey(), generateKey())).toBe(false);
  });

  it("keyToHex / keyFromHex roundtrip", () => {
    const key = generateKey();
    const hex = keyToHex(key);
    expect(keysEqual(keyFromHex(hex), key)).toBe(true);
  });

  it("keyFromHex throws for wrong length", () => {
    expect(() => keyFromHex("aabbcc")).toThrow();
  });
});
