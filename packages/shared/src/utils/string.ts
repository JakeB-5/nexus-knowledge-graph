/**
 * String utility functions for the Nexus platform.
 */

/**
 * Convert text to a URL-safe slug.
 * e.g. "Hello World!" -> "hello-world"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9\s-]/g, "")   // remove non-alphanumeric
    .replace(/[\s_-]+/g, "-")        // replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, "");        // strip leading/trailing hyphens
}

/**
 * Truncate text to maxLength, appending suffix if truncated.
 */
export function truncate(
  text: string,
  maxLength: number,
  suffix = "...",
): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalize the first character of a string.
 */
export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Convert camelCase to kebab-case.
 * e.g. "helloWorld" -> "hello-world"
 */
export function camelToKebab(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Convert kebab-case to camelCase.
 * e.g. "hello-world" -> "helloWorld"
 */
export function kebabToCamel(text: string): string {
  return text.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

/**
 * Strip HTML tags from a string.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Basic English pluralization.
 * Returns singular or plural form based on count.
 */
export function pluralize(word: string, count: number): string {
  if (count === 1) return word;
  // Common irregular plurals
  const irregulars: Record<string, string> = {
    person: "people",
    child: "children",
    tooth: "teeth",
    foot: "feet",
    mouse: "mice",
    goose: "geese",
    ox: "oxen",
    leaf: "leaves",
    knife: "knives",
    wife: "wives",
    life: "lives",
    half: "halves",
    self: "selves",
    elf: "elves",
  };
  const lower = word.toLowerCase();
  if (irregulars[lower]) {
    const irregular = irregulars[lower]!;
    return word[0] != null && word[0] === word[0].toUpperCase()
      ? capitalize(irregular)
      : irregular;
  }
  // Rules
  if (/[^aeiou]y$/i.test(word)) return word.replace(/y$/i, "ies");
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + "es";
  if (/fe?$/i.test(word)) return word.replace(/fe?$/i, "ves");
  return word + "s";
}

/** Characters used for ID generation */
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a nanoid-style short unique ID.
 * Default length: 21 characters.
 */
export function generateId(length = 21): string {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  }
  return id;
}

/**
 * Mask an email address for display.
 * e.g. "john.doe@example.com" -> "j***@example.com"
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return email;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visible = local.charAt(0);
  return `${visible}***${domain}`;
}

/**
 * Format bytes into a human-readable string.
 * e.g. 1536 -> "1.5 KB"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${parseFloat(value.toFixed(decimals))} ${sizes[i]}`;
}
