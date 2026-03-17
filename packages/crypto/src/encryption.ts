/**
 * AES-256-GCM encryption/decryption, key derivation, envelope encryption.
 */
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  createHash,
} from "node:crypto";

// Constants
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits recommended for GCM
const TAG_LENGTH = 16; // 128 bits auth tag
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = "sha256";

// --- Key Generation ---

/** Generate a random 256-bit AES key */
export function generateKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/** Generate a random IV/nonce for AES-GCM */
export function generateIv(): Buffer {
  return randomBytes(IV_LENGTH);
}

/** Derive a key from a password using PBKDF2 */
export function deriveKey(
  password: string | Buffer,
  salt: Buffer,
  iterations = PBKDF2_ITERATIONS
): Buffer {
  return pbkdf2Sync(password, salt, iterations, KEY_LENGTH, PBKDF2_DIGEST);
}

/** Generate a random salt for key derivation */
export function generateSalt(length = 32): Buffer {
  return randomBytes(length);
}

/** Derive a key from a password with a new random salt */
export function deriveKeyWithSalt(
  password: string,
  iterations = PBKDF2_ITERATIONS
): { key: Buffer; salt: Buffer } {
  const salt = generateSalt();
  const key = deriveKey(password, salt, iterations);
  return { key, salt };
}

// --- Authenticated Encryption ---

export interface EncryptResult {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/** Encrypt a buffer using AES-256-GCM */
export function encryptBuffer(plaintext: Buffer, key: Buffer): EncryptResult {
  if (key.length !== KEY_LENGTH) throw new Error(`Key must be ${KEY_LENGTH} bytes`);
  const iv = generateIv();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: encrypted, iv, tag };
}

/** Decrypt a buffer using AES-256-GCM */
export function decryptBuffer(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  tag: Buffer
): Buffer {
  if (key.length !== KEY_LENGTH) throw new Error(`Key must be ${KEY_LENGTH} bytes`);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// --- String Encryption ---

export interface EncryptedString {
  data: string; // base64 encoded: iv + tag + ciphertext
}

/** Encrypt a string, returning a base64 compact format */
export function encryptString(plaintext: string, key: Buffer): EncryptedString {
  const { ciphertext, iv, tag } = encryptBuffer(Buffer.from(plaintext, "utf8"), key);
  // Format: iv (12) | tag (16) | ciphertext (n)
  const combined = Buffer.concat([iv, tag, ciphertext]);
  return { data: combined.toString("base64") };
}

/** Decrypt an encrypted string */
export function decryptString(encrypted: EncryptedString, key: Buffer): string {
  const combined = Buffer.from(encrypted.data, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
  return decryptBuffer(ciphertext, key, iv, tag).toString("utf8");
}

// --- JSON Encryption ---

/** Encrypt any JSON-serializable value */
export function encryptJson<T>(value: T, key: Buffer): EncryptedString {
  return encryptString(JSON.stringify(value), key);
}

/** Decrypt and parse a JSON-encrypted value */
export function decryptJson<T>(encrypted: EncryptedString, key: Buffer): T {
  return JSON.parse(decryptString(encrypted, key)) as T;
}

// --- Envelope Encryption ---

export interface EnvelopeEncrypted {
  encryptedDataKey: EncryptedString; // data key encrypted with master key
  encryptedPayload: EncryptedString; // payload encrypted with data key
}

/**
 * Envelope encryption: generates a random data key, encrypts the payload with it,
 * then encrypts the data key with the master key.
 */
export function envelopeEncrypt(plaintext: string, masterKey: Buffer): EnvelopeEncrypted {
  const dataKey = generateKey();
  const encryptedDataKey = encryptString(dataKey.toString("hex"), masterKey);
  const encryptedPayload = encryptString(plaintext, dataKey);
  // Zero out the data key from memory (best effort)
  dataKey.fill(0);
  return { encryptedDataKey, encryptedPayload };
}

/** Decrypt an envelope-encrypted value */
export function envelopeDecrypt(encrypted: EnvelopeEncrypted, masterKey: Buffer): string {
  const dataKeyHex = decryptString(encrypted.encryptedDataKey, masterKey);
  const dataKey = Buffer.from(dataKeyHex, "hex");
  const plaintext = decryptString(encrypted.encryptedPayload, dataKey);
  dataKey.fill(0);
  return plaintext;
}

// --- Key Rotation ---

export interface RotationResult {
  reencrypted: EncryptedString;
}

/** Re-encrypt data with a new key */
export function rotateKey(
  encrypted: EncryptedString,
  oldKey: Buffer,
  newKey: Buffer
): RotationResult {
  const plaintext = decryptString(encrypted, oldKey);
  return { reencrypted: encryptString(plaintext, newKey) };
}

/** Rotate envelope encryption to a new master key */
export function rotateEnvelopeKey(
  encrypted: EnvelopeEncrypted,
  oldMasterKey: Buffer,
  newMasterKey: Buffer
): EnvelopeEncrypted {
  const dataKeyHex = decryptString(encrypted.encryptedDataKey, oldMasterKey);
  const newEncryptedDataKey = encryptString(dataKeyHex, newMasterKey);
  return {
    encryptedDataKey: newEncryptedDataKey,
    encryptedPayload: encrypted.encryptedPayload,
  };
}

// --- Utilities ---

/** Hash a key deterministically (for key ID generation) */
export function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** Check if two keys are equal (constant-time) */
export function keysEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** Convert key to hex string for storage */
export function keyToHex(key: Buffer): string {
  return key.toString("hex");
}

/** Load key from hex string */
export function keyFromHex(hex: string): Buffer {
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== KEY_LENGTH) throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes`);
  return buf;
}
