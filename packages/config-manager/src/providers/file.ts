/**
 * File-based config provider (JSON and YAML-like)
 * Supports file watching and environment-specific overrides
 */

import { readFileSync, watchFile, unwatchFile, existsSync } from "fs";
import { extname } from "path";
import type { ConfigProvider } from "../types.js";
import { ConfigSource } from "../types.js";

export interface FileProviderOptions {
  /** Paths to config files, merged in order (last wins) */
  paths: string[];
  /** Environment name for env-specific files (e.g., "dev" → loads config.dev.json) */
  environment?: string;
  /** Watch files for changes */
  watch?: boolean;
}

export class FileProvider implements ConfigProvider {
  readonly name = "file";
  readonly source = ConfigSource.File;

  private readonly paths: string[];
  private readonly environment?: string;
  private readonly shouldWatch: boolean;
  private watchCallback?: (changes: Record<string, unknown>) => void;
  private watchedFiles: string[] = [];

  constructor(options: FileProviderOptions) {
    this.paths = options.paths;
    this.environment = options.environment;
    this.shouldWatch = options.watch ?? false;
  }

  async load(): Promise<Record<string, unknown>> {
    const allPaths = this.resolveAllPaths();
    let merged: Record<string, unknown> = {};

    for (const filePath of allPaths) {
      if (!existsSync(filePath)) continue;
      const content = this.parseFile(filePath);
      merged = this.deepMerge(merged, content);
    }

    return this.flattenKeys(merged);
  }

  watch(onChange: (changes: Record<string, unknown>) => void): void {
    if (!this.shouldWatch) return;
    this.watchCallback = onChange;

    const allPaths = this.resolveAllPaths();
    for (const filePath of allPaths) {
      if (!existsSync(filePath)) continue;

      this.watchedFiles.push(filePath);
      watchFile(filePath, { interval: 1000 }, () => {
        void this.load().then((values) => {
          onChange(values);
        });
      });
    }
  }

  unwatch(): void {
    for (const filePath of this.watchedFiles) {
      unwatchFile(filePath);
    }
    this.watchedFiles = [];
    this.watchCallback = undefined;
  }

  private resolveAllPaths(): string[] {
    const paths: string[] = [];

    for (const p of this.paths) {
      paths.push(p);

      // Add environment-specific variant: config.json → config.dev.json
      if (this.environment) {
        const ext = extname(p);
        const base = p.slice(0, p.length - ext.length);
        paths.push(`${base}.${this.environment}${ext}`);
      }
    }

    return paths;
  }

  private parseFile(filePath: string): Record<string, unknown> {
    const ext = extname(filePath).toLowerCase();
    const content = readFileSync(filePath, "utf-8");

    if (ext === ".json") {
      return JSON.parse(content) as Record<string, unknown>;
    }

    // Simple YAML-like: key: value pairs (no nested objects support via YAML syntax)
    // For full YAML support, a library would be needed; we parse basic key: value
    if (ext === ".yaml" || ext === ".yml") {
      return this.parseSimpleYaml(content);
    }

    throw new Error(`Unsupported config file format: ${ext}`);
  }

  /** Parse a very basic YAML subset (flat key: value pairs) */
  private parseSimpleYaml(content: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const rawValue = trimmed.slice(colonIdx + 1).trim();

      result[key] = this.coerceYamlValue(rawValue);
    }

    return result;
  }

  private coerceYamlValue(value: string): unknown {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null" || value === "~") return null;

    const num = Number(value);
    if (value !== "" && !isNaN(num)) return num;

    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    return value;
  }

  /** Deep merge two objects */
  private deepMerge(
    base: Record<string, unknown>,
    override: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...base };

    for (const [key, value] of Object.entries(override)) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        typeof result[key] === "object" &&
        result[key] !== null
      ) {
        result[key] = this.deepMerge(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /** Flatten nested object to dot-notation keys */
  private flattenKeys(
    obj: Record<string, unknown>,
    prefix = ""
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const nested = this.flattenKeys(value as Record<string, unknown>, fullKey);
        Object.assign(result, nested);
      } else {
        result[fullKey] = value;
      }
    }

    return result;
  }
}
