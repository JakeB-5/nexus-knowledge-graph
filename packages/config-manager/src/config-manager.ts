/**
 * ConfigManager - layered, type-safe configuration manager with hot reload
 */

import type {
  ConfigChangeEvent,
  ConfigChangeListener,
  ConfigProvider,
  ConfigSchema,
  ConfigSnapshot,
  ConfigSource,
  ValidationResult,
} from "./types.js";
import { SchemaValidator } from "./schema.js";

const SECRET_MASK = "[SECRET]";

export interface ConfigManagerOptions {
  schema?: ConfigSchema;
  /** If true, prevent runtime changes (for production) */
  frozen?: boolean;
  /** If true, validate on every set() call */
  validateOnSet?: boolean;
}

export class ConfigManager {
  private readonly layers = new Map<ConfigSource, Record<string, unknown>>();
  private readonly providers: ConfigProvider[] = [];
  private readonly listeners = new Map<string, Set<ConfigChangeListener>>();
  private readonly globalListeners = new Set<ConfigChangeListener>();
  private readonly validator: SchemaValidator | null;
  private frozen: boolean;
  private readonly validateOnSet: boolean;

  constructor(options: ConfigManagerOptions = {}) {
    this.validator = options.schema ? new SchemaValidator(options.schema) : null;
    this.frozen = options.frozen ?? false;
    this.validateOnSet = options.validateOnSet ?? false;
  }

  /** Add a config provider (loaded in order: default → file → env → remote → override) */
  async addProvider(provider: ConfigProvider): Promise<void> {
    this.providers.push(provider);
    const values = await provider.load();
    this.layers.set(provider.source, { ...(this.layers.get(provider.source) ?? {}), ...values });

    // Watch for changes
    provider.watch?.((changes) => {
      const existing = this.layers.get(provider.source) ?? {};
      for (const [key, newValue] of Object.entries(changes)) {
        const oldValue = this.resolveKey(key);
        existing[key] = newValue;
        this.layers.set(provider.source, existing);
        const resolvedNew = this.resolveKey(key);
        if (JSON.stringify(oldValue) !== JSON.stringify(resolvedNew)) {
          this.emitChange(key, oldValue, resolvedNew, provider.source);
        }
      }
    });
  }

  /** Get a config value by dot-notation key */
  get<T = unknown>(key: string): T | undefined {
    return this.resolveKey(key) as T | undefined;
  }

  /** Get a required config value - throws if missing */
  getOrThrow<T = unknown>(key: string): T {
    const value = this.resolveKey(key);
    if (value === undefined || value === null) {
      throw new Error(`Required config key '${key}' is not set`);
    }
    return value as T;
  }

  /** Get a config value with a fallback default */
  getWithDefault<T>(key: string, defaultValue: T): T {
    const value = this.resolveKey(key);
    return (value ?? defaultValue) as T;
  }

  /** Get a string value */
  getString(key: string): string | undefined {
    const value = this.get(key);
    return value != null ? String(value) : undefined;
  }

  /** Get a number value */
  getNumber(key: string): number | undefined {
    const value = this.get(key);
    if (value == null) return undefined;
    const n = Number(value);
    return isNaN(n) ? undefined : n;
  }

  /** Get a boolean value */
  getBoolean(key: string): boolean | undefined {
    const value = this.get(key);
    if (value == null) return undefined;
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return Boolean(value);
  }

