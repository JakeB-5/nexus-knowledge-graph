import { describe, it, expect, vi, beforeEach } from "vitest";
import { HookManager } from "../hook-manager.js";
import type { PluginHooks, HookContext } from "../types.js";
import type { CreateNode, Node, Edge, CreateEdge } from "@nexus/shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCreateNode(overrides: Partial<CreateNode> = {}): CreateNode {
  return {
    type: "document",
    title: "Test Node",
    ownerId: "00000000-0000-0000-0000-000000000001",
    metadata: {},
    ...overrides,
  };
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    type: "document",
    title: "Test Node",
    ownerId: "00000000-0000-0000-0000-000000000002",
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: "00000000-0000-0000-0000-000000000003",
    type: "references",
    sourceId: "00000000-0000-0000-0000-000000000001",
    targetId: "00000000-0000-0000-0000-000000000002",
    weight: 1,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCreateEdge(overrides: Partial<CreateEdge> = {}): CreateEdge {
  return {
    type: "references",
    sourceId: "00000000-0000-0000-0000-000000000001",
    targetId: "00000000-0000-0000-0000-000000000002",
    weight: 1,
    metadata: {},
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HookManager", () => {
  let manager: HookManager;

  beforeEach(() => {
    manager = new HookManager();
  });

  describe("registerHooks / unregisterHooks", () => {
    it("registers hooks and reflects in count", () => {
      const hooks: PluginHooks = {
        beforeNodeCreate: vi.fn(),
        afterNodeCreate: vi.fn(),
      };
      manager.registerHooks("plugin-a", hooks);

      expect(manager.getHookCount("beforeNodeCreate")).toBe(1);
      expect(manager.getHookCount("afterNodeCreate")).toBe(1);
      expect(manager.getHookCount("beforeEdgeCreate")).toBe(0);
    });

    it("unregisters all hooks for a plugin", () => {
      const hooks: PluginHooks = {
        beforeNodeCreate: vi.fn(),
        afterNodeCreate: vi.fn(),
      };
      manager.registerHooks("plugin-a", hooks);
      manager.unregisterHooks("plugin-a");

      expect(manager.getHookCount("beforeNodeCreate")).toBe(0);
      expect(manager.getHookCount("afterNodeCreate")).toBe(0);
    });

    it("tracks registered plugins", () => {
      manager.registerHooks("plugin-a", { beforeNodeCreate: vi.fn() });
      manager.registerHooks("plugin-b", { afterNodeCreate: vi.fn() });

      const plugins = manager.getRegisteredPlugins();
      expect(plugins).toContain("plugin-a");
      expect(plugins).toContain("plugin-b");
    });
  });

  describe("runBeforeNodeCreate", () => {
    it("returns original data when no hooks registered", async () => {
      const data = makeCreateNode({ title: "Original" });
      const result = await manager.runBeforeNodeCreate(data);
      expect(result.title).toBe("Original");
    });

    it("passes data through hook and accepts returned modification", async () => {
      const hooks: PluginHooks = {
        beforeNodeCreate: async (ctx) => ({
          ...ctx.data,
          title: ctx.data.title + " [modified]",
        }),
      };
      manager.registerHooks("modifier", hooks);

      const result = await manager.runBeforeNodeCreate(
        makeCreateNode({ title: "Hello" }),
      );
      expect(result.title).toBe("Hello [modified]");
    });

    it("chains multiple hooks in priority order", async () => {
      const order: string[] = [];

      manager.registerHooks(
        "high-priority",
        {
          beforeNodeCreate: (ctx) => {
            order.push("high");
            return { ...ctx.data, title: ctx.data.title + "-high" };
          },
        },
        10,
      );

      manager.registerHooks(
        "low-priority",
        {
          beforeNodeCreate: (ctx) => {
            order.push("low");
            return { ...ctx.data, title: ctx.data.title + "-low" };
          },
        },
        100,
      );

      const result = await manager.runBeforeNodeCreate(
        makeCreateNode({ title: "base" }),
      );

      expect(order).toEqual(["high", "low"]);
      expect(result.title).toBe("base-high-low");
    });

    it("aborts pipeline when hook calls abort()", async () => {
      manager.registerHooks("aborter", {
        beforeNodeCreate: (ctx) => {
          ctx.abort("Content policy violation");
        },
      });

      await expect(
        manager.runBeforeNodeCreate(makeCreateNode()),
      ).rejects.toThrow(/aborted.*aborter/);
    });

    it("isolates individual hook errors without stopping pipeline", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      manager.registerHooks("failer", {
        beforeNodeCreate: () => {
          throw new Error("plugin crashed");
        },
      });

      manager.registerHooks("succeeder", {
        beforeNodeCreate: (ctx) => ({
          ...ctx.data,
          title: ctx.data.title + "-ok",
        }),
      });

      const result = await manager.runBeforeNodeCreate(
        makeCreateNode({ title: "test" }),
      );

      // Pipeline continues despite failer
      expect(result.title).toBe("test-ok");
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("runAfterNodeCreate", () => {
    it("calls all after-hooks in parallel", async () => {
      const called: string[] = [];

      manager.registerHooks("plugin-a", {
        afterNodeCreate: () => { called.push("a"); },
      });
      manager.registerHooks("plugin-b", {
        afterNodeCreate: () => { called.push("b"); },
      });

      await manager.runAfterNodeCreate(makeNode());
      expect(called).toContain("a");
      expect(called).toContain("b");
    });

    it("isolates errors in after-hooks", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      manager.registerHooks("bad-after", {
        afterNodeCreate: () => {
          throw new Error("after hook error");
        },
      });

      await expect(
        manager.runAfterNodeCreate(makeNode()),
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("runBeforeNodeUpdate", () => {
    it("passes id and data through pipeline", async () => {
      manager.registerHooks("tagger", {
        beforeNodeUpdate: (ctx) => ({
          ...ctx.data,
          data: { ...ctx.data.data, title: "Updated Title" },
        }),
      });

      const result = await manager.runBeforeNodeUpdate({
        id: "00000000-0000-0000-0000-000000000001",
        data: { title: "Old Title" },
      });

      expect(result.data.title).toBe("Updated Title");
    });
  });

  describe("runBeforeEdgeCreate", () => {
    it("modifies edge data through pipeline", async () => {
      manager.registerHooks("edge-hook", {
        beforeEdgeCreate: (ctx) => ({
          ...ctx.data,
          weight: 0.5,
        }),
      });

      const result = await manager.runBeforeEdgeCreate(makeCreateEdge({ weight: 1 }));
      expect(result.weight).toBe(0.5);
    });
  });

  describe("runAfterEdgeCreate", () => {
    it("calls after-edge-create hooks", async () => {
      const fn = vi.fn();
      manager.registerHooks("listener", { afterEdgeCreate: fn });

      const edge = makeEdge();
      await manager.runAfterEdgeCreate(edge);

      expect(fn).toHaveBeenCalledOnce();
      expect(fn.mock.calls[0]?.[0].data).toMatchObject({ id: edge.id });
    });
  });

  describe("runBeforeNodeDelete / runAfterNodeDelete", () => {
    it("runs delete hooks with id payload", async () => {
      const beforeFn = vi.fn().mockImplementation((ctx: HookContext<{ id: string }>) => ctx.data);
      const afterFn = vi.fn();

      manager.registerHooks("delete-watcher", {
        beforeNodeDelete: beforeFn,
        afterNodeDelete: afterFn,
      });

      const id = "00000000-0000-0000-0000-000000000099";
      await manager.runBeforeNodeDelete({ id });
      await manager.runAfterNodeDelete({ id });

      expect(beforeFn).toHaveBeenCalledOnce();
      expect(afterFn).toHaveBeenCalledOnce();
    });
  });

  describe("runBeforeEdgeDelete / runAfterEdgeDelete", () => {
    it("runs edge delete hooks", async () => {
      const before = vi.fn().mockImplementation((ctx: HookContext<{ id: string }>) => ctx.data);
      const after = vi.fn();
      manager.registerHooks("edge-delete-watcher", {
        beforeEdgeDelete: before,
        afterEdgeDelete: after,
      });

      const id = "00000000-0000-0000-0000-000000000050";
      await manager.runBeforeEdgeDelete({ id });
      await manager.runAfterEdgeDelete({ id });

      expect(before).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
    });
  });

  describe("multiple plugins with mixed hooks", () => {
    it("only calls hooks registered by each plugin", async () => {
      const fnA = vi.fn();
      const fnB = vi.fn();

      manager.registerHooks("plugin-a", { afterNodeCreate: fnA });
      manager.registerHooks("plugin-b", { afterEdgeCreate: fnB });

      await manager.runAfterNodeCreate(makeNode());
      await manager.runAfterEdgeCreate(makeEdge());

      expect(fnA).toHaveBeenCalledOnce();
      expect(fnB).toHaveBeenCalledOnce();
    });
  });
});
