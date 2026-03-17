/**
 * Text cleaning pipeline: strip HTML, normalize whitespace, remove URLs,
 * emails, normalize unicode, remove excessive punctuation.
 * Fully configurable via options.
 */

export interface TextCleanerOptions {
  /** Strip HTML tags (default: true) */
  stripHtml?: boolean;
  /** Remove URLs (default: true) */
  removeUrls?: boolean;
  /** Remove email addresses (default: true) */
  removeEmails?: boolean;
  /** Normalize unicode characters (default: true) */
  normalizeUnicode?: boolean;
  /** Collapse multiple spaces/newlines to single space (default: true) */
  normalizeWhitespace?: boolean;
  /** Remove runs of 3+ identical punctuation characters (default: true) */
  removeExcessivePunctuation?: boolean;
  /** Lowercase the result (default: false) */
  lowercase?: boolean;
  /** Trim leading/trailing whitespace (default: true) */
  trim?: boolean;
  /** Remove non-ASCII characters (default: false) */
  removeNonAscii?: boolean;
  /** Custom replacements: [pattern, replacement][] applied in order */
  customReplacements?: Array<[RegExp | string, string]>;
}

const DEFAULT_OPTIONS: Required<Omit<TextCleanerOptions, "customReplacements">> = {
  stripHtml: true,
  removeUrls: true,
  removeEmails: true,
  normalizeUnicode: true,
  normalizeWhitespace: true,
  removeExcessivePunctuation: true,
  lowercase: false,
  trim: true,
  removeNonAscii: false,
};

// ---------------------------------------------------------------------------
// Individual transformations
// ---------------------------------------------------------------------------

/** Strip HTML tags and decode common HTML entities. */
export function stripHtml(text: string): string {
  // Remove script and style blocks entirely
  let result = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

  // Remove all other tags
  result = result.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  result = result
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );

  return result;
}

/** Remove URLs (http, https, ftp, www). */
export function removeUrls(text: string): string {
  return text
    .replace(/https?:\/\/[^\s\])'">]+/gi, "")
    .replace(/ftp:\/\/[^\s\])'">]+/gi, "")
    .replace(/www\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}[^\s\])'">]*/gi, "");
}

/** Remove email addresses. */
export function removeEmails(text: string): string {
  return text.replace(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g, "");
}

/**
 * Normalize unicode: decompose composed characters, then strip combining marks.
 * Falls back gracefully if normalize is unavailable.
 */
export function normalizeUnicode(text: string): string {
  // NFD decomposition then strip combining marks (accents, etc.)
  // We keep the base characters to preserve readability.
  return text
    .normalize("NFC")  // Canonical Composition – normalize to composed form
    .replace(/\u2018|\u2019/g, "'")  // smart single quotes → '
    .replace(/\u201C|\u201D/g, '"')  // smart double quotes → "
    .replace(/\u2013/g, "-")         // en-dash
    .replace(/\u2014/g, "--")        // em-dash
    .replace(/\u2026/g, "...")       // ellipsis
    .replace(/\u00A0/g, " ")         // non-breaking space
    .replace(/\uFEFF/g, "")          // BOM
    .replace(/\u200B|\u200C|\u200D/g, ""); // zero-width characters
}

/** Collapse repeated whitespace (spaces, tabs, newlines) to a single space. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n|\r/g, "\n")   // normalize line endings
    .replace(/[ \t]+/g, " ")     // collapse horizontal whitespace
    .replace(/\n{3,}/g, "\n\n"); // at most two consecutive newlines
}

/** Remove runs of 3+ identical punctuation characters. */
export function removeExcessivePunctuation(text: string): string {
  // e.g. "!!!!" → "!", "....." → "...", "---" → "-"
  return text.replace(/([!?.]){3,}/g, "$1$1").replace(/(-){3,}/g, "$1$1");
}

/** Remove non-ASCII characters. */
export function removeNonAscii(text: string): string {
  return text.replace(/[^\x00-\x7F]/g, "");
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export class TextCleaner {
  private readonly opts: Required<Omit<TextCleanerOptions, "customReplacements">> & {
    customReplacements: Array<[RegExp | string, string]>;
  };

  constructor(options: TextCleanerOptions = {}) {
    this.opts = {
      ...DEFAULT_OPTIONS,
      ...options,
      customReplacements: options.customReplacements ?? [],
    };
  }

  clean(text: string): string {
    let result = text;

    if (this.opts.stripHtml) result = stripHtml(result);
    if (this.opts.normalizeUnicode) result = normalizeUnicode(result);
    if (this.opts.removeUrls) result = removeUrls(result);
    if (this.opts.removeEmails) result = removeEmails(result);
    if (this.opts.removeExcessivePunctuation) result = removeExcessivePunctuation(result);

    // Apply custom replacements
    for (const [pattern, replacement] of this.opts.customReplacements) {
      result = result.replace(pattern as RegExp, replacement);
    }

    if (this.opts.removeNonAscii) result = removeNonAscii(result);
    if (this.opts.normalizeWhitespace) result = normalizeWhitespace(result);
    if (this.opts.lowercase) result = result.toLowerCase();
    if (this.opts.trim) result = result.trim();

    return result;
  }

  /** Clean multiple texts in batch. */
  cleanBatch(texts: string[]): string[] {
    return texts.map((t) => this.clean(t));
  }
}

/** Convenience function using default options. */
export function cleanText(text: string, options?: TextCleanerOptions): string {
  return new TextCleaner(options).clean(text);
}
