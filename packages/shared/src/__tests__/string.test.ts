import { describe, it, expect } from "vitest";
import {
  slugify,
  truncate,
  capitalize,
  camelToKebab,
  kebabToCamel,
  stripHtml,
  escapeHtml,
  pluralize,
  generateId,
  maskEmail,
  formatBytes,
} from "../utils/string.js";

describe("slugify", () => {
  it("converts spaces to hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("removes diacritics", () => {
    expect(slugify("Ñoño")).toBe("nono");
  });

  it("collapses multiple spaces", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--hello world--")).toBe("hello-world");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles already-slug strings", () => {
    expect(slugify("hello-world")).toBe("hello-world");
  });

  it("lowercases uppercase letters", () => {
    expect(slugify("NEXUS GRAPH")).toBe("nexus-graph");
  });
});

describe("truncate", () => {
  it("does not truncate short strings", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates to maxLength with default suffix", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("respects custom suffix", () => {
    expect(truncate("hello world", 7, "…")).toBe("hello …");
  });

  it("returns exact-length string unchanged", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});

describe("capitalize", () => {
  it("capitalizes the first character", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("does not alter rest of string", () => {
    expect(capitalize("hELLO")).toBe("HELLO");
  });

  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });
});

describe("camelToKebab", () => {
  it("converts camelCase to kebab-case", () => {
    expect(camelToKebab("helloWorld")).toBe("hello-world");
  });

  it("handles consecutive uppercase letters", () => {
    expect(camelToKebab("parseHTMLString")).toBe("parse-html-string");
  });

  it("already lowercase stays the same", () => {
    expect(camelToKebab("hello")).toBe("hello");
  });
});

describe("kebabToCamel", () => {
  it("converts kebab-case to camelCase", () => {
    expect(kebabToCamel("hello-world")).toBe("helloWorld");
  });

  it("handles multiple hyphens", () => {
    expect(kebabToCamel("one-two-three")).toBe("oneTwoThree");
  });

  it("single word unchanged", () => {
    expect(kebabToCamel("hello")).toBe("hello");
  });
});

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello <b>World</b></p>")).toBe("Hello World");
  });

  it("decodes common entities", () => {
    expect(stripHtml("&lt;script&gt;")).toBe("<script>");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes quotes", () => {
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });
});

describe("pluralize", () => {
  it("returns singular for count 1", () => {
    expect(pluralize("item", 1)).toBe("item");
  });

  it("adds s for count != 1", () => {
    expect(pluralize("item", 2)).toBe("items");
  });

  it("handles words ending in y", () => {
    expect(pluralize("category", 2)).toBe("categories");
  });

  it("handles irregular words", () => {
    expect(pluralize("person", 3)).toBe("people");
  });

  it("handles words ending in s", () => {
    expect(pluralize("bus", 2)).toBe("buses");
  });
});

describe("generateId", () => {
  it("returns a string of the default length", () => {
    const id = generateId();
    expect(id).toHaveLength(21);
  });

  it("returns a string of custom length", () => {
    const id = generateId(10);
    expect(id).toHaveLength(10);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("maskEmail", () => {
  it("masks the local part", () => {
    expect(maskEmail("john@example.com")).toBe("j***@example.com");
  });

  it("handles short local parts", () => {
    expect(maskEmail("a@b.com")).toBe("a***@b.com");
  });

  it("returns value unchanged if no @", () => {
    expect(maskEmail("notanemail")).toBe("notanemail");
  });
});

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1024 ** 3)).toBe("1 GB");
  });
});