  /** Set a runtime override value */
  set(key: string, value: unknown, source: ConfigSource = "override" as ConfigSource): void {
    if (this.frozen) {
      throw new Error(`ConfigManager is frozen: cannot set '${key}' at runtime`);
    }

    if (this.validateOnSet && this.validator) {
      const keySchema = this.validator.getKeySchema(key);
      if (keySchema) {
        const errors = this.validator.validateValue(key, value, keySchema);
        if (errors.length > 0) {
          throw new Error(`Validation failed for '${key}': ${errors.map((e) => e.message).join(", ")}`);
        }
      }
    }

    const oldValue = this.resolveKey(key);
    const layer = this.layers.get(source) ?? {};
    layer[key] = value;
    this.layers.set(source, layer);

    if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
      this.emitChange(key, oldValue, value, source);
    }
  }

  /** Delete an override value */
  delete(key: string, source: ConfigSource = "override" as ConfigSource): boolean {
    if (this.frozen) throw new Error(`ConfigManager is frozen`);

    const layer = this.layers.get(source);
    if (!layer || !(key in layer)) return false;

    const oldValue = this.resolveKey(key);
    delete layer[key];

    const newValue = this.resolveKey(key);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      this.emitChange(key, oldValue, newValue, source);
    }

    return true;
  }

  /** Listen for changes to a specific key */
  on(key: string, listener: ConfigChangeListener): () => void {
    const existing = this.listeners.get(key) ?? new Set();
    existing.add(listener);
    this.listeners.set(key, existing);
    return () => existing.delete(listener);
  }

  /** Listen for all config changes */
  onAny(listener: ConfigChangeListener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  /** Validate all config values against schema */
  validate(): ValidationResult {
    if (!this.validator) {
      return { valid: true, errors: [] };
    }
    const flattened = this.getAllFlattened();
    return this.validator.validate(flattened);
  }

  /** Freeze config to prevent runtime mutations */
  freeze(): void {
    this.frozen = true;
  }

  /** Unfreeze config (for testing) */
  unfreeze(): void {
    this.frozen = false;
  }

  /** Take a snapshot of current config state */
  snapshot(): ConfigSnapshot {
    const values: Record<string, unknown> = {};
    const sources: Record<string, ConfigSource> = {};

    // Iterate keys across all layers in priority order
    const layerOrder = this.getLayerOrder();
    for (const [source, layer] of layerOrder) {
      for (const key of Object.keys(layer)) {
        if (!(key in values)) {
          const resolved = this.resolveKey(key);
          if (resolved !== undefined) {
            values[key] = this.isMasked(key) ? SECRET_MASK : resolved;
            sources[key] = source;
          }
        }
      }
    }

    return { timestamp: new Date(), values, sources };
  }

  /** Diff two snapshots */
  diffSnapshots(
    a: ConfigSnapshot,
    b: ConfigSnapshot
  ): Record<string, { before: unknown; after: unknown }> {
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    const allKeys = new Set([...Object.keys(a.values), ...Object.keys(b.values)]);

    for (const key of allKeys) {
      const before = a.values[key];
      const after = b.values[key];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes[key] = { before, after };
      }
    }

    return changes;
  }

  /** Reload all providers */
  async reload(): Promise<void> {
    for (const provider of this.providers) {
      const values = await provider.load();
      const existing = this.layers.get(provider.source) ?? {};
      const merged = { ...existing, ...values };
      this.layers.set(provider.source, merged);
    }
  }

  /** Get all config values as a flat object (highest priority wins) */
  getAllFlattened(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const layerOrder = this.getLayerOrder();

    for (const [, layer] of layerOrder) {
      for (const key of Object.keys(layer)) {
        if (!(key in result)) {
          const val = this.resolveKey(key);
          if (val !== undefined) result[key] = val;
        }
      }
    }

    return result;
  }

  /** Get a masked view of config (secrets replaced) */
  getMasked(): Record<string, unknown> {
    const all = this.getAllFlattened();
    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(all)) {
      masked[key] = this.isMasked(key) ? SECRET_MASK : value;
    }

    return masked;
  }

  // Resolve key across layers in priority order (highest priority = last in the order)
  private resolveKey(key: string): unknown {
    const ordered = this.getLayerOrder();

    // Iterate from highest priority to lowest
    for (let i = ordered.length - 1; i >= 0; i--) {
      const [, layer] = ordered[i]!;
      if (key in layer) {
        return layer[key];
      }
    }

    // Check schema default
    if (this.validator) {
      const def = this.validator.getDefault(key);
      if (def !== undefined) return def;
    }

    return undefined;
  }

  private getLayerOrder(): Array<[ConfigSource, Record<string, unknown>]> {
    // Priority: default < file < env < remote < override
    const order: ConfigSource[] = [
      "default" as ConfigSource,
      "file" as ConfigSource,
      "env" as ConfigSource,
      "remote" as ConfigSource,
      "override" as ConfigSource,
    ];

    return order
      .map((source) => [source, this.layers.get(source) ?? {}] as [ConfigSource, Record<string, unknown>])
      .filter(([, layer]) => Object.keys(layer).length > 0);
  }

  private emitChange(key: string, oldValue: unknown, newValue: unknown, source: ConfigSource): void {
    const event: ConfigChangeEvent = {
      key,
      oldValue,
      newValue,
      source,
      timestamp: new Date(),
    };

    // Key-specific listeners
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      for (const listener of keyListeners) {
        listener(event);
      }
    }

    // Global listeners
    for (const listener of this.globalListeners) {
      listener(event);
    }
  }

  private isMasked(key: string): boolean {
    return this.validator?.isSecret(key) ?? false;
  }
}
