/**
 * Validation utility functions for the Nexus platform.
 */

// Portable URL constructor – available in Node.js 10+ and all modern browsers.
declare const URL: new (url: string, base?: string) => {
  protocol: string;
  port: string;
  searchParams: { sort(): void; toString(): string };
  hostname: string;
  pathname: string;
  toString(): string;
};

/** RFC 5322-compliant email regex (simplified). */
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/**
 * Check whether the given value is a valid email address.
 */
export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/** URL validation regex (http/https/ftp). */
const URL_PROTO_RE = /^(https?|ftp):\/\//i;

/**
 * Check whether the given value is a valid URL.
 */
export function isUrl(value: string): boolean {
  if (!URL_PROTO_RE.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "ftp:";
  } catch {
    return false;
  }
}

/** UUID v4 regex */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check whether the given value is a valid UUID (v4).
 */
export function isUUID(value: string): boolean {
  return UUID_RE.test(value);
}

/** Hex color regex: #RGB or #RRGGBB */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Check whether the given value is a valid CSS hex color.
 */
export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

/**
 * Check whether the given string is valid JSON.
 */
export function isJSON(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a value is "empty":
 * null, undefined, empty string, empty array, or empty plain object.
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * Check whether a value is numeric (string or number).
 */
export function isNumeric(value: unknown): boolean {
  if (typeof value === "number") return !isNaN(value) && isFinite(value);
  if (typeof value === "string" && value.trim() !== "") {
    return !isNaN(Number(value)) && isFinite(Number(value));
  }
  return false;
}

/** Characters not allowed in filenames across major OSes. */
const UNSAFE_FILENAME_RE = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Sanitize a string for use as a filename.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(UNSAFE_FILENAME_RE, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 255);
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a password and return a structured result.
 * Requirements: 8+ chars, uppercase, lowercase, digit, special char.
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters");
  if (password.length > 128) errors.push("Password must be at most 128 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain at least one uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain at least one lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain at least one digit");
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push("Password must contain at least one special character");
  return { valid: errors.length === 0, errors };
}

/**
 * Normalize a URL: lowercase scheme/host, remove trailing slash,
 * remove default ports, sort query params.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove default ports
    if ((u.protocol === "http:" && u.port === "80") ||
        (u.protocol === "https:" && u.port === "443")) {
      u.port = "";
    }
    // Sort query params
    u.searchParams.sort();
    // Remove trailing slash from pathname (except root)
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}
