import { createRequire } from "module";
import { readFile, readdir, stat, watch } from "fs/promises";
import { join, resolve } from "path";
import type { Plugin, PluginManifest, PluginFactory } from "./types.js";

// ─── Manifest Validation ──────────────────────────────────────────────────────

const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateManifest(raw: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Manifest must be a plain object"] };
  }

  const m = raw as Record<string, unknown>;

  if (!m["name"] || typeof m["name"] !== "string" || m["name"].trim() === "") {
    errors.push("manifest.name must be a non-empty string");
  } else if (!/^[a-z0-9-_]+$/i.test(m["name"] as string)) {
    errors.push('manifest.name must only contain alphanumeric characters, hyphens, and underscores');
  }

  if (!m["version"] || typeof m["version"] !== "string") {
    errors.push("manifest.version must be a string");
  } else if (!SEMVER_RE.test(m["version"] as string)) {
    errors.push(`manifest.version "${m["version"]}" is not a valid semver string`);
  }

  if (!m["description"] || typeof m["description"] !== "string") {
    errors.push("manifest.description must be a string");
  }

  if (m["dependencies"] !== undefined) {
    if (typeof m["dependencies"] !== "object" || Array.isArray(m["dependencies"])) {
      errors.push("manifest.dependencies must be a plain object");
    }
  }

  if (m["permissions"] !== undefined) {
    if (!Array.isArray(m["permissions"])) {
      errors.push("manifest.permissions must be an array");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Version Compatibility ────────────────────────────────────────────────────

export interface VersionCheckResult {
  compatible: boolean;
  reason?: string;
}

export function checkVersionCompatibility(
  pluginNexusVersion: string | undefined,
  platformVersion: string,
): VersionCheckResult {
  if (!pluginNexusVersion) return { compatible: true };

  const parse = (v: string): [number, number, number] => {
    const parts = v.replace(/^[~^>=<!\s]*/, "").split(".").map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };

  const [reqMaj, reqMin] = parse(pluginNexusVersion);
  const [platMaj, platMin] = parse(platformVersion);

  if (reqMaj !== platMaj) {
    return {
      compatible: false,
      reason: `Major version mismatch: plugin requires ${reqMaj}.x, platform is ${platMaj}.x`,
    };
  }

  if (platMin < reqMin) {
    return {
      compatible: false,
      reason: `Minor version too low: plugin requires >=${reqMaj}.${reqMin}, platform is ${platMaj}.${platMin}`,
    };
  }

  return { compatible: true };
}

// ─── PluginLoader ─────────────────────────────────────────────────────────────

export interface LoadedPlugin {
  plugin: Plugin;
  path: string;
  manifest: PluginManifest;
}

export interface LoaderOptions {
  platformVersion?: string;
  /** If true, watch plugin directories for changes and hot-reload */
  hotReload?: boolean;
  onHotReload?: (pluginName: string) => void;
}

export class PluginLoader {
  private loadedPaths = new Map<string, LoadedPlugin>();
  private watchers: Array<() => void> = [];
  private readonly platformVersion: string;
  private readonly hotReload: boolean;
  private readonly onHotReload?: (pluginName: string) => void;

  constructor(opts: LoaderOptions = {}) {
    this.platformVersion = opts.platformVersion ?? "0.1.0";
    this.hotReload = opts.hotReload ?? false;
    this.onHotReload = opts.onHotReload;
  }

  // ─── Load Single Plugin ──────────────────────────────────────────────────

  async loadFromPath(pluginPath: string): Promise<LoadedPlugin> {
    const absPath = resolve(pluginPath);

    // Read manifest
    const manifestPath = join(absPath, "nexus-plugin.json");
    let manifestRaw: unknown;
    try {
      const content = await readFile(manifestPath, "utf8");
      manifestRaw = JSON.parse(content);
    } catch (err) {
      throw new Error(
        `Failed to read manifest at "${manifestPath}": ${(err as Error).message}`,
      );
    }

    // Validate manifest
    const validation = validateManifest(manifestRaw);
    if (!validation.valid) {
      throw new Error(
        `Invalid plugin manifest at "${manifestPath}":\n${validation.errors.join("\n")}`,
      );
    }

    const manifest = manifestRaw as PluginManifest;

    // Check version compatibility
    const compat = checkVersionCompatibility(manifest.nexusVersion, this.platformVersion);
    if (!compat.compatible) {
      throw new Error(
        `Plugin "${manifest.name}" is not compatible with platform version "${this.platformVersion}": ${compat.reason}`,
      );
    }

    // Load plugin module
    const entryPath = join(absPath, "index.js");
    let pluginModule: { default?: PluginFactory | Plugin; createPlugin?: PluginFactory };
    try {
      // Dynamic import for ESM
      pluginModule = await import(entryPath);
    } catch (err) {
      throw new Error(
        `Failed to load plugin module at "${entryPath}": ${(err as Error).message}`,
      );
    }

    let plugin: Plugin;
    if (typeof pluginModule.default === "function") {
      // Factory function
      plugin = (pluginModule.default as PluginFactory)();
    } else if (typeof pluginModule.createPlugin === "function") {
      plugin = pluginModule.createPlugin();
    } else if (pluginModule.default && typeof pluginModule.default === "object") {
      // Direct plugin object
      plugin = pluginModule.default as Plugin;
    } else {
      throw new Error(
        `Plugin at "${entryPath}" does not export a plugin factory or object`,
      );
    }

    // Validate plugin name matches manifest
    if (plugin.name !== manifest.name) {
      throw new Error(
        `Plugin name mismatch: manifest says "${manifest.name}", plugin says "${plugin.name}"`,
      );
    }

    const loaded: LoadedPlugin = { plugin, path: absPath, manifest };
    this.loadedPaths.set(absPath, loaded);

    // Set up hot reload if requested
    if (this.hotReload) {
      this.watchPlugin(absPath, manifest.name);
    }

    return loaded;
  }

  // ─── Load Directory ──────────────────────────────────────────────────────

  async loadFromDirectory(dirPath: string): Promise<LoadedPlugin[]> {
    const absDir = resolve(dirPath);
    const entries = await readdir(absDir);
    const loaded: LoadedPlugin[] = [];

    for (const entry of entries) {
      const entryPath = join(absDir, entry);
      const info = await stat(entryPath).catch(() => null);
      if (!info?.isDirectory()) continue;

      const manifestPath = join(entryPath, "nexus-plugin.json");
      const hasManifest = await stat(manifestPath).catch(() => null);
      if (!hasManifest) continue;

      try {
        const result = await this.loadFromPath(entryPath);
        loaded.push(result);
      } catch (err) {
        console.error(
          `[PluginLoader] Failed to load plugin from "${entryPath}":`,
          err,
        );
      }
    }

    return loaded;
  }

  // ─── Hot Reload ──────────────────────────────────────────────────────────

  private watchPlugin(pluginPath: string, pluginName: string): void {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const stopWatch = (async () => {
      try {
        const watcher = watch(pluginPath, { recursive: true });
        for await (const _event of watcher) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            this.onHotReload?.(pluginName);
          }, 300);
        }
      } catch {
        // Watcher stopped
      }
    });

    // Start watcher in background; track cleanup via a flag
    const watcherPromise = stopWatch();
    this.watchers.push(() => {
      // Signal watcher to stop by adding an abort flag
      watcherPromise.catch(() => {});
    });
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  dispose(): void {
    for (const cleanup of this.watchers) {
      cleanup();
    }
    this.watchers = [];
    this.loadedPaths.clear();
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  getLoadedPlugin(pluginPath: string): LoadedPlugin | undefined {
    return this.loadedPaths.get(resolve(pluginPath));
  }

  listLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPaths.values());
  }
}
