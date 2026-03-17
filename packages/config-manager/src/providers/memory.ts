/**
 * In-memory config provider - primarily for testing
 */

import type { ConfigProvider } from "../types.js";
import { ConfigSource } from "../types.js";

export interface MemoryProviderOptions {
  values?: Record<string, unknown>;
  source?: ConfigSource;
}

export class MemoryProvider implements ConfigProvider {
  readonly name = "memory";
  readonly source: ConfigSource;

  private values: Record<string, unknown>;
  private watchCallback?: (changes: Record<string, unknown>) => void;

  constructor(options: MemoryProviderOptions = {}) {
    this.values = { ...(options.values ?? {}) };
    this.source = options.source ?? ConfigSource.Default;
  }

  async load(): Promise<Record<string, unknown>> {
    return { ...this.values };
  }

  watch(onChange: (changes: Record<string, unknown>) => void): void {
    this.watchCallback = onChange;
  }

  unwatch(): void {
    this.watchCallback = undefined;
  }

  /** Update values and notify watchers (for testing hot reload) */
  set(key: string, value: unknown): void {
    this.values[key] = value;
    this.watchCallback?.({ [key]: value });
  }

  /** Remove a value and notify watchers */
  delete(key: string): void {
    delete this.values[key];
    this.watchCallback?.({ [key]: undefined });
  }

  /** Replace all values */
  setAll(values: Record<string, unknown>): void {
    this.values = { ...values };
    this.watchCallback?.(this.values);
  }
}
