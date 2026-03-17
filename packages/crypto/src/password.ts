/**
 * Password hashing (scrypt), strength scoring, policy enforcement, passphrase generation.
 */
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// --- Constants ---
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 64;
const SALT_LENGTH = 32;
const SEPARATOR = ":";

// --- Password Hashing ---

export interface HashedPassword {
  hash: string; // format: "scrypt:{N}:{r}:{p}:{saltHex}:{hashHex}"
}

/** Hash a password using scrypt */
export function hashPassword(password: string): HashedPassword {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  });
  const hash = [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join(SEPARATOR);
  return { hash };
}

/** Verify a password against a stored hash */
export function verifyPassword(password: string, stored: HashedPassword): boolean {
  try {
    const parts = stored.hash.split(SEPARATOR);
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
    const N = parseInt(nStr!, 10);
    const r = parseInt(rStr!, 10);
    const p = parseInt(pStr!, 10);
    const salt = Buffer.from(saltHex!, "hex");
    const expected = Buffer.from(hashHex!, "hex");
    const derived = scryptSync(password, salt, expected.length, { N, r, p });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// --- Password Strength Scoring ---

export interface PasswordStrength {
  score: number;        // 0-100
  level: "very-weak" | "weak" | "fair" | "strong" | "very-strong";
  feedback: string[];
}

/** Score a password from 0 to 100 */
export function scorePassword(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  // Length
  if (password.length >= 8) score += 10;
  else feedback.push("Use at least 8 characters");
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  if (password.length >= 20) score += 5;

  // Character classes
  if (/[a-z]/.test(password)) score += 10;
  else feedback.push("Add lowercase letters");
  if (/[A-Z]/.test(password)) score += 10;
  else feedback.push("Add uppercase letters");
  if (/[0-9]/.test(password)) score += 10;
  else feedback.push("Add numbers");
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  else feedback.push("Add special characters");

  // Variety bonus
  const uniqueChars = new Set(password).size;
  score += Math.min(10, Math.floor(uniqueChars / 4));

  // Penalize repetition
  if (/(.)\1{2,}/.test(password)) { score -= 10; feedback.push("Avoid repeated characters"); }

  // Penalize sequential patterns
  if (/(?:abc|bcd|cde|def|efg|123|234|345|456|567|678|789)/i.test(password)) {
    score -= 5;
    feedback.push("Avoid sequential patterns");
  }

  // Common password penalty
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    score = Math.min(score, 10);
    feedback.push("This is a commonly used password");
  }

  score = Math.max(0, Math.min(100, score));

  let level: PasswordStrength["level"];
  if (score < 20) level = "very-weak";
  else if (score < 40) level = "weak";
  else if (score < 60) level = "fair";
  else if (score < 80) level = "strong";
  else level = "very-strong";

  return { score, level, feedback };
}

// --- Password Policy ---

export interface PasswordPolicy {
  minLength?: number;
  maxLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecial?: boolean;
  minScore?: number;
  disallowCommon?: boolean;
}

export interface PolicyResult {
  valid: boolean;
  violations: string[];
}

/** Check a password against a policy */
export function enforcePolicy(password: string, policy: PasswordPolicy): PolicyResult {
  const violations: string[] = [];
  const {
    minLength = 8, maxLength = 128,
    requireUppercase = false, requireLowercase = false,
    requireNumbers = false, requireSpecial = false,
    minScore = 0, disallowCommon = true,
  } = policy;

  if (password.length < minLength) violations.push(`Must be at least ${minLength} characters`);
  if (password.length > maxLength) violations.push(`Must be at most ${maxLength} characters`);
  if (requireUppercase && !/[A-Z]/.test(password)) violations.push("Must contain uppercase letters");
  if (requireLowercase && !/[a-z]/.test(password)) violations.push("Must contain lowercase letters");
  if (requireNumbers && !/[0-9]/.test(password)) violations.push("Must contain numbers");
  if (requireSpecial && !/[^a-zA-Z0-9]/.test(password)) violations.push("Must contain special characters");
  if (disallowCommon && COMMON_PASSWORDS.includes(password.toLowerCase())) {
    violations.push("Password is too common");
  }
  if (minScore > 0 && scorePassword(password).score < minScore) {
    violations.push(`Password score is below minimum (${minScore})`);
  }

  return { valid: violations.length === 0, violations };
}

// --- Breach Check (Placeholder API Contract) ---

export interface BreachCheckResult {
  breached: boolean;
  count?: number;
  error?: string;
}

/**
 * Check if a password has been seen in known breaches using k-anonymity model.
 * This is a placeholder — integrate with HaveIBeenPwned API or similar in production.
 */
export async function checkBreach(_password: string): Promise<BreachCheckResult> {
  // In production: hash the password with SHA-1, send first 5 chars to HIBP API,
  // check if the full hash suffix appears in the response.
  // Example: https://api.pwnedpasswords.com/range/{first5}
  return {
    breached: false,
    error: "Breach check not implemented — integrate with HaveIBeenPwned API",
  };
}

// --- Passphrase Generation (Diceware-style) ---

const WORD_LIST: string[] = [
  "apple", "brave", "cloud", "dance", "eagle", "flame", "grace", "heart",
  "ivory", "jewel", "kneel", "lemon", "magic", "noble", "ocean", "pearl",
  "quest", "river", "stone", "tiger", "ultra", "vivid", "whale", "xenon",
  "yacht", "zebra", "amber", "blaze", "coral", "dusk", "ember", "frost",
  "glade", "haze", "iris", "jade", "karma", "lunar", "maple", "nova",
  "onyx", "prism", "quartz", "raven", "solar", "thorn", "umbra", "vortex",
  "waltz", "axiom", "bliss", "crisp", "drift", "elite", "flair", "gleam",
  "haven", "ideal", "joust", "kudos", "lyric", "mirth", "nexus", "orbit",
  "plume", "quill", "realm", "swift", "truce", "union", "valor", "woven",
  "exile", "yield", "zeal", "azure", "brisk", "clear", "depth", "epoch",
  "forge", "glint", "honor", "input", "jolt", "knack", "lodge", "match",
  "nerve", "ozone", "pivot", "quiet", "ridge", "sharp", "totem", "unity",
  "visor", "wrist", "exact", "young", "zonal", "alert", "blunt", "civic",
  "draft", "evoke", "flint", "grain", "hoist", "index", "joint", "kite",
];

/** Generate a diceware-style passphrase */
export function generatePassphrase(wordCount = 4, separator = "-"): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const bytes = randomBytes(4);
    const idx = bytes.readUInt32BE(0) % WORD_LIST.length;
    words.push(WORD_LIST[idx]!);
  }
  return words.join(separator);
}

