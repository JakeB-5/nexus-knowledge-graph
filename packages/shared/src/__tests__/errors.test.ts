import { describe, it, expect } from "vitest";
import { NexusError, ErrorCode } from "../errors/index.js";

describe("NexusError", () => {
  it("constructs with required fields", () => {
    const err = new NexusError(ErrorCode.INTERNAL_ERROR, "Something broke", 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NexusError);
    expect(err.name).toBe("NexusError");
    expect(err.message).toBe("Something broke");
    expect(err.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(err.statusCode).toBe(500);
  });

  it("defaults statusCode to 500", () => {
    const err = new NexusError(ErrorCode.INTERNAL_ERROR, "oops");
    expect(err.statusCode).toBe(500);
  });

  it("stores optional details", () => {
    const err = new NexusError(ErrorCode.VALIDATION_ERROR, "bad input", 400, {
      field: "email",
    });
    expect(err.details).toEqual({ field: "email" });
  });
});

describe("NexusError.notFound", () => {
  it("creates a 404 NOT_FOUND error", () => {
    const err = NexusError.notFound("Node", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.message).toContain("Node");
    expect(err.message).toContain("abc-123");
  });
});

describe("NexusError.unauthorized", () => {
  it("creates a 401 UNAUTHORIZED error with default message", () => {
    const err = NexusError.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(err.message).toBeTruthy();
  });

  it("accepts a custom message", () => {
    const err = NexusError.unauthorized("Token expired");
    expect(err.message).toBe("Token expired");
  });
});

describe("NexusError.forbidden", () => {
  it("creates a 403 FORBIDDEN error", () => {
    const err = NexusError.forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(ErrorCode.FORBIDDEN);
  });

  it("accepts a custom message", () => {
    const err = NexusError.forbidden("Admin only");
    expect(err.message).toBe("Admin only");
  });
});

describe("NexusError.validation", () => {
  it("creates a 400 VALIDATION_ERROR", () => {
    const err = NexusError.validation("Invalid email");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(err.message).toBe("Invalid email");
  });

  it("stores validation details", () => {
    const err = NexusError.validation("Bad data", { field: "name", issue: "too long" });
    expect(err.details).toEqual({ field: "name", issue: "too long" });
  });
});

describe("NexusError.conflict", () => {
  it("creates a 409 CONFLICT error", () => {
    const err = NexusError.conflict("Email already exists");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe(ErrorCode.CONFLICT);
    expect(err.message).toBe("Email already exists");
  });
});

describe("NexusError.toJSON", () => {
  it("serializes to JSON with code, message, statusCode", () => {
    const err = new NexusError(ErrorCode.NOT_FOUND, "not found", 404);
    const json = err.toJSON();
    expect(json.code).toBe(ErrorCode.NOT_FOUND);
    expect(json.message).toBe("not found");
    expect(json.statusCode).toBe(404);
    expect(json.details).toBeUndefined();
  });

  it("includes details when present", () => {
    const err = NexusError.validation("bad", { field: "x" });
    const json = err.toJSON();
    expect(json.details).toEqual({ field: "x" });
  });
});
