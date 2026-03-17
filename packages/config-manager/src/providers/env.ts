/**
 * Environment variable config provider
 * Maps NEXUS_DB_HOST → database.host
 */

import type { ConfigProvider } from "../types.js";
import { ConfigSource } from "../types.js";

export interface EnvProviderOptions {
  /** Only load env vars with this prefix (default: "NEXUS_") */
  prefix?: string;
  /** Strip prefix from key names */
  stripPrefix?: boolean;
}

export class EnvProvider implements ConfigProvider {
  readonly name = "env";
  readonly source = ConfigSource.Env;

  private readonly prefix: string;
  private readonly stripPrefix: boolean;

  constructor(options: EnvProviderOptions = {}) {
    this.prefix = options.prefix ?? "NEXUS_";
    this.stripPrefix = options.stripPrefix ?? true;
  }

  async load(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    for (const [rawKey, rawValue] of Object.entries(process.env)) {
      if (!rawKey.startsWith(this.prefix)) continue;
      if (rawValue === undefined) continue;

      const stripped = this.stripPrefix ? rawKey.slice(this.prefix.length) : rawKey;
      const dotKey = this.toDotNotation(stripped);
      result[dotKey] = this.coerceValue(rawValue);
    }

    return result;
  }

  /** Convert SNAKE_CASE env key to dot.notation (DB_HOST → database.host is NOT done here;
   *  simple underscore → dot conversion: DB_HOST → db.host) */
  private toDotNotation(key: string): string {
    // First split on double underscore for nesting: DB__HOST → db.host
    // Then lowercase
    return key
      .split("__")
      .map((part) => part.toLowerCase())
      .join(".");
  }

  /** Coerce string env var to appropriate type */
  private coerceValue(value: string): unknown {
    // Boolean
    if (value === "true") return true;
    if (value === "false") return false;

    // Number
    const num = Number(value);
    if (value !== "" && !isNaN(num)) return num;

    // JSON (objects/arrays)
    if ((value.startsWith("{") && value.endsWith("}")) ||
        (value.startsWith("[") && value.endsWith("]"))) {
      try {
        return JSON.parse(value);
      } catch {
        // Fall through to string
      }
    }

    return value;
  }
}
