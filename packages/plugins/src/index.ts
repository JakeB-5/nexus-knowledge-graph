export type {
  Plugin,
  PluginFactory,
  PluginManifest,
  PluginContext,
  PluginLogger,
  PluginHooks,
  PluginState,
  PluginStatus,
  PluginPermission,
  HookContext,
  BeforeNodeCreateHook,
  AfterNodeCreateHook,
  BeforeNodeUpdateHook,
  AfterNodeUpdateHook,
  BeforeNodeDeleteHook,
  AfterNodeDeleteHook,
  BeforeEdgeCreateHook,
  AfterEdgeCreateHook,
  BeforeEdgeDeleteHook,
  AfterEdgeDeleteHook,
} from "./types.js";

export { HookManager } from "./hook-manager.js";
export { PluginRegistry } from "./registry.js";
export type { RegistryOptions } from "./registry.js";
export { PluginLoader } from "./loader.js";
export type { LoadedPlugin, LoaderOptions, ManifestValidationResult, VersionCheckResult } from "./loader.js";
export { validateManifest, checkVersionCompatibility } from "./loader.js";

// Built-in plugins
export { AutoTagPlugin, createAutoTagPlugin } from "./builtin/auto-tag.js";
export { LinkExtractorPlugin, createLinkExtractorPlugin, extractLinks } from "./builtin/link-extractor.js";
export type { ExtractedLink } from "./builtin/link-extractor.js";
export { MetricsCollectorPlugin, createMetricsCollectorPlugin } from "./builtin/metrics-collector.js";
export type { GraphMetrics, MetricsCollectorConfig } from "./builtin/metrics-collector.js";
