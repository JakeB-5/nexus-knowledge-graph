/**
 * Config manager types
 */

// Primitive config value types
export type ConfigPrimitive = string | number | boolean | null;
export type ConfigValueType = "string" | "number" | "boolean" | "json" | "secret";

// A resolved config value with its source
export interface ConfigValue<T = unknown> {
  value: T;
  source: ConfigSource;
  key: string;
}

// Where the config value came from (layered priority)
export enum ConfigSource {
  Default = "default",
  File = "file",
  Env = "env",
  Remote = "remote",
  Override = "override",
}

// Event emitted when a config value changes
export interface ConfigChangeEvent {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  source: ConfigSource;
  timestamp: Date;
}

// Listener for config changes
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

// Constraint definitions for schema validation
export interface ConfigConstraints {
  min?: number;
  max?: number;
  pattern?: string; // regex pattern string
  enum?: ConfigPrimitive[];
  minLength?: number;
  maxLength?: number;
}

// Schema definition for a single config key
export interface ConfigKeySchema {
  type: ConfigValueType;
  required?: boolean;
  default?: ConfigPrimitive;
  description?: string;
  constraints?: ConfigConstraints;
  /** If true, mask value in logs */
  secret?: boolean;
  /** Example value for template generation */
  example?: ConfigPrimitive;
}

// Full config schema (maps dot-notation keys to their schemas)
export type ConfigSchema = Record<string, ConfigKeySchema>;

// Snapshot of config state at a point in time
export interface ConfigSnapshot {
  timestamp: Date;
  values: Record<string, unknown>;
  sources: Record<string, ConfigSource>;
}

// Provider interface - each layer implements this
export interface ConfigProvider {
  /** Name of this provider (for debugging) */
  readonly name: string;
  /** Source type for values from this provider */
  readonly source: ConfigSource;
  /** Load all config values from this provider */
  load(): Promise<Record<string, unknown>>;
  /** Watch for changes (optional) */
  watch?(onChange: (changes: Record<string, unknown>) => void): void;
  /** Stop watching */
  unwatch?(): void;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  key: string;
  message: string;
  value?: unknown;
}
