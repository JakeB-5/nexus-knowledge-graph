// Core Validator class with fluent builder API

import {
  type ValidationRule,
  type ValidationResult,
  type ValidationError,
  type ValidatorOptions,
  type FieldSchema,
  type SchemaDefinition,
  type ValidationContext,
  DEFAULT_MESSAGES,
  interpolateMessage,
} from "./types.js";

// ─── Field Builder ────────────────────────────────────────────────────────────

export class FieldBuilder {
  private rules: ValidationRule[] = [];
  private _optional = false;
  private _nullable = false;
  private _transforms: Array<(v: unknown) => unknown> = [];

  required(message?: string): this {
    this.rules.push({
      name: "required",
      message: message ?? "This field is required",
      params: {},
      validate: (value) =>
        value !== undefined && value !== null && value !== "",
    });
    return this;
  }

  optional(): this {
    this._optional = true;
    return this;
  }

  nullable(): this {
    this._nullable = true;
    return this;
  }

  minLength(min: number, message?: string): this {
    this.rules.push({
      name: "minLength",
      message: message ?? "Must be at least {min} characters",
      params: { min },
      validate: (value) => typeof value === "string" && value.length >= min,
    });
    return this;
  }

  maxLength(max: number, message?: string): this {
    this.rules.push({
      name: "maxLength",
      message: message ?? "Must be at most {max} characters",
      params: { max },
      validate: (value) => typeof value === "string" && value.length <= max,
    });
    return this;
  }

  email(message?: string): this {
    const re =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    this.rules.push({
      name: "email",
      message: message ?? "Must be a valid email address",
      params: {},
      validate: (value) => typeof value === "string" && re.test(value),
    });
    return this;
  }

  url(message?: string): this {
    this.rules.push({
      name: "url",
      message: message ?? "Must be a valid URL",
      params: {},
      validate: (value) => {
        if (typeof value !== "string") return false;
        try {
          const u = new URL(value);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      },
    });
    return this;
  }

  uuid(message?: string): this {
    const re =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    this.rules.push({
      name: "uuid",
      message: message ?? "Must be a valid UUID",
      params: {},
      validate: (value) => typeof value === "string" && re.test(value),
    });
    return this;
  }

  pattern(regex: RegExp, message?: string): this {
    this.rules.push({
      name: "pattern",
      message: message ?? "Must match the required pattern",
      params: { pattern: regex.source },
      validate: (value) => typeof value === "string" && regex.test(value),
    });
    return this;
  }

  min(minimum: number, message?: string): this {
    this.rules.push({
      name: "min",
      message: message ?? "Must be at least {min}",
      params: { min: minimum },
      validate: (value) => typeof value === "number" && value >= minimum,
    });
    return this;
  }

  max(maximum: number, message?: string): this {
    this.rules.push({
      name: "max",
      message: message ?? "Must be at most {max}",
      params: { max: maximum },
      validate: (value) => typeof value === "number" && value <= maximum,
    });
    return this;
  }

  integer(message?: string): this {
    this.rules.push({
      name: "integer",
      message: message ?? "Must be an integer",
      params: {},
      validate: (value) => typeof value === "number" && Number.isInteger(value),
    });
    return this;
  }

  custom(
    fn: (value: unknown, context?: ValidationContext) => boolean | Promise<boolean>,
    message: string,
    code?: string
  ): this {
    this.rules.push({
      name: code ?? "custom",
      message,
      params: {},
      validate: fn,
    });
    return this;
  }

  transform(fn: (value: unknown) => unknown): this {
    this._transforms.push(fn);
    return this;
  }

  build(): FieldSchema {
    return {
      rules: [...this.rules],
      optional: this._optional,
      nullable: this._nullable,
      transform: this._transforms.length
        ? (value: unknown) =>
            this._transforms.reduce((v, fn) => fn(v), value)
        : undefined,
    };
  }
}

// ─── Validator ────────────────────────────────────────────────────────────────

export class Validator {
  private schema: SchemaDefinition;
  private options: ValidatorOptions;
  private crossFieldRules: Array<{
    fields: string[];
    validate: (values: Record<string, unknown>) => boolean;
    message: string;
    path: string;
    code: string;
  }> = [];
  private conditionalRules: Array<{
    condition: (data: Record<string, unknown>) => boolean;
    field: string;
    schema: FieldSchema;
  }> = [];

