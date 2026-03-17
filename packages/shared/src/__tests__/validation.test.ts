import { describe, it, expect } from "vitest";
import {
  isEmail,
  isUrl,
  isUUID,
  isHexColor,
  isJSON,
  isEmpty,
  isNumeric,
  sanitizeFilename,
  validatePassword,
  normalizeUrl,
} from "../utils/validation.js";

describe("isEmail", () => {
  it("accepts valid emails", () => {
    expect(isEmail("user@example.com")).toBe(true);
    expect(isEmail("user+tag@subdomain.example.org")).toBe(true);
    expect(isEmail("user.name@domain.co.uk")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isEmail("notanemail")).toBe(false);
    expect(isEmail("@domain.com")).toBe(false);
    expect(isEmail("user@")).toBe(false);
    expect(isEmail("")).toBe(false);
    expect(isEmail("user @domain.com")).toBe(false);
  });
});

describe("isUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isUrl("https://example.com")).toBe(true);
    expect(isUrl("http://example.com/path?q=1")).toBe(true);
  });

  it("accepts ftp URLs", () => {
    expect(isUrl("ftp://files.example.com")).toBe(true);
  });

  it("rejects invalid URLs", () => {
    expect(isUrl("not-a-url")).toBe(false);
    expect(isUrl("javascript:alert(1)")).toBe(false);
    expect(isUrl("//example.com")).toBe(false);
    expect(isUrl("")).toBe(false);
  });
});

describe("isUUID", () => {
  it("accepts valid UUIDs v4", () => {
    expect(isUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUUID("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  });

  it("rejects invalid UUIDs", () => {
    expect(isUUID("not-a-uuid")).toBe(false);
    expect(isUUID("550e8400-e29b-41d4-a716")).toBe(false);
    expect(isUUID("")).toBe(false);
  });
});

describe("isHexColor", () => {
  it("accepts 3-digit hex colors", () => {
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#abc")).toBe(true);
  });

  it("accepts 6-digit hex colors", () => {
    expect(isHexColor("#ffffff")).toBe(true);
    expect(isHexColor("#1a2b3c")).toBe(true);
  });

  it("rejects invalid hex colors", () => {
    expect(isHexColor("fff")).toBe(false);
    expect(isHexColor("#gg0000")).toBe(false);
    expect(isHexColor("#12345")).toBe(false);
    expect(isHexColor("")).toBe(false);
  });
});

describe("isJSON", () => {
  it("accepts valid JSON strings", () => {
    expect(isJSON('{"key":"value"}')).toBe(true);
    expect(isJSON("[1,2,3]")).toBe(true);
    expect(isJSON('"hello"')).toBe(true);
    expect(isJSON("42")).toBe(true);
    expect(isJSON("null")).toBe(true);
  });

  it("rejects invalid JSON", () => {
    expect(isJSON("{key: value}")).toBe(false);
    expect(isJSON("undefined")).toBe(false);
    expect(isJSON("")).toBe(false);
  });
});

describe("isEmpty", () => {
  it("returns true for null and undefined", () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(isEmpty("")).toBe(true);
    expect(isEmpty("   ")).toBe(true);
  });

  it("returns true for empty array", () => {
    expect(isEmpty([])).toBe(true);
  });

  it("returns true for empty object", () => {
    expect(isEmpty({})).toBe(true);
  });

  it("returns false for non-empty values", () => {
    expect(isEmpty("hello")).toBe(false);
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
    expect(isEmpty(0)).toBe(false);
  });
});

describe("isNumeric", () => {
  it("returns true for numbers", () => {
    expect(isNumeric(0)).toBe(true);
    expect(isNumeric(3.14)).toBe(true);
    expect(isNumeric(-5)).toBe(true);
  });

  it("returns true for numeric strings", () => {
    expect(isNumeric("42")).toBe(true);
    expect(isNumeric("3.14")).toBe(true);
    expect(isNumeric("-10")).toBe(true);
  });

  it("returns false for non-numeric values", () => {
    expect(isNumeric("hello")).toBe(false);
    expect(isNumeric(NaN)).toBe(false);
    expect(isNumeric(Infinity)).toBe(false);
    expect(isNumeric("")).toBe(false);
    expect(isNumeric(null)).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("removes unsafe characters", () => {
    expect(sanitizeFilename("file<name>.txt")).toBe("file_name_.txt");
  });

  it("removes null bytes and control chars", () => {
    expect(sanitizeFilename("file\x00name")).toBe("file_name");
  });

  it("strips leading/trailing dots", () => {
    expect(sanitizeFilename("..hidden")).toBe("hidden");
  });

  it("limits length to 255", () => {
    const long = "a".repeat(300);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(255);
  });

  it("handles normal filenames", () => {
    expect(sanitizeFilename("my-file_2024.txt")).toBe("my-file_2024.txt");
  });
});

describe("validatePassword", () => {
  it("accepts a strong password", () => {
    const result = validatePassword("StrongP@ss1");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects too short password", () => {
    const result = validatePassword("Sh0rt!");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("8 characters"))).toBe(true);
  });

  it("rejects password without uppercase", () => {
    const result = validatePassword("lowercase1!");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("uppercase"))).toBe(true);
  });

  it("rejects password without digit", () => {
    const result = validatePassword("NoDigit!Pass");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("digit"))).toBe(true);
  });

  it("rejects password without special character", () => {
    const result = validatePassword("NoSpecial1");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("special"))).toBe(true);
  });
});

describe("normalizeUrl", () => {
  it("removes default http port", () => {
    expect(normalizeUrl("http://example.com:80/path")).toBe("http://example.com/path");
  });

  it("removes default https port", () => {
    expect(normalizeUrl("https://example.com:443/path")).toBe("https://example.com/path");
  });

  it("removes trailing slash", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
  });

  it("sorts query parameters", () => {
    const result = normalizeUrl("https://example.com?b=2&a=1");
    expect(result).toBe("https://example.com/?a=1&b=2");
  });

  it("returns original string for invalid URL", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });
});
