import { describe, it, expect } from "vitest";
import { SchemaValidator } from "../schema.js";
import type { ConfigSchema } from "../types.js";

const schema: ConfigSchema = {
  "app.name": { type: "string", required: true, description: "Application name" },
  "app.port": { type: "number", default: 3000, constraints: { min: 1024, max: 65535 } },
  "app.debug": { type: "boolean", default: false },
  "database.host": { type: "string", default: "localhost" },
  "database.password": { type: "string", secret: true },
  "app.env": { type: "string", constraints: { enum: ["development", "staging", "production"] } },
  "app.logLevel": { type: "string", constraints: { minLength: 2, maxLength: 10 } },
  "app.tag": { type: "string", constraints: { pattern: "^v\\d+\\.\\d+$" } },
  "app.apiKey": { type: "secret" },
};

describe("SchemaValidator", () => {
  const validator = new SchemaValidator(schema);

  describe("validate()", () => {
    it("passes when all required keys present and valid", () => {
      const result = validator.validate({ "app.name": "Nexus" });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when required key missing", () => {
      const result = validator.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.key === "app.name")).toBe(true);
    });

    it("passes when optional key absent", () => {
      const result = validator.validate({ "app.name": "Nexus" });
      // app.port has default so not "required" in the strict sense
      expect(result.valid).toBe(true);
    });

    it("fails on wrong type", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.port": "not-a-number" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.key === "app.port")).toBe(true);
    });

    it("fails when number below min", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.port": 80 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.key === "app.port" && e.message.includes("minimum"))).toBe(true);
    });

    it("fails when number above max", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.port": 99999 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.key === "app.port" && e.message.includes("maximum"))).toBe(true);
    });

    it("passes when number within range", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.port": 8080 });
      expect(result.valid).toBe(true);
    });

    it("fails when value not in enum", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.env": "local" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.key === "app.env")).toBe(true);
    });

    it("passes when value is in enum", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.env": "production" });
      expect(result.valid).toBe(true);
    });

    it("fails when string too short", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.logLevel": "x" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.key === "app.logLevel" && e.message.includes("minLength"))).toBe(true);
    });

    it("fails when string too long", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.logLevel": "averylongloglevel" });
      expect(result.valid).toBe(false);
    });

    it("fails when pattern does not match", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.tag": "latest" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.key === "app.tag")).toBe(true);
    });

    it("passes when pattern matches", () => {
      const result = validator.validate({ "app.name": "Nexus", "app.tag": "v1.2" });
      expect(result.valid).toBe(true);
    });
  });

  describe("getKeySchema()", () => {
    it("returns schema for known key", () => {
      expect(validator.getKeySchema("app.name")).toBeDefined();
      expect(validator.getKeySchema("app.name")!.type).toBe("string");
    });

    it("returns undefined for unknown key", () => {
      expect(validator.getKeySchema("unknown.key")).toBeUndefined();
    });
  });

  describe("has()", () => {
    it("returns true for known key", () => {
      expect(validator.has("app.name")).toBe(true);
    });

    it("returns false for unknown key", () => {
      expect(validator.has("nonexistent")).toBe(false);
    });
  });

  describe("getDefault()", () => {
    it("returns default value", () => {
      expect(validator.getDefault("app.port")).toBe(3000);
    });

    it("returns undefined when no default", () => {
      expect(validator.getDefault("app.name")).toBeUndefined();
    });
  });

  describe("isSecret()", () => {
    it("returns true for secret fields", () => {
      expect(validator.isSecret("database.password")).toBe(true);
      expect(validator.isSecret("app.apiKey")).toBe(true);
    });

    it("returns false for non-secret fields", () => {
      expect(validator.isSecret("app.name")).toBe(false);
    });
  });

  describe("getRequiredKeys()", () => {
    it("returns keys that are required with no default", () => {
      const required = validator.getRequiredKeys();
      expect(required).toContain("app.name");
    });

    it("does not include keys with defaults", () => {
      const required = validator.getRequiredKeys();
      expect(required).not.toContain("app.port"); // has default
    });
  });

  describe("generateTemplate()", () => {
    it("generates valid JSON template", () => {
      const template = validator.generateTemplate("json");
      expect(() => JSON.parse(template)).not.toThrow();
      const parsed = JSON.parse(template) as Record<string, unknown>;
      expect(parsed.app).toBeDefined();
    });

    it("JSON template includes nested structure", () => {
      const template = validator.generateTemplate("json");
      const parsed = JSON.parse(template) as Record<string, { name?: unknown; port?: unknown }>;
      expect(parsed.app).toBeDefined();
      expect(parsed.app.name).toBeDefined();
      expect(parsed.app.port).toBeDefined();
    });

    it("generates env template with key=value pairs", () => {
      const template = validator.generateTemplate("env");
      expect(template).toContain("APP_NAME=");
      expect(template).toContain("APP_PORT=");
    });

    it("env template includes comments", () => {
      const template = validator.generateTemplate("env");
      expect(template).toContain("#");
    });
  });
});
