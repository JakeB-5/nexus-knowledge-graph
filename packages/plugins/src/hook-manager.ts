import type {
  PluginHooks,
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
import type { CreateNode, UpdateNode, Node, Edge, CreateEdge } from "@nexus/shared";

// ─── Hook Entry ───────────────────────────────────────────────────────────────

interface HookEntry<T> {
  pluginName: string;
  priority: number;
  handler: T;
}

type HookName = keyof PluginHooks;

// ─── HookManager ─────────────────────────────────────────────────────────────

export class HookManager {
  private beforeNodeCreate: HookEntry<BeforeNodeCreateHook>[] = [];
  private afterNodeCreate: HookEntry<AfterNodeCreateHook>[] = [];
  private beforeNodeUpdate: HookEntry<BeforeNodeUpdateHook>[] = [];
  private afterNodeUpdate: HookEntry<AfterNodeUpdateHook>[] = [];
  private beforeNodeDelete: HookEntry<BeforeNodeDeleteHook>[] = [];
  private afterNodeDelete: HookEntry<AfterNodeDeleteHook>[] = [];
  private beforeEdgeCreate: HookEntry<BeforeEdgeCreateHook>[] = [];
  private afterEdgeCreate: HookEntry<AfterEdgeCreateHook>[] = [];
  private beforeEdgeDelete: HookEntry<BeforeEdgeDeleteHook>[] = [];
  private afterEdgeDelete: HookEntry<AfterEdgeDeleteHook>[] = [];

  // ─── Registration ──────────────────────────────────────────────────────────

  registerHooks(pluginName: string, hooks: PluginHooks, priority = 100): void {
    if (hooks.beforeNodeCreate) {
      this.beforeNodeCreate.push({ pluginName, priority, handler: hooks.beforeNodeCreate });
      this.sortByPriority(this.beforeNodeCreate);
    }
    if (hooks.afterNodeCreate) {
      this.afterNodeCreate.push({ pluginName, priority, handler: hooks.afterNodeCreate });
      this.sortByPriority(this.afterNodeCreate);
    }
    if (hooks.beforeNodeUpdate) {
      this.beforeNodeUpdate.push({ pluginName, priority, handler: hooks.beforeNodeUpdate });
      this.sortByPriority(this.beforeNodeUpdate);
    }
    if (hooks.afterNodeUpdate) {
      this.afterNodeUpdate.push({ pluginName, priority, handler: hooks.afterNodeUpdate });
      this.sortByPriority(this.afterNodeUpdate);
    }
    if (hooks.beforeNodeDelete) {
      this.beforeNodeDelete.push({ pluginName, priority, handler: hooks.beforeNodeDelete });
      this.sortByPriority(this.beforeNodeDelete);
    }
    if (hooks.afterNodeDelete) {
      this.afterNodeDelete.push({ pluginName, priority, handler: hooks.afterNodeDelete });
      this.sortByPriority(this.afterNodeDelete);
    }
    if (hooks.beforeEdgeCreate) {
      this.beforeEdgeCreate.push({ pluginName, priority, handler: hooks.beforeEdgeCreate });
      this.sortByPriority(this.beforeEdgeCreate);
    }
    if (hooks.afterEdgeCreate) {
      this.afterEdgeCreate.push({ pluginName, priority, handler: hooks.afterEdgeCreate });
      this.sortByPriority(this.afterEdgeCreate);
    }
    if (hooks.beforeEdgeDelete) {
      this.beforeEdgeDelete.push({ pluginName, priority, handler: hooks.beforeEdgeDelete });
      this.sortByPriority(this.beforeEdgeDelete);
    }
    if (hooks.afterEdgeDelete) {
      this.afterEdgeDelete.push({ pluginName, priority, handler: hooks.afterEdgeDelete });
      this.sortByPriority(this.afterEdgeDelete);
    }
  }

  unregisterHooks(pluginName: string): void {
    const removePlugin = <T>(list: HookEntry<T>[]): HookEntry<T>[] =>
      list.filter((e) => e.pluginName !== pluginName);

    this.beforeNodeCreate = removePlugin(this.beforeNodeCreate);
    this.afterNodeCreate = removePlugin(this.afterNodeCreate);
    this.beforeNodeUpdate = removePlugin(this.beforeNodeUpdate);
    this.afterNodeUpdate = removePlugin(this.afterNodeUpdate);
    this.beforeNodeDelete = removePlugin(this.beforeNodeDelete);
    this.afterNodeDelete = removePlugin(this.afterNodeDelete);
    this.beforeEdgeCreate = removePlugin(this.beforeEdgeCreate);
    this.afterEdgeCreate = removePlugin(this.afterEdgeCreate);
    this.beforeEdgeDelete = removePlugin(this.beforeEdgeDelete);
    this.afterEdgeDelete = removePlugin(this.afterEdgeDelete);
  }

  // ─── Execution Helpers ─────────────────────────────────────────────────────

  private sortByPriority<T>(list: HookEntry<T>[]): void {
    list.sort((a, b) => a.priority - b.priority);
  }

  private makeContext<TData>(pluginName: string, data: TData): HookContext<TData> & { _aborted: boolean; _reason?: string } {
    const ctx = {
      data,
      pluginName,
      timestamp: new Date(),
      isAborted: false,
      abortReason: undefined as string | undefined,
      _aborted: false,
      abort(reason: string) {
        ctx._aborted = true;
        ctx.isAborted = true;
        ctx.abortReason = reason;
      },
    };
    return ctx;
  }

  /**
   * Runs a "before" pipeline where each hook may return modified data.
   * If any hook aborts the pipeline, throws an error.
   * Failures in individual hooks are isolated - one failure does not stop others.
   */
  private async runBeforePipeline<TData>(
    entries: HookEntry<(ctx: HookContext<TData>) => Promise<TData | void> | TData | void>[],
    data: TData,
  ): Promise<TData> {
    let current = data;

    for (const entry of entries) {
      const hookCtx = this.makeContext(entry.pluginName, current);
      try {
        const result = await entry.handler(hookCtx);
        if (hookCtx._aborted) {
          throw new Error(
            `Hook pipeline aborted by plugin "${entry.pluginName}": ${hookCtx.abortReason}`,
          );
        }
        if (result !== undefined && result !== null) {
          current = result;
        }
      } catch (err) {
        if ((err as Error).message.startsWith("Hook pipeline aborted")) throw err;
        // Isolate plugin failures - log and continue
        console.error(
          `[HookManager] Plugin "${entry.pluginName}" hook error:`,
          err,
        );
      }
    }

    return current;
  }

  /**
   * Runs an "after" pipeline where hooks receive data but cannot modify it.
   * Failures in individual hooks are isolated.
   */
  private async runAfterPipeline<TData>(
    entries: HookEntry<(ctx: HookContext<TData>) => Promise<void> | void>[],
    data: TData,
  ): Promise<void> {
    await Promise.allSettled(
      entries.map(async (entry) => {
        const hookCtx = this.makeContext(entry.pluginName, data);
        try {
          await entry.handler(hookCtx);
        } catch (err) {
          console.error(
            `[HookManager] Plugin "${entry.pluginName}" after-hook error:`,
            err,
          );
        }
      }),
    );
  }

  // ─── Public Execution API ──────────────────────────────────────────────────

  async runBeforeNodeCreate(data: CreateNode): Promise<CreateNode> {
    return this.runBeforePipeline(this.beforeNodeCreate, data);
  }

  async runAfterNodeCreate(node: Node): Promise<void> {
    await this.runAfterPipeline(this.afterNodeCreate, node);
  }

  async runBeforeNodeUpdate(payload: { id: string; data: UpdateNode }): Promise<{ id: string; data: UpdateNode }> {
    return this.runBeforePipeline(this.beforeNodeUpdate, payload);
  }

  async runAfterNodeUpdate(node: Node): Promise<void> {
    await this.runAfterPipeline(this.afterNodeUpdate, node);
  }

  async runBeforeNodeDelete(payload: { id: string }): Promise<{ id: string }> {
    return this.runBeforePipeline(this.beforeNodeDelete, payload);
  }

  async runAfterNodeDelete(payload: { id: string }): Promise<void> {
    await this.runAfterPipeline(this.afterNodeDelete, payload);
  }

  async runBeforeEdgeCreate(data: CreateEdge): Promise<CreateEdge> {
    return this.runBeforePipeline(this.beforeEdgeCreate, data);
  }

  async runAfterEdgeCreate(edge: Edge): Promise<void> {
    await this.runAfterPipeline(this.afterEdgeCreate, edge);
  }

  async runBeforeEdgeDelete(payload: { id: string }): Promise<{ id: string }> {
    return this.runBeforePipeline(this.beforeEdgeDelete, payload);
  }

  async runAfterEdgeDelete(payload: { id: string }): Promise<void> {
    await this.runAfterPipeline(this.afterEdgeDelete, payload);
  }

  // ─── Introspection ─────────────────────────────────────────────────────────

  getRegisteredPlugins(): string[] {
    const names = new Set<string>();
    const allLists = [
      this.beforeNodeCreate,
      this.afterNodeCreate,
      this.beforeNodeUpdate,
      this.afterNodeUpdate,
      this.beforeNodeDelete,
      this.afterNodeDelete,
      this.beforeEdgeCreate,
      this.afterEdgeCreate,
      this.beforeEdgeDelete,
      this.afterEdgeDelete,
    ];
    for (const list of allLists) {
      for (const entry of list) {
        names.add(entry.pluginName);
      }
    }
    return Array.from(names);
  }

  getHookCount(hook: HookName): number {
    switch (hook) {
      case "beforeNodeCreate": return this.beforeNodeCreate.length;
      case "afterNodeCreate": return this.afterNodeCreate.length;
      case "beforeNodeUpdate": return this.beforeNodeUpdate.length;
      case "afterNodeUpdate": return this.afterNodeUpdate.length;
      case "beforeNodeDelete": return this.beforeNodeDelete.length;
      case "afterNodeDelete": return this.afterNodeDelete.length;
      case "beforeEdgeCreate": return this.beforeEdgeCreate.length;
      case "afterEdgeCreate": return this.afterEdgeCreate.length;
      case "beforeEdgeDelete": return this.beforeEdgeDelete.length;
      case "afterEdgeDelete": return this.afterEdgeDelete.length;
    }
  }
}
