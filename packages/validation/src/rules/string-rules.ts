// String validation and transformation rules

import type { ValidationRule } from "../types.js";

export function minLength(min: number, message?: string): ValidationRule<string> {
  return {
    name: "minLength",
    message: message ?? "Must be at least {min} characters",
    params: { min },
    validate: (value) => typeof value === "string" && value.length >= min,
  };
}

export function maxLength(max: number, message?: string): ValidationRule<string> {
  return {
    name: "maxLength",
    message: message ?? "Must be at most {max} characters",
    params: { max },
    validate: (value) => typeof value === "string" && value.length <= max,
  };
}

export function pattern(regex: RegExp, message?: string): ValidationRule<string> {
  return {
    name: "pattern",
    message: message ?? "Must match the required pattern",
    params: { pattern: regex.source },
    validate: (value) => typeof value === "string" && regex.test(value),
  };
}

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function email(message?: string): ValidationRule<string> {
  return {
    name: "email",
    message: message ?? "Must be a valid email address",
    params: {},
    validate: (value) => typeof value === "string" && EMAIL_RE.test(value),
  };
}

export function url(message?: string): ValidationRule<string> {
  return {
    name: "url",
    message: message ?? "Must be a valid URL",
    params: {},
    validate: (value) => {
      if (typeof value !== "string") return false;
      try {
        const u = new URL(value);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuid(message?: string): ValidationRule<string> {
  return {
    name: "uuid",
    message: message ?? "Must be a valid UUID",
    params: {},
    validate: (value) => typeof value === "string" && UUID_RE.test(value),
  };
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slug(message?: string): ValidationRule<string> {
  return {
    name: "slug",
    message: message ?? "Must be a valid slug (lowercase letters, numbers, hyphens)",
    params: {},
    validate: (value) => typeof value === "string" && SLUG_RE.test(value),
  };
}

const ALPHANUMERIC_RE = /^[a-zA-Z0-9]+$/;

export function alphanumeric(message?: string): ValidationRule<string> {
  return {
    name: "alphanumeric",
    message: message ?? "Must contain only letters and numbers",
    params: {},
    validate: (value) => typeof value === "string" && ALPHANUMERIC_RE.test(value),
  };
}

const ALPHA_RE = /^[a-zA-Z]+$/;

export function alpha(message?: string): ValidationRule<string> {
  return {
    name: "alpha",
    message: message ?? "Must contain only letters",
    params: {},
    validate: (value) => typeof value === "string" && ALPHA_RE.test(value),
  };
}

const NUMERIC_RE = /^[0-9]+$/;

export function numeric(message?: string): ValidationRule<string> {
  return {
    name: "numeric",
    message: message ?? "Must contain only digits",
    params: {},
    validate: (value) => typeof value === "string" && NUMERIC_RE.test(value),
  };
}

export function contains(substr: string, message?: string): ValidationRule<string> {
  return {
    name: "contains",
    message: message ?? `Must contain "${substr}"`,
    params: { substr },
    validate: (value) => typeof value === "string" && value.includes(substr),
  };
}

export function startsWith(prefix: string, message?: string): ValidationRule<string> {
  return {
    name: "startsWith",
    message: message ?? `Must start with "${prefix}"`,
    params: { prefix },
    validate: (value) => typeof value === "string" && value.startsWith(prefix),
  };
}

export function endsWith(suffix: string, message?: string): ValidationRule<string> {
  return {
    name: "endsWith",
    message: message ?? `Must end with "${suffix}"`,
    params: { suffix },
    validate: (value) => typeof value === "string" && value.endsWith(suffix),
  };
}

// XSS prevention: reject strings containing HTML tags
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/;

export function noHtml(message?: string): ValidationRule<string> {
  return {
    name: "noHtml",
    message: message ?? "Must not contain HTML tags",
    params: {},
    validate: (value) => typeof value === "string" && !HTML_TAG_RE.test(value),
  };
}

// XSS prevention: reject strings with script-related patterns
const SCRIPT_RE = /<script[\s\S]*?>[\s\S]*?<\/script>|javascript\s*:|on\w+\s*=/i;

export function noScript(message?: string): ValidationRule<string> {
  return {
    name: "noScript",
    message: message ?? "Must not contain script content",
    params: {},
    validate: (value) => typeof value === "string" && !SCRIPT_RE.test(value),
  };
}

// Transform rules — these mutate/return a new value rather than validate
export function trim(value: string): string {
  return value.trim();
}

export function lowercase(value: string): string {
  return value.toLowerCase();
}

export function uppercase(value: string): string {
  return value.toUpperCase();
}

// Convenience: rule that checks value is already trimmed (no leading/trailing whitespace)
export function trimmed(message?: string): ValidationRule<string> {
  return {
    name: "trimmed",
    message: message ?? "Must not have leading or trailing whitespace",
    params: {},
    validate: (value) => typeof value === "string" && value === value.trim(),
  };
}
