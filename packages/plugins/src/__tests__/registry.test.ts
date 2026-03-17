import { describe, it, expect, beforeEach, vi } from "vitest";
import { PluginRegistry } from "../registry.js";
import type { Plugin, PluginContext, PluginHooks, PluginManifest } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlugin(
  name: string,
  opts: {
    version?: string;
    hooks?: PluginHooks;
    deps?: Record<string, string>;
    nexusVersion?: string;
    initFn?: (ctx: PluginContext) => void;
    destroyFn?: (ctx: PluginContext) => void;
  } = {},
): Plugin {
  const manifest: PluginManifest = {
    name,
    version: opts.version ?? "0.1.0",
    description: `Test plugin: ${name}`,
    dependencies: opts.deps,
    nexusVersion: opts.nexusVersion,
  };

  return {
    name,
    version: manifest.version,
    manifest,
    hooks: opts.hooks ?? {},
    init: opts.initFn ?? vi.fn(),
    destroy: opts.destroyFn ?? vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PluginRegistry", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry({ platformVersion: "0.1.0" });
  });

  describe("register", () => {
    it("registers a plugin successfully", () => {
      const plugin = makePlugin("test-plugin");
      registry.register(plugin);
      const state = registry.getState("test-plugin");
      expect(state).toBeDefined();
      expect(state?.status).toBe("registered");
    });

    it("throws if plugin is already registered", () => {
      const plugin = makePlugin("test-plugin");
      registry.register(plugin);
      expect(() => registry.register(plugin)).toThrow(
        'Plugin "test-plugin" is already registered',
      );
    });

    it("throws if plugin nexusVersion is incompatible", () => {
      const plugin = makePlugin("bad-plugin", { nexusVersion: "1.0.0" });
      expect(() => registry.register(plugin)).toThrow(/not compatible/);
    });

    it("accepts compatible nexusVersion", () => {
      const plugin = makePlugin("ok-plugin", { nexusVersion: "0.1.0" });
      expect(() => registry.register(plugin)).not.toThrow();
    });
  });

  describe("unregister", () => {
    it("unregisters a stopped plugin", () => {
      const plugin = makePlugin("test-plugin");
      registry.register(plugin);
      registry.unregister("test-plugin");
      expect(registry.getState("test-plugin")).toBeUndefined();
    });

    it("throws when trying to unregister an active plugin", async () => {
      const plugin = makePlugin("test-plugin");
      registry.register(plugin);
      await registry.init("test-plugin");
      expect(() => registry.unregister("test-plugin")).toThrow(
        /active/,
      );
    });
  });

  describe("init", () => {
    it("initializes a plugin and calls init hook", async () => {
      const initFn = vi.fn();
      const plugin = makePlugin("test-plugin", { initFn });
      registry.register(plugin);
      await registry.init("test-plugin");

      expect(initFn).toHaveBeenCalledOnce();
      expect(registry.getState("test-plugin")?.status).toBe("active");
    });

    it("passes context to plugin init", async () => {
      let capturedCtx: PluginContext | null = null;
      const initFn = (ctx: PluginContext) => { capturedCtx = ctx; };
      const plugin = makePlugin("ctx-plugin", { initFn });
      registry.register(plugin);
      await registry.init("ctx-plugin");

      expect(capturedCtx).not.toBeNull();
      expect(capturedCtx!.manifest.name).toBe("ctx-plugin");
      expect(typeof capturedCtx!.logger.info).toBe("function");
      expect(typeof capturedCtx!.emit).toBe("function");
    });

    it("sets status to error if init throws", async () => {
      const initFn = vi.fn().mockRejectedValue(new Error("init failed"));
      const plugin = makePlugin("failing-plugin", { initFn });
      registry.register(plugin);

      await expect(registry.init("failing-plugin")).rejects.toThrow("init failed");
      expect(registry.getState("failing-plugin")?.status).toBe("error");
    });

    it("throws if dependency is not active", async () => {
      registry.register(makePlugin("dep-plugin"));
      const plugin = makePlugin("main-plugin", { deps: { "dep-plugin": "0.1.0" } });
      registry.register(plugin);

      await expect(registry.init("main-plugin")).rejects.toThrow(
        /depends on "dep-plugin" which is not active/,
      );
    });

    it("initializes with active dependency", async () => {
      registry.register(makePlugin("dep-plugin"));
      registry.register(makePlugin("main-plugin", { deps: { "dep-plugin": "0.1.0" } }));

      await registry.init("dep-plugin");
      await expect(registry.init("main-plugin")).resolves.not.toThrow();
      expect(registry.isActive("main-plugin")).toBe(true);
    });
  });

  describe("stop", () => {
    it("stops an active plugin and calls destroy", async () => {
      const destroyFn = vi.fn();
      const plugin = makePlugin("test-plugin", { destroyFn });
      registry.register(plugin);
      await registry.init("test-plugin");
      await registry.stop("test-plugin");

      expect(destroyFn).toHaveBeenCalledOnce();
      expect(registry.getState("test-plugin")?.status).toBe("stopped");
    });

    it("sets error status if destroy throws", async () => {
      const destroyFn = vi.fn().mockRejectedValue(new Error("destroy failed"));
      const plugin = makePlugin("test-plugin", { destroyFn });
      registry.register(plugin);
      await registry.init("test-plugin");

      await expect(registry.stop("test-plugin")).rejects.toThrow("destroy failed");
      expect(registry.getState("test-plugin")?.status).toBe("error");
    });
  });

  describe("initAll / stopAll", () => {
    it("initializes all plugins in dependency order", async () => {
      const order: string[] = [];
      registry.register(makePlugin("c", { initFn: () => { order.push("c"); } }));
      registry.register(makePlugin("a", {
        deps: { b: "0.1.0" },
        initFn: () => { order.push("a"); },
      }));
      registry.register(makePlugin("b", {
        deps: { c: "0.1.0" },
        initFn: () => { order.push("b"); },
      }));

      await registry.initAll();

      expect(order).toEqual(["c", "b", "a"]);
    });

    it("stops all active plugins", async () => {
      const destroyA = vi.fn();
      const destroyB = vi.fn();
      registry.register(makePlugin("plugin-a", { destroyFn: destroyA }));
      registry.register(makePlugin("plugin-b", { destroyFn: destroyB }));

      await registry.initAll();
      await registry.stopAll();

      expect(destroyA).toHaveBeenCalledOnce();
      expect(destroyB).toHaveBeenCalledOnce();
    });
  });

  describe("circular dependency detection", () => {
    it("throws on circular dependencies", async () => {
      registry.register(makePlugin("a", { deps: { b: "0.1.0" } }));
      registry.register(makePlugin("b", { deps: { a: "0.1.0" } }));

      await expect(registry.initAll()).rejects.toThrow(/Circular dependency/);
    });
  });

  describe("listPlugins / getActivePlugins", () => {
    it("lists all registered plugins", () => {
      registry.register(makePlugin("p1"));
      registry.register(makePlugin("p2"));
      const list = registry.listPlugins();
      expect(list).toHaveLength(2);
    });

    it("returns only active plugins", async () => {
      registry.register(makePlugin("p1"));
      registry.register(makePlugin("p2"));
      await registry.init("p1");

      expect(registry.getActivePlugins()).toEqual(["p1"]);
    });
  });

  describe("plugin context isolation", () => {
    it("provides plugin-scoped config", async () => {
      const registry2 = new PluginRegistry({
        globalConfig: { "my-plugin": { maxTags: 10 } },
      });

      let capturedConfig: Record<string, unknown> = {};
      registry2.register(
        makePlugin("my-plugin", {
          initFn: (ctx) => { capturedConfig = ctx.config; },
        }),
      );
      await registry2.init("my-plugin");

      expect(capturedConfig["maxTags"]).toBe(10);
    });

    it("isolates event bus per plugin emit namespace", async () => {
      const received: unknown[] = [];
      let listenerCtx: PluginContext | null = null;

      registry.register(
        makePlugin("emitter", {
          initFn: (ctx) => {
            ctx.emit("data-ready", { value: 42 });
          },
        }),
      );
      registry.register(
        makePlugin("listener", {
          initFn: (ctx) => {
            listenerCtx = ctx;
            ctx.on("emitter:data-ready", (payload) => received.push(payload));
          },
        }),
      );

      await registry.init("listener");
      await registry.init("emitter");

      expect(received).toHaveLength(1);
      expect((received[0] as { value: number }).value).toBe(42);
    });
  });
});