/** Generate a passphrase with numbers mixed in */
export function generateStrongPassphrase(wordCount = 4): string {
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % 10000;
  const words = generatePassphrase(wordCount - 1).split("-");
  words.push(num.toString().padStart(4, "0"));
  return words.join("-");
}

// --- Top 100 Common Passwords ---

const COMMON_PASSWORDS: string[] = [
  "123456", "password", "123456789", "12345678", "12345", "1234567",
  "1234567890", "qwerty", "abc123", "password1", "admin", "letmein",
  "welcome", "monkey", "dragon", "master", "shadow", "1234", "sunshine",
  "princess", "iloveyou", "trustno1", "sunshine", "batman", "football",
  "baseball", "soccer", "hockey", "jordan23", "harley", "ranger",
  "daniel", "master", "hello", "whatever", "dragon", "password123",
  "michael", "superman", "qwerty123", "hunter", "charlie", "donald",
  "andrew", "george", "jessica", "thomas", "joshua", "david", "jessica",
  "test", "pass", "pass123", "123123", "abc", "qwertyuiop", "asdfghjkl",
  "zxcvbnm", "1q2w3e4r", "letmein1", "111111", "000000", "666666",
  "888888", "123321", "654321", "987654321", "nimda", "root", "toor",
  "user", "guest", "login", "changeme", "default", "passw0rd", "p@ssw0rd",
  "p@ssword", "pa$$word", "passwd", "passpass", "passphrase", "qazwsx",
  "qweasdzxc", "asdf", "zxcv", "1111", "2222", "3333", "4444", "5555",
  "6666", "7777", "8888", "9999", "0000", "aaaa", "bbbb", "cccc",
];