  constructor(schema: SchemaDefinition, options: ValidatorOptions = {}) {
    this.schema = schema;
    this.options = { abortEarly: false, locale: "en", ...options };
  }

  /** Fluent builder for a single field */
  static field(): FieldBuilder {
    return new FieldBuilder();
  }

  /** Add a cross-field validation rule */
  crossField(
    fields: string[],
    validate: (values: Record<string, unknown>) => boolean,
    message: string,
    path: string,
    code = "crossField"
  ): this {
    this.crossFieldRules.push({ fields, validate, message, path, code });
    return this;
  }

  /** Add a conditional rule: validate `field` with `schema` only when `condition` is true */
  when(
    condition: (data: Record<string, unknown>) => boolean,
    field: string,
    schema: FieldSchema
  ): this {
    this.conditionalRules.push({ condition, field, schema });
    return this;
  }

  private resolveMessage(
    rule: ValidationRule,
    locale: string,
    overrides?: Record<string, string>
  ): string {
    const params = rule.params ?? {};

    // Check user-supplied overrides first
    if (overrides?.[rule.name]) {
      return interpolateMessage(overrides[rule.name]!, params);
    }

    // Then locale messages
    const localeMessages = DEFAULT_MESSAGES[locale] ?? DEFAULT_MESSAGES["en"]!;
    const localeMsg = localeMessages[rule.name];
    if (localeMsg) {
      return interpolateMessage(localeMsg, params);
    }

    // Fallback to the rule's own message
    if (typeof rule.message === "function") {
      return rule.message(params);
    }
    return interpolateMessage(rule.message, params);
  }

  private async validateField(
    path: string,
    value: unknown,
    schema: FieldSchema,
    root: Record<string, unknown>,
    locale: string,
    messages?: Record<string, string>
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    const context: ValidationContext = {
      field: path,
      root,
      options: this.options,
      locale,
    };

    // Apply transforms
    let current = value;
    if (schema.transform) {
      current = schema.transform(current);
    }

    // Skip validation if optional and absent
    if (schema.optional && (current === undefined || current === null || current === "")) {
      return errors;
    }

    // Allow null if nullable
    if (schema.nullable && current === null) {
      return errors;
    }

    for (const rule of schema.rules) {
      let passed: boolean;
      try {
        const result = rule.validate(current, context);
        passed = result instanceof Promise ? await result : result;
      } catch {
        passed = false;
      }

      if (!passed) {
        errors.push({
          path,
          message: this.resolveMessage(rule, locale, messages),
          code: rule.name,
        });
        if (this.options.abortEarly) break;
      }
    }

    return errors;
  }

  /** Validate nested object recursively */
  private async validateNested(
    prefix: string,
    obj: Record<string, unknown>,
    schema: SchemaDefinition,
    root: Record<string, unknown>,
    locale: string,
    messages?: Record<string, string>
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    for (const [key, fieldSchema] of Object.entries(schema)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      const fieldErrors = await this.validateField(
        path,
        value,
        fieldSchema,
        root,
        locale,
        messages
      );
      errors.push(...fieldErrors);
      if (this.options.abortEarly && errors.length > 0) return errors;
    }

    return errors;
  }

  /** Validate an array field — each item validated with itemSchema */
  async validateArray(
    path: string,
    items: unknown[],
    itemSchema: FieldSchema,
    root: Record<string, unknown>,
    locale = "en"
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    for (let i = 0; i < items.length; i++) {
      const itemErrors = await this.validateField(
        `${path}[${i}]`,
        items[i],
        itemSchema,
        root,
        locale,
        this.options.messages
      );
      errors.push(...itemErrors);
      if (this.options.abortEarly && errors.length > 0) break;
    }
    return errors;
  }

