import { describe, it, expect } from "vitest";
import {
  stripHtml,
  escapeHtml,
  removeControlChars,
  removeNullBytes,
  normalizeWhitespace,
  truncate,
  sanitizeUrl,
  sanitizeFilePath,
  trim,
  lowercase,
  uppercase,
  removeScriptPatterns,
  Sanitizer,
} from "../sanitizer.js";

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<b>bold</b>")).toBe("bold");
    expect(stripHtml("<p>Hello <em>world</em></p>")).toBe("Hello world");
  });

  it("removes self-closing tags", () => {
    expect(stripHtml("text<br>more")).toBe("textmore");
  });

  it("leaves plain text unchanged", () => {
    expect(stripHtml("no html here")).toBe("no html here");
  });
});

describe("escapeHtml", () => {
  it("escapes < and >", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes &", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes quotes", () => {
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
    expect(escapeHtml("it's")).toBe("it&#x27;s");
  });

  it("escapes forward slash", () => {
    expect(escapeHtml("a/b")).toBe("a&#x2F;b");
  });
});

describe("removeControlChars", () => {
  it("removes ASCII control characters", () => {
    expect(removeControlChars("hello\x01world")).toBe("helloworld");
    expect(removeControlChars("test\x1Fend")).toBe("testend");
  });

  it("keeps tab, newline, carriage return", () => {
    expect(removeControlChars("line1\nline2")).toBe("line1\nline2");
    expect(removeControlChars("col1\tcol2")).toBe("col1\tcol2");
  });
});

describe("removeNullBytes", () => {
  it("removes null bytes", () => {
    expect(removeNullBytes("hel\x00lo")).toBe("hello");
    expect(removeNullBytes("\x00\x00test\x00")).toBe("test");
  });

  it("leaves regular text unchanged", () => {
    expect(removeNullBytes("hello")).toBe("hello");
  });
});

describe("normalizeWhitespace", () => {
  it("collapses multiple spaces into one", () => {
    expect(normalizeWhitespace("hello   world")).toBe("hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeWhitespace("  hello  ")).toBe("hello");
  });

  it("replaces newlines and tabs with single space", () => {
    expect(normalizeWhitespace("hello\n\tworld")).toBe("hello world");
  });
});

describe("truncate", () => {
  it("does not truncate strings within limit", () => {
    expect(truncate(10)("hello")).toBe("hello");
  });

  it("truncates and appends ellipsis", () => {
    expect(truncate(8)("hello world")).toBe("hello...");
  });

  it("uses custom suffix", () => {
    expect(truncate(7, "…")("hello world")).toBe("hello h…");
  });
});

describe("sanitizeUrl", () => {
  it("passes http URLs", () => {
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("passes https URLs", () => {
    expect(sanitizeUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("strips javascript: URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
  });

  it("strips ftp: URLs", () => {
    expect(sanitizeUrl("ftp://example.com")).toBe("");
  });

  it("strips non-URL strings", () => {
    expect(sanitizeUrl("not a url")).toBe("");
  });

  it("trims whitespace before checking", () => {
    expect(sanitizeUrl("  https://example.com  ")).toBe("https://example.com");
  });
});

describe("sanitizeFilePath", () => {
  it("removes path traversal sequences", () => {
    expect(sanitizeFilePath("../../etc/passwd")).toBe("etc/passwd");
  });

  it("removes embedded traversal sequences", () => {
    expect(sanitizeFilePath("uploads/../../../secret.txt")).toBe("secret.txt");
  });

  it("normalizes backslashes", () => {
    const result = sanitizeFilePath("uploads\\file.txt");
    expect(result).toBe("uploads/file.txt");
  });

  it("removes leading slash", () => {
    expect(sanitizeFilePath("/etc/passwd")).toBe("etc/passwd");
  });

  it("preserves safe relative path", () => {
    expect(sanitizeFilePath("uploads/images/photo.jpg")).toBe("uploads/images/photo.jpg");
  });
});

describe("transform functions", () => {
  it("trim removes whitespace", () => {
    expect(trim("  hello  ")).toBe("hello");
  });

  it("lowercase converts to lower case", () => {
    expect(lowercase("HELLO")).toBe("hello");
  });

  it("uppercase converts to upper case", () => {
    expect(uppercase("hello")).toBe("HELLO");
  });
});

describe("removeScriptPatterns", () => {
  it("removes javascript: protocol", () => {
    expect(removeScriptPatterns("javascript:alert(1)")).not.toContain("javascript:");
  });

  it("removes inline event handlers", () => {
    expect(removeScriptPatterns("onclick=evil()")).not.toContain("onclick=");
  });
});

describe("Sanitizer class – pipeline", () => {
  it("chains multiple steps", () => {
    const s = new Sanitizer().trim().lowercase().stripHtml();
    expect(s.sanitize("  <b>HELLO</b>  ")).toBe("hello");
  });

  it("safeText preset removes html and normalizes", () => {
    const s = Sanitizer.safeText();
    const result = s.sanitize("  <script>evil()</script>  Hello!  ");
    expect(result).not.toContain("<script>");
    expect(result.trim()).toBe(result); // trimmed by normalizeWhitespace
  });

  it("safeHtml preset escapes entities", () => {
    const s = Sanitizer.safeHtml();
    const result = s.sanitize("<div>hello & world</div>");
    expect(result).toContain("&lt;");
    expect(result).toContain("&amp;");
  });

  it("safeUrl preset validates URL", () => {
    const s = Sanitizer.safeUrl();
    expect(s.sanitize("https://example.com")).toBe("https://example.com");
    expect(s.sanitize("javascript:evil()")).toBe("");
  });

  it("safeFilePath preset sanitizes file paths", () => {
    const s = Sanitizer.safeFilePath();
    expect(s.sanitize("../../etc/passwd")).toBe("etc/passwd");
  });

  it("sanitizeObject processes all string values", () => {
    const s = new Sanitizer().stripHtml().normalizeWhitespace();
    const result = s.sanitizeObject({
      name: "  <b>Alice</b>  ",
      age: 30,
      bio: "<p>Hello   world</p>",
    });
    expect(result.name).toBe("Alice");
    expect(result.age).toBe(30);
    expect(result.bio).toBe("Hello world");
  });

  it("custom pipe step is applied", () => {
    const s = new Sanitizer().pipe((v) => v.replace(/\d/g, "*"));
    expect(s.sanitize("phone: 12345")).toBe("phone: *****");
  });

  it("truncate in pipeline", () => {
    const s = new Sanitizer().truncate(10);
    expect(s.sanitize("hello world this is long")).toBe("hello w...");
  });
});
