import type {
  Plugin,
  PluginContext,
  PluginState,
  PluginStatus,
  PluginLogger,
} from "./types.js";
import { HookManager } from "./hook-manager.js";

// ─── Event Bus (minimal intra-plugin communication) ───────────────────────────

type EventHandler = (payload: unknown) => void;

class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  emit(event: string, payload: unknown): void {
    const listeners = this.handlers.get(event) ?? [];
    for (const handler of listeners) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Handler error for event "${event}":`, err);
      }
    }
  }

  on(event: string, handler: EventHandler): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return () => {
      const updated = (this.handlers.get(event) ?? []).filter((h) => h !== handler);
      this.handlers.set(event, updated);
    };
  }

  clear(): void {
    this.handlers.clear();
  }
}

// ─── Logger Factory ───────────────────────────────────────────────────────────

function createLogger(pluginName: string): PluginLogger {
  const prefix = `[Plugin:${pluginName}]`;
  return {
    debug: (msg, meta) => console.debug(prefix, msg, meta ?? ""),
    info: (msg, meta) => console.info(prefix, msg, meta ?? ""),
    warn: (msg, meta) => console.warn(prefix, msg, meta ?? ""),
    error: (msg, meta) => console.error(prefix, msg, meta ?? ""),
  };
}

// ─── Semver Compatibility Check ───────────────────────────────────────────────

function parseSemver(v: string): [number, number, number] {
  const parts = v.replace(/^[^0-9]*/, "").split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isSemverCompatible(required: string, actual: string): boolean {
  // Simplified: required is exact major.minor, actual must match major and >= minor
  const [reqMajor, reqMinor] = parseSemver(required);
  const [actMajor, actMinor] = parseSemver(actual);
  return actMajor === reqMajor && actMinor >= reqMinor;
}

// ─── PluginRegistry ───────────────────────────────────────────────────────────

export interface RegistryOptions {
  platformVersion?: string;
  globalConfig?: Record<string, Record<string, unknown>>;
}

export class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private states = new Map<string, PluginState>();
  private contexts = new Map<string, PluginContext>();
  private eventBus = new EventBus();
  readonly hookManager: HookManager;
  private readonly platformVersion: string;
  private readonly globalConfig: Record<string, Record<string, unknown>>;

  constructor(opts: RegistryOptions = {}) {
    this.hookManager = new HookManager();
    this.platformVersion = opts.platformVersion ?? "0.1.0";
    this.globalConfig = opts.globalConfig ?? {};
  }

  // ─── Registration ────────────────────────────────────────────────────────

  register(plugin: Plugin): void {
    const { name, manifest } = plugin;

    if (this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    // Check platform version compatibility
    if (manifest.nexusVersion) {
      if (!isSemverCompatible(manifest.nexusVersion, this.platformVersion)) {
        throw new Error(
          `Plugin "${name}" requires platform version "${manifest.nexusVersion}", ` +
            `but current version is "${this.platformVersion}"`,
        );
      }
    }

    this.plugins.set(name, plugin);
    this.setState(name, "registered");
  }

  unregister(name: string): void {
    const state = this.states.get(name);
    if (state?.status === "active") {
      throw new Error(
        `Plugin "${name}" is active. Call stop() before unregistering.`,
      );
    }
    this.plugins.delete(name);
    this.states.delete(name);
    this.contexts.delete(name);
    this.hookManager.unregisterHooks(name);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  async init(name: string): Promise<void> {
    const plugin = this.getPlugin(name);
    this.setState(name, "initializing");

    // Check dependencies are active
    const deps = plugin.manifest.dependencies ?? {};
    for (const [depName] of Object.entries(deps)) {
      const depState = this.states.get(depName);
      if (depState?.status !== "active") {
        throw new Error(
          `Plugin "${name}" depends on "${depName}" which is not active`,
        );
      }
    }

    const ctx = this.createContext(plugin);
    this.contexts.set(name, ctx);

    try {
      await plugin.init(ctx);
      this.hookManager.registerHooks(name, plugin.hooks);
      this.setState(name, "active", { startedAt: new Date() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setState(name, "error", { error: message });
      throw err;
    }
  }

  async stop(name: string): Promise<void> {
    const plugin = this.getPlugin(name);
    const ctx = this.contexts.get(name);
    if (!ctx) throw new Error(`Plugin "${name}" has no context (was it initialized?)`);

    this.setState(name, "stopping");
    this.hookManager.unregisterHooks(name);

    try {
      await plugin.destroy(ctx);
      this.setState(name, "stopped", { stoppedAt: new Date() });
      this.contexts.delete(name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setState(name, "error", { error: message });
      throw err;
    }
  }

  /** Initialize all registered plugins in dependency order */
  async initAll(): Promise<void> {
    const order = this.resolveDependencyOrder();
    for (const name of order) {
      await this.init(name);
    }
  }

  /** Stop all active plugins in reverse dependency order */
  async stopAll(): Promise<void> {
    const order = this.resolveDependencyOrder().reverse();
    for (const name of order) {
      const state = this.states.get(name);
      if (state?.status === "active") {
        await this.stop(name).catch((err) => {
          console.error(`[PluginRegistry] Error stopping plugin "${name}":`, err);
        });
      }
    }
    this.eventBus.clear();
  }

  // ─── Dependency Resolution ────────────────────────────────────────────────

  private resolveDependencyOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (name: string, stack: Set<string>): void => {
      if (visited.has(name)) return;
      if (stack.has(name)) {
        throw new Error(
          `Circular dependency detected: ${[...stack, name].join(" -> ")}`,
        );
      }

      const plugin = this.plugins.get(name);
      if (!plugin) throw new Error(`Plugin "${name}" not found`);

      stack.add(name);
      const deps = plugin.manifest.dependencies ?? {};
      for (const depName of Object.keys(deps)) {
        if (!this.plugins.has(depName)) {
          throw new Error(
            `Plugin "${name}" depends on "${depName}" which is not registered`,
          );
        }
        visit(depName, stack);
      }
      stack.delete(name);

      visited.add(name);
      order.push(name);
    };

    for (const name of this.plugins.keys()) {
      visit(name, new Set());
    }

    return order;
  }

  // ─── Context Factory ──────────────────────────────────────────────────────

  private createContext(plugin: Plugin): PluginContext {
    const pluginConfig = this.globalConfig[plugin.name] ?? {};
    return {
      manifest: plugin.manifest,
      logger: createLogger(plugin.name),
      config: pluginConfig,
      emit: (event, payload) => this.eventBus.emit(`${plugin.name}:${event}`, payload),
      on: (event, handler) => this.eventBus.on(event, handler),
    };
  }

  // ─── State Management ─────────────────────────────────────────────────────

  private setState(
    name: string,
    status: PluginStatus,
    extra: Partial<PluginState> = {},
  ): void {
    const existing = this.states.get(name) ?? {
      name,
      status: "registered" as PluginStatus,
      metadata: {},
    };
    this.states.set(name, { ...existing, status, ...extra });
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  getState(name: string): PluginState | undefined {
    return this.states.get(name);
  }

  getPlugin(name: string): Plugin {
    const plugin = this.plugins.get(name);
    if (!plugin) throw new Error(`Plugin "${name}" is not registered`);
    return plugin;
  }

  listPlugins(): PluginState[] {
    return Array.from(this.states.values());
  }

  isActive(name: string): boolean {
    return this.states.get(name)?.status === "active";
  }

  getActivePlugins(): string[] {
    return Array.from(this.states.entries())
      .filter(([, state]) => state.status === "active")
      .map(([name]) => name);
  }
}
