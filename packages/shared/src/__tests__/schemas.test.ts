import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  IdSchema,
  PaginationSchema,
  PaginatedResponseSchema,
  SortOrderSchema,
  TimestampsSchema,
} from "../schemas/common.js";
import {
  NodeSchema,
  NodeTypeSchema,
  CreateNodeSchema,
  UpdateNodeSchema,
} from "../schemas/node.js";
import {
  UserSchema,
  UserRoleSchema,
  CreateUserSchema,
  LoginSchema,
  TokenPairSchema,
} from "../schemas/user.js";

// ── Common schemas ─────────────────────────────────────────────────────────

describe("IdSchema", () => {
  it("accepts a valid UUID", () => {
    expect(() => IdSchema.parse("550e8400-e29b-41d4-a716-446655440000")).not.toThrow();
  });

  it("rejects a non-UUID string", () => {
    expect(() => IdSchema.parse("not-a-uuid")).toThrow();
  });
});

describe("TimestampsSchema", () => {
  it("accepts Date objects", () => {
    const data = { createdAt: new Date(), updatedAt: new Date() };
    expect(() => TimestampsSchema.parse(data)).not.toThrow();
  });

  it("rejects missing timestamps", () => {
    expect(() => TimestampsSchema.parse({})).toThrow();
  });
});

describe("PaginationSchema", () => {
  it("applies defaults", () => {
    const result = PaginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("accepts explicit values", () => {
    const result = PaginationSchema.parse({ page: 2, limit: 50 });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });

  it("rejects limit > 100", () => {
    expect(() => PaginationSchema.parse({ limit: 101 })).toThrow();
  });

  it("rejects page < 1", () => {
    expect(() => PaginationSchema.parse({ page: 0 })).toThrow();
  });
});

describe("PaginatedResponseSchema", () => {
  it("validates a paginated response", () => {
    const schema = PaginatedResponseSchema(z.object({ id: z.string() }));
    const data = { items: [{ id: "abc" }], total: 1, page: 1, limit: 20, totalPages: 1 };
    expect(() => schema.parse(data)).not.toThrow();
  });

  it("rejects if items do not match item schema", () => {
    const schema = PaginatedResponseSchema(z.object({ id: z.string() }));
    const data = { items: [{ id: 123 }], total: 1, page: 1, limit: 20, totalPages: 1 };
    expect(() => schema.parse(data)).toThrow();
  });
});

describe("SortOrderSchema", () => {
  it("defaults to desc", () => {
    expect(SortOrderSchema.parse(undefined)).toBe("desc");
  });

  it("accepts asc and desc", () => {
    expect(SortOrderSchema.parse("asc")).toBe("asc");
    expect(SortOrderSchema.parse("desc")).toBe("desc");
  });

  it("rejects other values", () => {
    expect(() => SortOrderSchema.parse("up")).toThrow();
  });
});

// ── Node schemas ───────────────────────────────────────────────────────────

describe("NodeTypeSchema", () => {
  it("accepts valid node types", () => {
    const types = ["document", "concept", "tag", "person", "organization", "event", "location", "resource"];
    for (const t of types) {
      expect(() => NodeTypeSchema.parse(t)).not.toThrow();
    }
  });

  it("rejects unknown types", () => {
    expect(() => NodeTypeSchema.parse("unknown")).toThrow();
  });
});

describe("NodeSchema", () => {
  const validNode = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "document",
    title: "My Node",
    ownerId: "550e8400-e29b-41d4-a716-446655440001",
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  };

  it("accepts a valid node", () => {
    expect(() => NodeSchema.parse(validNode)).not.toThrow();
  });

  it("rejects empty title", () => {
    expect(() => NodeSchema.parse({ ...validNode, title: "" })).toThrow();
  });

  it("rejects title exceeding 500 chars", () => {
    expect(() => NodeSchema.parse({ ...validNode, title: "x".repeat(501) })).toThrow();
  });

  it("applies default empty metadata", () => {
    const result = NodeSchema.parse({ ...validNode });
    expect(result.metadata).toEqual({});
  });
});

describe("CreateNodeSchema", () => {
  it("does not include id, createdAt, updatedAt, embedding", () => {
    const keys = Object.keys(CreateNodeSchema.shape);
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("createdAt");
    expect(keys).not.toContain("embedding");
  });
});

describe("UpdateNodeSchema", () => {
  it("accepts partial updates", () => {
    const result = UpdateNodeSchema.parse({ title: "New Title" });
    expect(result.title).toBe("New Title");
  });

  it("does not include ownerId", () => {
    const keys = Object.keys(UpdateNodeSchema.shape);
    expect(keys).not.toContain("ownerId");
  });
});

// ── User schemas ───────────────────────────────────────────────────────────

describe("UserRoleSchema", () => {
  it("accepts valid roles", () => {
    expect(UserRoleSchema.parse("admin")).toBe("admin");
    expect(UserRoleSchema.parse("editor")).toBe("editor");
    expect(UserRoleSchema.parse("viewer")).toBe("viewer");
  });

  it("rejects invalid roles", () => {
    expect(() => UserRoleSchema.parse("superuser")).toThrow();
  });
});

describe("UserSchema", () => {
  const validUser = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "user@example.com",
    name: "Alice",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("accepts a valid user", () => {
    expect(() => UserSchema.parse(validUser)).not.toThrow();
  });

  it("defaults role to viewer", () => {
    const result = UserSchema.parse(validUser);
    expect(result.role).toBe("viewer");
  });

  it("rejects invalid email", () => {
    expect(() => UserSchema.parse({ ...validUser, email: "bad-email" })).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => UserSchema.parse({ ...validUser, name: "" })).toThrow();
  });
});

describe("LoginSchema", () => {
  it("accepts valid credentials", () => {
    expect(() => LoginSchema.parse({ email: "a@b.com", password: "password123" })).not.toThrow();
  });

  it("rejects short passwords", () => {
    expect(() => LoginSchema.parse({ email: "a@b.com", password: "short" })).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() => LoginSchema.parse({ email: "notanemail", password: "password123" })).toThrow();
  });
});

describe("TokenPairSchema", () => {
  it("accepts valid token pair", () => {
    expect(() =>
      TokenPairSchema.parse({ accessToken: "access.jwt.token", refreshToken: "refresh.jwt.token" }),
    ).not.toThrow();
  });

  it("rejects missing tokens", () => {
    expect(() => TokenPairSchema.parse({ accessToken: "token" })).toThrow();
  });
});
