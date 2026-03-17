import { describe, it, expect } from "vitest";
import { Validator, FieldBuilder, createValidator, passwordMatchRule } from "../validator.js";

// Helper to get a fresh field builder
const field = () => new FieldBuilder();

describe("Validator – required rule", () => {
  it("passes when value is present", async () => {
    const v = createValidator({ name: field().required().build() });
    const result = await v.validate({ name: "Alice" });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when value is missing", async () => {
    const v = createValidator({ name: field().required().build() });
    const result = await v.validate({ name: "" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe("required");
  });

  it("fails when value is undefined", async () => {
    const v = createValidator({ name: field().required().build() });
    const result = await v.validate({});
    expect(result.valid).toBe(false);
  });

  it("uses custom message", async () => {
    const v = createValidator({ name: field().required("Name is required").build() });
    const result = await v.validate({ name: "" });
    expect(result.errors[0]?.message).toBe("Name is required");
  });
});

describe("Validator – minLength / maxLength", () => {
  it("passes when within bounds", async () => {
    const v = createValidator({
      username: field().required().minLength(3).maxLength(20).build(),
    });
    const result = await v.validate({ username: "alice" });
    expect(result.valid).toBe(true);
  });

  it("fails minLength", async () => {
    const v = createValidator({ username: field().minLength(5).build() });
    const result = await v.validate({ username: "ab" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe("minLength");
  });

  it("fails maxLength", async () => {
    const v = createValidator({ username: field().maxLength(3).build() });
    const result = await v.validate({ username: "toolong" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe("maxLength");
  });
});

describe("Validator – email rule", () => {
  it("passes valid email", async () => {
    const v = createValidator({ email: field().email().build() });
    expect((await v.validate({ email: "user@example.com" })).valid).toBe(true);
  });

  it("fails invalid email", async () => {
    const v = createValidator({ email: field().email().build() });
    const result = await v.validate({ email: "not-an-email" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe("email");
  });
});

describe("Validator – url rule", () => {
  it("passes http URL", async () => {
    const v = createValidator({ website: field().url().build() });
    expect((await v.validate({ website: "https://example.com" })).valid).toBe(true);
  });

  it("fails non-http URL", async () => {
    const v = createValidator({ website: field().url().build() });
    const result = await v.validate({ website: "ftp://example.com" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe("url");
  });
});

describe("Validator – uuid rule", () => {
  it("passes valid UUID v4", async () => {
    const v = createValidator({ id: field().uuid().build() });
    const result = await v.validate({ id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.valid).toBe(true);
  });

  it("fails malformed UUID", async () => {
    const v = createValidator({ id: field().uuid().build() });
    const result = await v.validate({ id: "not-a-uuid" });
    expect(result.valid).toBe(false);
  });
});

describe("Validator – pattern rule", () => {
  it("passes matching pattern", async () => {
    const v = createValidator({ code: field().pattern(/^[A-Z]{3}\d{3}$/).build() });
    expect((await v.validate({ code: "ABC123" })).valid).toBe(true);
  });

  it("fails non-matching pattern", async () => {
    const v = createValidator({ code: field().pattern(/^[A-Z]{3}\d{3}$/).build() });
    const result = await v.validate({ code: "abc123" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe("pattern");
  });
});

describe("Validator – optional fields", () => {
  it("skips validation when optional and absent", async () => {
    const v = createValidator({ bio: field().optional().minLength(10).build() });
    expect((await v.validate({})).valid).toBe(true);
  });

  it("still validates when optional but present", async () => {
    const v = createValidator({ bio: field().optional().minLength(10).build() });
    const result = await v.validate({ bio: "short" });
    expect(result.valid).toBe(false);
  });
});

describe("Validator – nullable fields", () => {
  it("allows null when nullable", async () => {
    const v = createValidator({ nickname: field().nullable().minLength(3).build() });
    expect((await v.validate({ nickname: null })).valid).toBe(true);
  });
});

describe("Validator – custom rule", () => {
  it("passes custom rule", async () => {
    const v = createValidator({
      score: field()
        .custom((val) => typeof val === "number" && (val as number) % 5 === 0, "Must be divisible by 5", "div5")
        .build(),
    });
    expect((await v.validate({ score: 25 })).valid).toBe(true);
  });

  it("fails custom rule", async () => {
    const v = createValidator({
      score: field()
        .custom((val) => typeof val === "number" && (val as number) % 5 === 0, "Must be divisible by 5", "div5")
        .build(),
    });
    const result = await v.validate({ score: 23 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe("div5");
  });
});

describe("Validator – async custom rule", () => {
  it("supports async validation", async () => {
    const v = createValidator({
      username: field()
        .custom(async (val) => {
          await new Promise((r) => setTimeout(r, 1));
          return val !== "taken";
        }, "Username is taken", "uniqueUsername")
        .build(),
    });
    expect((await v.validate({ username: "alice" })).valid).toBe(true);
    const result = await v.validate({ username: "taken" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe("uniqueUsername");
  });
});

describe("Validator – cross-field validation (password match)", () => {
  it("passes when passwords match", async () => {
    const rule = passwordMatchRule();
    const v = createValidator({
      password: field().required().minLength(8).build(),
      confirmPassword: field().required().build(),
    });
    v.crossField(rule.fields, rule.validate, rule.message, rule.path, rule.code);
    const result = await v.validate({ password: "secret123", confirmPassword: "secret123" });
    expect(result.valid).toBe(true);
  });

  it("fails when passwords do not match", async () => {
    const rule = passwordMatchRule();
    const v = createValidator({
      password: field().required().minLength(8).build(),
      confirmPassword: field().required().build(),
    });
    v.crossField(rule.fields, rule.validate, rule.message, rule.path, rule.code);
    const result = await v.validate({ password: "secret123", confirmPassword: "wrong" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "passwordMatch")).toBe(true);
  });
});

describe("Validator – conditional validation", () => {
  it("skips conditional field when condition is false", async () => {
    const v = createValidator({
      hasPhone: field().optional().build(),
    });
    v.when(
      (data) => data["hasPhone"] === true,
      "phone",
      field().required().pattern(/^\+?\d{10,15}$/).build()
    );
    const result = await v.validate({ hasPhone: false });
    expect(result.valid).toBe(true);
  });

  it("validates conditional field when condition is true", async () => {
    const v = createValidator({
      hasPhone: field().optional().build(),
    });
    v.when(
      (data) => data["hasPhone"] === true,
      "phone",
      field().required().pattern(/^\+?\d{10,15}$/).build()
    );
    const result = await v.validate({ hasPhone: true, phone: "" });
    expect(result.valid).toBe(false);
  });
});

describe("Validator – abortEarly option", () => {
  it("returns only first error when abortEarly is true", async () => {
    const v = createValidator(
      {
        name: field().required().minLength(10).build(),
        email: field().required().email().build(),
      },
      { abortEarly: true }
    );
    const result = await v.validate({ name: "", email: "bad" });
    expect(result.errors.length).toBeLessThanOrEqual(1);
  });

  it("returns all errors when abortEarly is false", async () => {
    const v = createValidator(
      {
        name: field().required().build(),
        email: field().required().email().build(),
      },
      { abortEarly: false }
    );
    const result = await v.validate({ name: "", email: "bad" });
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("Validator – i18n", () => {
  it("uses Korean messages when locale is ko", async () => {
    const v = createValidator(
      { name: field().required().build() },
      { locale: "ko" }
    );
    const result = await v.validate({ name: "" });
    expect(result.errors[0]?.message).toBe("필수 입력 항목입니다");
  });
});

describe("Validator – number rules", () => {
  it("validates min", async () => {
    const v = createValidator({ age: field().min(18).build() });
    expect((await v.validate({ age: 20 })).valid).toBe(true);
    expect((await v.validate({ age: 10 })).valid).toBe(false);
  });

  it("validates max", async () => {
    const v = createValidator({ rating: field().max(5).build() });
    expect((await v.validate({ rating: 3 })).valid).toBe(true);
    expect((await v.validate({ rating: 10 })).valid).toBe(false);
  });

  it("validates integer", async () => {
    const v = createValidator({ count: field().integer().build() });
    expect((await v.validate({ count: 3 })).valid).toBe(true);
    expect((await v.validate({ count: 3.5 })).valid).toBe(false);
  });
});

describe("Validator – validateSync", () => {
  it("validates synchronously", () => {
    const v = createValidator({ name: field().required().build() });
    const result = v.validateSync({ name: "Alice" });
    expect(result.valid).toBe(true);
  });

  it("throws on async rules in sync mode", () => {
    const v = createValidator({
      name: field().custom(async () => true, "async rule").build(),
    });
    expect(() => v.validateSync({ name: "x" })).toThrow();
  });
});

describe("Validator – transform", () => {
  it("applies transform before validation", async () => {
    const v = createValidator({
      email: field()
        .transform((v) => (typeof v === "string" ? v.trim().toLowerCase() : v))
        .email()
        .build(),
    });
    const result = await v.validate({ email: "  USER@EXAMPLE.COM  " });
    expect(result.valid).toBe(true);
  });
});
