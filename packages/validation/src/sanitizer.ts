// Sanitizer class: pipeline-based input sanitization

export type SanitizerStep = (input: string) => string;

// ─── Individual sanitization functions ───────────────────────────────────────

/** Strip all HTML tags from the string */
export function stripHtml(input: string): string {
  return input.replace(/<\/?[a-zA-Z][^>]*>/g, "");
}

/** Escape HTML special characters to prevent XSS */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/** Remove ASCII control characters (0x00–0x1F, 0x7F) except tab, newline, carriage return */
export function removeControlChars(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/** Remove null bytes */
export function removeNullBytes(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x00/g, "");
}

/** Normalize all whitespace sequences (spaces, tabs, newlines) to a single space and trim */
export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/** Truncate string to max length, appending suffix if truncated */
export function truncate(maxLength: number, suffix = "..."): SanitizerStep {
  return (input: string) => {
    if (input.length <= maxLength) return input;
    return input.slice(0, maxLength - suffix.length) + suffix;
  };
}

/** Only allow http and https URLs; return empty string for others */
export function sanitizeUrl(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return trimmed;
    }
    return "";
  } catch {
    return "";
  }
}

/** Prevent path traversal: remove ../ and ..\\ sequences and normalize separators */
export function sanitizeFilePath(input: string): string {
  // Normalize backslashes to forward slashes
  let path = input.replace(/\\/g, "/");
  // Remove null bytes
  path = path.replace(/\x00/g, ""); // eslint-disable-line no-control-regex
  // Remove ../ sequences (repeated until stable)
  let prev = "";
  while (prev !== path) {
    prev = path;
    path = path.replace(/\.\.\/|\/\.\./g, "");
  }
  // Remove leading slashes to prevent absolute paths
  path = path.replace(/^\/+/, "");
  // Remove any remaining .. segments
  path = path
    .split("/")
    .filter((segment) => segment !== ".." && segment !== ".")
    .join("/");
  return path;
}

/** Trim leading and trailing whitespace */
export function trim(input: string): string {
  return input.trim();
}

/** Convert to lowercase */
export function lowercase(input: string): string {
  return input.toLowerCase();
}

/** Convert to uppercase */
export function uppercase(input: string): string {
  return input.toUpperCase();
}

/** Remove script-related patterns (javascript:, on* handlers) */
export function removeScriptPatterns(input: string): string {
  // Remove javascript: protocol
  let result = input.replace(/javascript\s*:/gi, "");
  // Remove inline event handlers
  result = result.replace(/\bon\w+\s*=/gi, "");
  // Remove data: URIs that could contain scripts
  result = result.replace(/data\s*:[^,]*script[^,]*,/gi, "");
  return result;
}

/** Collapse multiple consecutive newlines into at most two */
export function collapseNewlines(input: string): string {
  return input.replace(/\n{3,}/g, "\n\n");
}

/** Remove non-printable Unicode characters */
export function removePrintableUnicode(input: string): string {
  // Keep printable ASCII and common Unicode; remove private-use and control planes
  return input.replace(/[\u0000-\u001F\u007F-\u009F\uFFF0-\uFFFF]/g, "");
}

// ─── Sanitizer class ──────────────────────────────────────────────────────────

export class Sanitizer {
  private steps: SanitizerStep[] = [];

  /** Add a custom sanitization step */
  pipe(step: SanitizerStep): this {
    this.steps.push(step);
    return this;
  }

  stripHtml(): this {
    return this.pipe(stripHtml);
  }

  escapeHtml(): this {
    return this.pipe(escapeHtml);
  }

  removeControlChars(): this {
    return this.pipe(removeControlChars);
  }

  removeNullBytes(): this {
    return this.pipe(removeNullBytes);
  }

  normalizeWhitespace(): this {
    return this.pipe(normalizeWhitespace);
  }

  truncate(maxLength: number, suffix = "..."): this {
    return this.pipe(truncate(maxLength, suffix));
  }

  sanitizeUrl(): this {
    return this.pipe(sanitizeUrl);
  }

  sanitizeFilePath(): this {
    return this.pipe(sanitizeFilePath);
  }

  trim(): this {
    return this.pipe(trim);
  }

  lowercase(): this {
    return this.pipe(lowercase);
  }

  uppercase(): this {
    return this.pipe(uppercase);
  }

  removeScriptPatterns(): this {
    return this.pipe(removeScriptPatterns);
  }

  collapseNewlines(): this {
    return this.pipe(collapseNewlines);
  }

  removePrintableUnicode(): this {
    return this.pipe(removePrintableUnicode);
  }

  /** Run the full pipeline on the input string */
  sanitize(input: string): string {
    return this.steps.reduce((value, step) => step(value), input);
  }

  /** Sanitize all string values in a plain object (shallow) */
  sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = typeof value === "string" ? this.sanitize(value) : value;
    }
    return result as T;
  }

  /** Create a new Sanitizer with a preset "safe text" pipeline */
  static safeText(): Sanitizer {
    return new Sanitizer()
      .removeNullBytes()
      .removeControlChars()
      .stripHtml()
      .removeScriptPatterns()
      .normalizeWhitespace();
  }

  /** Create a new Sanitizer with a preset "safe HTML" pipeline (escapes entities) */
  static safeHtml(): Sanitizer {
    return new Sanitizer()
      .removeNullBytes()
      .removeControlChars()
      .escapeHtml()
      .normalizeWhitespace();
  }

  /** Create a new Sanitizer for URL inputs */
  static safeUrl(): Sanitizer {
    return new Sanitizer().removeNullBytes().trim().sanitizeUrl();
  }

  /** Create a new Sanitizer for file path inputs */
  static safeFilePath(): Sanitizer {
    return new Sanitizer().removeNullBytes().sanitizeFilePath();
  }
}
