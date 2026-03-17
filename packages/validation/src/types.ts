// Core validation types for the Nexus validation framework

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidatorOptions {
  abortEarly?: boolean;
  locale?: string;
  messages?: Record<string, string>;
  context?: Record<string, unknown>;
}

export type RuleFunction<T = unknown> = (
  value: T,
  context?: ValidationContext
) => boolean | Promise<boolean>;

export interface ValidationRule<T = unknown> {
  name: string;
  message: string | ((params: Record<string, unknown>) => string);
  params?: Record<string, unknown>;
  validate: RuleFunction<T>;
}

export interface ValidationContext {
  field: string;
  root: Record<string, unknown>;
  options: ValidatorOptions;
  locale: string;
}

export type FieldSchema = {
  rules: ValidationRule[];
  optional?: boolean;
  nullable?: boolean;
  transform?: (value: unknown) => unknown;
};

export type SchemaDefinition = Record<string, FieldSchema>;

export interface FieldBuilder {
  required(message?: string): FieldBuilder;
  optional(): FieldBuilder;
  nullable(): FieldBuilder;
  custom(fn: RuleFunction, message: string, code?: string): FieldBuilder;
  build(): FieldSchema;
}

// Default error messages per locale
export const DEFAULT_MESSAGES: Record<string, Record<string, string>> = {
  en: {
    required: "This field is required",
    minLength: "Must be at least {min} characters",
    maxLength: "Must be at most {max} characters",
    email: "Must be a valid email address",
    url: "Must be a valid URL",
    uuid: "Must be a valid UUID",
    pattern: "Must match the required pattern",
    min: "Must be at least {min}",
    max: "Must be at most {max}",
    integer: "Must be an integer",
    positive: "Must be a positive number",
    negative: "Must be a negative number",
    between: "Must be between {min} and {max}",
    multipleOf: "Must be a multiple of {factor}",
    precision: "Must have at most {digits} decimal places",
    minItems: "Must have at least {min} items",
    maxItems: "Must have at most {max} items",
    unique: "All items must be unique",
    isDate: "Must be a valid date",
    isFuture: "Must be a future date",
    isPast: "Must be a past date",
    before: "Must be before {date}",
    after: "Must be after {date}",
    passwordMatch: "Passwords must match",
  },
  ko: {
    required: "필수 입력 항목입니다",
    minLength: "최소 {min}자 이상이어야 합니다",
    maxLength: "최대 {max}자 이하이어야 합니다",
    email: "올바른 이메일 주소를 입력하세요",
    url: "올바른 URL을 입력하세요",
    uuid: "올바른 UUID를 입력하세요",
    pattern: "올바른 형식을 입력하세요",
    min: "최솟값은 {min}입니다",
    max: "최댓값은 {max}입니다",
    integer: "정수를 입력하세요",
    positive: "양수를 입력하세요",
    negative: "음수를 입력하세요",
    between: "{min}과 {max} 사이의 값을 입력하세요",
    multipleOf: "{factor}의 배수를 입력하세요",
    precision: "소수점 이하 {digits}자리까지만 입력하세요",
    minItems: "최소 {min}개의 항목이 필요합니다",
    maxItems: "최대 {max}개의 항목만 허용됩니다",
    unique: "모든 항목은 고유해야 합니다",
    isDate: "올바른 날짜를 입력하세요",
    isFuture: "미래 날짜를 입력하세요",
    isPast: "과거 날짜를 입력하세요",
    before: "{date} 이전의 날짜를 입력하세요",
    after: "{date} 이후의 날짜를 입력하세요",
    passwordMatch: "비밀번호가 일치해야 합니다",
  },
};

export function interpolateMessage(
  template: string,
  params: Record<string, unknown>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in params ? String(params[key as string]) : `{${key}}`
  );
}