  async validate(data: Record<string, unknown>): Promise<ValidationResult> {
    const locale = this.options.locale ?? "en";
    const messages = this.options.messages;
    const errors: ValidationError[] = [];

    // Main schema validation
    const schemaErrors = await this.validateNested(
      "",
      data,
      this.schema,
      data,
      locale,
      messages
    );
    errors.push(...schemaErrors);
    if (this.options.abortEarly && errors.length > 0) {
      return { valid: false, errors };
    }

    // Conditional rules
    for (const conditional of this.conditionalRules) {
      if (!conditional.condition(data)) continue;
      const value = data[conditional.field];
      const condErrors = await this.validateField(
        conditional.field,
        value,
        conditional.schema,
        data,
        locale,
        messages
      );
      errors.push(...condErrors);
      if (this.options.abortEarly && errors.length > 0) {
        return { valid: false, errors };
      }
    }

    // Cross-field rules
    for (const crossRule of this.crossFieldRules) {
      const values: Record<string, unknown> = {};
      for (const field of crossRule.fields) {
        values[field] = data[field];
      }
      const passed = crossRule.validate(values);
      if (!passed) {
        errors.push({
          path: crossRule.path,
          message: crossRule.message,
          code: crossRule.code,
        });
        if (this.options.abortEarly) return { valid: false, errors };
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /** Synchronous validate — throws if async rules are used */
  validateSync(data: Record<string, unknown>): ValidationResult {
    const locale = this.options.locale ?? "en";
    const messages = this.options.messages;
    const errors: ValidationError[] = [];

    for (const [key, fieldSchema] of Object.entries(this.schema)) {
      const value = data[key];
      const context: ValidationContext = {
        field: key,
        root: data,
        options: this.options,
        locale,
      };

      let current = value;
      if (fieldSchema.transform) current = fieldSchema.transform(current);

      if (
        fieldSchema.optional &&
        (current === undefined || current === null || current === "")
      ) {
        continue;
      }

      if (fieldSchema.nullable && current === null) continue;

      for (const rule of fieldSchema.rules) {
        const result = rule.validate(current, context);
        if (result instanceof Promise) {
          throw new Error(
            `Rule "${rule.name}" is async — use validate() instead of validateSync()`
          );
        }
        if (!result) {
          errors.push({
            path: key,
            message: this.resolveMessage(rule, locale, messages),
            code: rule.name,
          });
          if (this.options.abortEarly) break;
        }
      }

      if (this.options.abortEarly && errors.length > 0) break;
    }

    // Cross-field rules (sync only)
    for (const crossRule of this.crossFieldRules) {
      const values: Record<string, unknown> = {};
      for (const field of crossRule.fields) {
        values[field] = data[field];
      }
      if (!crossRule.validate(values)) {
        errors.push({
          path: crossRule.path,
          message: crossRule.message,
          code: crossRule.code,
        });
        if (this.options.abortEarly) break;
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// ─── Schema Builder Helpers ───────────────────────────────────────────────────

/** Convenience: create a password-match cross-field validator */
export function passwordMatchRule(
  passwordField = "password",
  confirmField = "confirmPassword",
  message = "Passwords must match"
): {
  fields: string[];
  validate: (values: Record<string, unknown>) => boolean;
  message: string;
  path: string;
  code: string;
} {
  return {
    fields: [passwordField, confirmField],
    validate: (values) => values[passwordField] === values[confirmField],
    message,
    path: confirmField,
    code: "passwordMatch",
  };
}

/** Convenience: build a Validator from a plain schema map with options */
export function createValidator(
  schema: SchemaDefinition,
  options?: ValidatorOptions
): Validator {
  return new Validator(schema, options);
}
