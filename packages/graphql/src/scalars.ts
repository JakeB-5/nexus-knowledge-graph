import { GraphQLScalarType, Kind } from "graphql";

// ─── DateTime Scalar ──────────────────────────────────────────────────────────

export const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO-8601 date-time string",

  serialize(value: unknown): string {
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw new Error("DateTimeScalar: invalid Date value");
      }
      return value.toISOString();
    }
    if (typeof value === "string") {
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        throw new Error(`DateTimeScalar: invalid date string "${value}"`);
      }
      return d.toISOString();
    }
    if (typeof value === "number") {
      return new Date(value).toISOString();
    }
    throw new Error(`DateTimeScalar: cannot serialize value of type ${typeof value}`);
  },

  parseValue(value: unknown): Date {
    if (typeof value === "string" || typeof value === "number") {
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        throw new Error(`DateTimeScalar: invalid input "${value}"`);
      }
      return d;
    }
    if (value instanceof Date) return value;
    throw new Error(`DateTimeScalar: invalid input type ${typeof value}`);
  },

  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
      const d = new Date(ast.value);
      if (isNaN(d.getTime())) {
        throw new Error(`DateTimeScalar: invalid literal "${ast.value}"`);
      }
      return d;
    }
    throw new Error(`DateTimeScalar: unsupported literal kind ${ast.kind}`);
  },
});

// ─── JSON Scalar ──────────────────────────────────────────────────────────────

export const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",

  serialize(value: unknown): unknown {
    return value;
  },

  parseValue(value: unknown): unknown {
    return value;
  },

  parseLiteral(ast): unknown {
    switch (ast.kind) {
      case Kind.STRING:
        return ast.value;
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
        return parseInt(ast.value, 10);
      case Kind.FLOAT:
        return parseFloat(ast.value);
      case Kind.NULL:
        return null;
      case Kind.LIST:
        return ast.values.map((v) => JSONScalar.parseLiteral!(v, {}));
      case Kind.OBJECT:
        return ast.fields.reduce<Record<string, unknown>>((acc, field) => {
          acc[field.name.value] = JSONScalar.parseLiteral!(field.value, {});
          return acc;
        }, {});
      default:
        throw new Error(`JSONScalar: unsupported kind ${ast.kind}`);
    }
  },
});

// ─── UUID Scalar ──────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const UUIDScalar = new GraphQLScalarType({
  name: "UUID",
  description: "RFC 4122 UUID string",

  serialize(value: unknown): string {
    if (typeof value !== "string" || !UUID_RE.test(value)) {
      throw new Error(`UUIDScalar: invalid UUID value "${value}"`);
    }
    return value.toLowerCase();
  },

  parseValue(value: unknown): string {
    if (typeof value !== "string" || !UUID_RE.test(value)) {
      throw new Error(`UUIDScalar: invalid UUID input "${value}"`);
    }
    return value.toLowerCase();
  },

  parseLiteral(ast): string {
    if (ast.kind !== Kind.STRING) {
      throw new Error(`UUIDScalar: expected string literal, got ${ast.kind}`);
    }
    if (!UUID_RE.test(ast.value)) {
      throw new Error(`UUIDScalar: invalid UUID literal "${ast.value}"`);
    }
    return ast.value.toLowerCase();
  },
});

export const scalars = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
  UUID: UUIDScalar,
};
