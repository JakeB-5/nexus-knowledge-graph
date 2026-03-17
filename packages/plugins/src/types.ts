import type { Node, Edge, CreateNode, UpdateNode, CreateEdge } from "@nexus/shared";

// ─── Plugin Manifest ──────────────────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  dependencies?: Record<string, string>; // pluginName -> semver range
  nexusVersion?: string; // required platform version range
  permissions?: PluginPermission[];
}

export type PluginPermission =
  | "node:read"
  | "node:write"
  | "edge:read"
  | "edge:write"
  | "metrics:write"
  | "config:read";

// ─── Plugin State ─────────────────────────────────────────────────────────────

export type PluginStatus = "registered" | "initializing" | "active" | "stopping" | "stopped" | "error";

export interface PluginState {
  name: string;
  status: PluginStatus;
  startedAt?: Date;
  stoppedAt?: Date;
  error?: string;
  metadata: Record<string, unknown>;
}

// ─── Plugin Context ───────────────────────────────────────────────────────────

export interface PluginContext {
  /** The plugin's own manifest */
  manifest: PluginManifest;
  /** Plugin-scoped logger */
  logger: PluginLogger;
  /** Plugin-scoped configuration */
  config: Record<string, unknown>;
  /** Emit events to other plugins */
  emit: (event: string, payload: unknown) => void;
  /** Subscribe to events from other plugins */
  on: (event: string, handler: (payload: unknown) => void) => () => void;
}

export interface PluginLogger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

// ─── Hook Types ───────────────────────────────────────────────────────────────

export interface HookContext<TData> {
  data: TData;
  pluginName: string;
  timestamp: Date;
  abort: (reason: string) => void;
  isAborted: boolean;
  abortReason?: string;
}

// Node hooks
export type BeforeNodeCreateHook = (
  ctx: HookContext<CreateNode>,
) => Promise<CreateNode | void> | CreateNode | void;

export type AfterNodeCreateHook = (
  ctx: HookContext<Node>,
) => Promise<void> | void;

export type BeforeNodeUpdateHook = (
  ctx: HookContext<{ id: string; data: UpdateNode }>,
) => Promise<UpdateNode | void> | UpdateNode | void;

export type AfterNodeUpdateHook = (
  ctx: HookContext<Node>,
) => Promise<void> | void;

export type BeforeNodeDeleteHook = (
  ctx: HookContext<{ id: string }>,
) => Promise<void> | void;

export type AfterNodeDeleteHook = (
  ctx: HookContext<{ id: string }>,
) => Promise<void> | void;

// Edge hooks
export type BeforeEdgeCreateHook = (
  ctx: HookContext<CreateEdge>,
) => Promise<CreateEdge | void> | CreateEdge | void;

export type AfterEdgeCreateHook = (
  ctx: HookContext<Edge>,
) => Promise<void> | void;

export type BeforeEdgeDeleteHook = (
  ctx: HookContext<{ id: string }>,
) => Promise<void> | void;

export type AfterEdgeDeleteHook = (
  ctx: HookContext<{ id: string }>,
) => Promise<void> | void;

// ─── Plugin Hooks Interface ───────────────────────────────────────────────────

export interface PluginHooks {
  beforeNodeCreate?: BeforeNodeCreateHook;
  afterNodeCreate?: AfterNodeCreateHook;
  beforeNodeUpdate?: BeforeNodeUpdateHook;
  afterNodeUpdate?: AfterNodeUpdateHook;
  beforeNodeDelete?: BeforeNodeDeleteHook;
  afterNodeDelete?: AfterNodeDeleteHook;
  beforeEdgeCreate?: BeforeEdgeCreateHook;
  afterEdgeCreate?: AfterEdgeCreateHook;
  beforeEdgeDelete?: BeforeEdgeDeleteHook;
  afterEdgeDelete?: AfterEdgeDeleteHook;
}

// ─── Plugin Interface ─────────────────────────────────────────────────────────

export interface Plugin {
  /** Unique plugin identifier */
  readonly name: string;
  /** Plugin version (semver) */
  readonly version: string;
  /** Plugin manifest */
  readonly manifest: PluginManifest;
  /** Hook registrations */
  readonly hooks: PluginHooks;
  /**
   * Called once when the plugin is initialized.
   * Use for one-time setup (DB connections, timers, etc.)
   */
  init(ctx: PluginContext): Promise<void> | void;
  /**
   * Called when the plugin is being shut down.
   * Use for cleanup (close connections, flush buffers, etc.)
   */
  destroy(ctx: PluginContext): Promise<void> | void;
}

// ─── Plugin Factory ───────────────────────────────────────────────────────────

export type PluginFactory = (config?: Record<string, unknown>) => Plugin;
