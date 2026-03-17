/**
 * Config schema definition, validation, and template generation
 */

import type {
  ConfigKeySchema,
  ConfigPrimitive,
  ConfigSchema,
  ConfigValueType,
  ValidationError,
  ValidationResult,
} from "./types.js";

export class SchemaValidator {
  private readonly schema: ConfigSchema;

  constructor(schema: ConfigSchema) {
    this.schema = schema;
  }

  /** Validate a full config object against the schema */
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];

    // Check required keys and validate present values
    for (const [key, keySchema] of Object.entries(this.schema)) {
      const value = this.getNestedValue(config, key);

      if (value === undefined || value === null) {
        if (keySchema.required && keySchema.default === undefined) {
          errors.push({ key, message: `Required config key '${key}' is missing` });
        }
        continue;
      }

      const keyErrors = this.validateValue(key, value, keySchema);
      errors.push(...keyErrors);
    }

    return { valid: errors.length === 0, errors };
  }

  /** Validate a single value against its schema */
  validateValue(key: string, value: unknown, schema: ConfigKeySchema): ValidationError[] {
    const errors: ValidationError[] = [];

    // Type check
    const typeError = this.checkType(key, value, schema.type);
    if (typeError) {
      errors.push(typeError);
      return errors; // Can't do constraint checks without correct type
    }

    // Constraints
    if (schema.constraints) {
      const constraintErrors = this.checkConstraints(key, value, schema.constraints);
      errors.push(...constraintErrors);
    }

    return errors;
  }

  /** Get the schema for a given key */
  getKeySchema(key: string): ConfigKeySchema | undefined {
    return this.schema[key];
  }

  /** Check if a key is defined in the schema */
  has(key: string): boolean {
    return key in this.schema;
  }

  /** Get the default value for a key */
  getDefault(key: string): ConfigPrimitive | undefined {
    return this.schema[key]?.default;
  }

  /** Check if a key is a secret */
  isSecret(key: string): boolean {
    return this.schema[key]?.secret === true;
  }

  /** Generate a config template with defaults and documentation */
  generateTemplate(format: "json" | "env" = "json"): string {
    if (format === "env") {
      return this.generateEnvTemplate();
    }
    return this.generateJsonTemplate();
  }

  /** Get all keys defined in the schema */
  getKeys(): string[] {
    return Object.keys(this.schema);
  }

  /** Get all required keys */
  getRequiredKeys(): string[] {
    return Object.entries(this.schema)
      .filter(([, s]) => s.required && s.default === undefined)
      .map(([k]) => k);
  }

  private generateJsonTemplate(): string {
    const template: Record<string, unknown> = {};

    for (const [key, keySchema] of Object.entries(this.schema)) {
      const parts = key.split(".");
      let current = template;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        if (typeof current[part] !== "object" || current[part] === null) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }

      const lastPart = parts[parts.length - 1]!;
      const exampleValue = keySchema.example ?? keySchema.default ?? this.exampleForType(keySchema.type);
      current[lastPart] = exampleValue;
    }

    return JSON.stringify(template, null, 2);
  }

  private generateEnvTemplate(): string {
    const lines: string[] = ["# Nexus Configuration", ""];

    for (const [key, keySchema] of Object.entries(this.schema)) {
      if (keySchema.description) {
        lines.push(`# ${keySchema.description}`);
      }
      if (keySchema.required) {
        lines.push(`# Required: true`);
      }

      const envKey = key.toUpperCase().replace(/\./g, "_");
      const exampleValue = keySchema.example ?? keySchema.default ?? this.exampleForType(keySchema.type);
      lines.push(`${envKey}=${String(exampleValue)}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  private checkType(key: string, value: unknown, expectedType: ConfigValueType): ValidationError | null {
    switch (expectedType) {
      case "string":
      case "secret":
        if (typeof value !== "string") {
          return { key, message: `Expected string, got ${typeof value}`, value };
        }
        break;
      case "number":
        if (typeof value !== "number" || isNaN(value)) {
          return { key, message: `Expected number, got ${typeof value}`, value };
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          return { key, message: `Expected boolean, got ${typeof value}`, value };
        }
        break;
      case "json":
        // Any value is acceptable for json type
        break;
    }
    return null;
  }

  private checkConstraints(
    key: string,
    value: unknown,
    constraints: NonNullable<ConfigKeySchema["constraints"]>
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (constraints.enum !== undefined && !constraints.enum.includes(value as ConfigPrimitive)) {
      errors.push({
        key,
        message: `Value must be one of: ${constraints.enum.join(", ")}`,
        value,
      });
    }

    if (typeof value === "number") {
      if (constraints.min !== undefined && value < constraints.min) {
        errors.push({ key, message: `Value ${value} is less than minimum ${constraints.min}`, value });
      }
      if (constraints.max !== undefined && value > constraints.max) {
        errors.push({ key, message: `Value ${value} is greater than maximum ${constraints.max}`, value });
      }
    }

    if (typeof value === "string") {
      if (constraints.minLength !== undefined && value.length < constraints.minLength) {
        errors.push({ key, message: `String length ${value.length} is less than minLength ${constraints.minLength}`, value });
      }
      if (constraints.maxLength !== undefined && value.length > constraints.maxLength) {
        errors.push({ key, message: `String length ${value.length} is greater than maxLength ${constraints.maxLength}`, value });
      }
      if (constraints.pattern !== undefined && !new RegExp(constraints.pattern).test(value)) {
        errors.push({ key, message: `Value does not match pattern ${constraints.pattern}`, value });
      }
    }

    return errors;
  }

  private getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    const parts = key.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private exampleForType(type: ConfigValueType): ConfigPrimitive {
    switch (type) {
      case "string": return "example-value";
      case "secret": return "your-secret-here";
      case "number": return 0;
      case "boolean": return false;
      case "json": return "{}";
    }
  }
}
