import { describe, it, expect } from "vitest";
import {
  minLength,
  maxLength,
  pattern,
  email,
  url,
  uuid,
  slug,
  alphanumeric,
  alpha,
  numeric,
  contains,
  startsWith,
  endsWith,
  noHtml,
  noScript,
  trim,
  lowercase,
  uppercase,
  trimmed,
} from "../rules/string-rules.js";

describe("minLength", () => {
  const rule = minLength(3);
  it("passes when length >= min", () => {
    expect(rule.validate("abc")).toBe(true);
    expect(rule.validate("abcd")).toBe(true);
  });
  it("fails when length < min", () => {
    expect(rule.validate("ab")).toBe(false);
    expect(rule.validate("")).toBe(false);
  });
  it("fails non-string", () => {
    expect(rule.validate(123 as unknown as string)).toBe(false);
  });
  it("includes min param", () => {
    expect(rule.params?.["min"]).toBe(3);
  });
});

describe("maxLength", () => {
  const rule = maxLength(5);
  it("passes when length <= max", () => {
    expect(rule.validate("hello")).toBe(true);
    expect(rule.validate("hi")).toBe(true);
  });
  it("fails when length > max", () => {
    expect(rule.validate("toolong")).toBe(false);
  });
});

describe("pattern", () => {
  const rule = pattern(/^\d{4}$/);
  it("passes matching pattern", () => {
    expect(rule.validate("1234")).toBe(true);
  });
  it("fails non-matching pattern", () => {
    expect(rule.validate("123")).toBe(false);
    expect(rule.validate("abcd")).toBe(false);
  });
  it("stores pattern source in params", () => {
    expect(rule.params?.["pattern"]).toBe("^\\d{4}$");
  });
});

describe("email", () => {
  const rule = email();
  it("passes valid emails", () => {
    expect(rule.validate("user@example.com")).toBe(true);
    expect(rule.validate("user+tag@sub.example.org")).toBe(true);
    expect(rule.validate("user.name@domain.co")).toBe(true);
  });
  it("fails invalid emails", () => {
    expect(rule.validate("notanemail")).toBe(false);
    expect(rule.validate("@example.com")).toBe(false);
    expect(rule.validate("user@")).toBe(false);
    expect(rule.validate("user@.com")).toBe(false);
    expect(rule.validate("")).toBe(false);
  });
  it("accepts custom message", () => {
    const r = email("Custom message");
    expect(r.message).toBe("Custom message");
  });
});

describe("url", () => {
  const rule = url();
  it("passes http and https URLs", () => {
    expect(rule.validate("https://example.com")).toBe(true);
    expect(rule.validate("http://example.com/path?q=1")).toBe(true);
  });
  it("fails non-http protocols", () => {
    expect(rule.validate("ftp://example.com")).toBe(false);
    expect(rule.validate("javascript:alert(1)")).toBe(false);
    expect(rule.validate("not-a-url")).toBe(false);
  });
});

describe("uuid", () => {
  const rule = uuid();
  it("passes valid UUIDs", () => {
    expect(rule.validate("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(rule.validate("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
  });
  it("fails invalid UUIDs", () => {
    expect(rule.validate("not-a-uuid")).toBe(false);
    expect(rule.validate("550e8400-e29b-41d4-a716")).toBe(false);
    expect(rule.validate("")).toBe(false);
  });
});

describe("slug", () => {
  const rule = slug();
  it("passes valid slugs", () => {
    expect(rule.validate("hello-world")).toBe(true);
    expect(rule.validate("my-post-123")).toBe(true);
    expect(rule.validate("simple")).toBe(true);
  });
  it("fails invalid slugs", () => {
    expect(rule.validate("Hello-World")).toBe(false);
    expect(rule.validate("has space")).toBe(false);
    expect(rule.validate("-leading")).toBe(false);
    expect(rule.validate("trailing-")).toBe(false);
  });
});

describe("alphanumeric", () => {
  const rule = alphanumeric();
  it("passes alphanumeric strings", () => {
    expect(rule.validate("abc123")).toBe(true);
    expect(rule.validate("ABC")).toBe(true);
    expect(rule.validate("123")).toBe(true);
  });
  it("fails strings with special chars", () => {
    expect(rule.validate("hello world")).toBe(false);
    expect(rule.validate("hello!")).toBe(false);
    expect(rule.validate("hello-world")).toBe(false);
  });
});

describe("alpha", () => {
  const rule = alpha();
  it("passes alphabetic strings", () => {
    expect(rule.validate("hello")).toBe(true);
    expect(rule.validate("HELLO")).toBe(true);
  });
  it("fails strings with digits or special chars", () => {
    expect(rule.validate("hello1")).toBe(false);
    expect(rule.validate("hello world")).toBe(false);
  });
});

describe("numeric", () => {
  const rule = numeric();
  it("passes digit-only strings", () => {
    expect(rule.validate("12345")).toBe(true);
    expect(rule.validate("0")).toBe(true);
  });
  it("fails strings with non-digits", () => {
    expect(rule.validate("123.45")).toBe(false);
    expect(rule.validate("12a3")).toBe(false);
  });
});

describe("contains", () => {
  const rule = contains("fox");
  it("passes when substring is present", () => {
    expect(rule.validate("the quick brown fox")).toBe(true);
  });
  it("fails when substring is absent", () => {
    expect(rule.validate("no animal here")).toBe(false);
  });
});

describe("startsWith", () => {
  const rule = startsWith("https://");
  it("passes when string starts with prefix", () => {
    expect(rule.validate("https://example.com")).toBe(true);
  });
  it("fails when string does not start with prefix", () => {
    expect(rule.validate("http://example.com")).toBe(false);
  });
});

describe("endsWith", () => {
  const rule = endsWith(".ts");
  it("passes when string ends with suffix", () => {
    expect(rule.validate("validator.ts")).toBe(true);
  });
  it("fails when string does not end with suffix", () => {
    expect(rule.validate("validator.js")).toBe(false);
  });
});

describe("noHtml", () => {
  const rule = noHtml();
  it("passes plain text", () => {
    expect(rule.validate("hello world")).toBe(true);
    expect(rule.validate("price < 100 & discount > 10")).toBe(true);
  });
  it("fails strings with HTML tags", () => {
    expect(rule.validate("<script>alert(1)</script>")).toBe(false);
    expect(rule.validate("<b>bold</b>")).toBe(false);
    expect(rule.validate("<img src=x>")).toBe(false);
  });
});

describe("noScript", () => {
  const rule = noScript();
  it("passes safe strings", () => {
    expect(rule.validate("hello world")).toBe(true);
  });
  it("fails strings with script tags", () => {
    expect(rule.validate("<script>alert(1)</script>")).toBe(false);
  });
  it("fails strings with javascript: protocol", () => {
    expect(rule.validate("javascript:alert(1)")).toBe(false);
  });
  it("fails strings with inline event handlers", () => {
    expect(rule.validate('<img onerror=alert(1)>')).toBe(false);
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

describe("trimmed rule", () => {
  const rule = trimmed();
  it("passes already-trimmed string", () => {
    expect(rule.validate("hello")).toBe(true);
  });
  it("fails string with leading whitespace", () => {
    expect(rule.validate(" hello")).toBe(false);
  });
  it("fails string with trailing whitespace", () => {
    expect(rule.validate("hello ")).toBe(false);
  });
});
