import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoTagPlugin, createAutoTagPlugin } from "../builtin/auto-tag.js";
import { LinkExtractorPlugin, extractLinks } from "../builtin/link-extractor.js";
import { MetricsCollectorPlugin, createMetricsCollectorPlugin } from "../builtin/metrics-collector.js";
import type { PluginContext, HookContext } from "../types.js";
import type { CreateNode, Node, Edge } from "@nexus/shared";

// ─── Mock Context ─────────────────────────────────────────────────────────────

function makeMockContext(config: Record<string, unknown> = {}): PluginContext {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const listeners = new Map<string, Array<(p: unknown) => void>>();

  return {
    manifest: { name: "test", version: "0.1.0", description: "test" },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    config,
    emit: (event, payload) => {
      emitted.push({ event, payload });
      listeners.get(event)?.forEach((h) => h(payload));
    },
    on: (event, handler) => {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
      return () => {
        const updated = (listeners.get(event) ?? []).filter((h) => h !== handler);
        listeners.set(event, updated);
      };
    },
  };
}

function makeHookCtx<T>(data: T, pluginName = "test"): HookContext<T> {
  const ctx = {
    data,
    pluginName,
    timestamp: new Date(),
    isAborted: false,
    abortReason: undefined as string | undefined,
    abort(reason: string) {
      ctx.isAborted = true;
      ctx.abortReason = reason;
    },
  };
  return ctx;
}

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

// ─── AutoTagPlugin Tests ──────────────────────────────────────────────────────

describe("AutoTagPlugin", () => {
  let plugin: AutoTagPlugin;
  let ctx: PluginContext;

  beforeEach(() => {
    plugin = new AutoTagPlugin();
    ctx = makeMockContext();
    plugin.init(ctx);
  });

  it("has correct name and version", () => {
    expect(plugin.name).toBe("auto-tag");
    expect(plugin.version).toBe("0.1.0");
  });

  it("extracts keywords from title and content", async () => {
    const data = makeCreateNode({
      title: "meeting agenda notes",
      content: "meeting notes meeting agenda meeting agenda",
    });

    const hookCtx = makeHookCtx(data);
    const result = await plugin.hooks.beforeNodeCreate!(hookCtx);

    expect(result).toBeDefined();
    const metadata = (result as CreateNode).metadata as Record<string, unknown>;
    expect(Array.isArray(metadata["tags"])).toBe(true);
    expect((metadata["tags"] as string[]).some((t) => t === "meeting" || t === "agenda" || t === "notes")).toBe(true);
  });

  it("applies rule-based tag for meeting keyword", async () => {
    const data = makeCreateNode({
      title: "team meeting",
      content: "agenda for the meeting",
    });

    const hookCtx = makeHookCtx(data);
    const result = await plugin.hooks.beforeNodeCreate!(hookCtx);
    const tags = ((result as CreateNode).metadata as Record<string, unknown>)["tags"] as string[];
    expect(tags).toContain("meeting");
  });

  it("applies rule-based tag for URLs", async () => {
    const data = makeCreateNode({
      title: "Resources",
      content: "Check out https://example.com for more info",
    });

    const hookCtx = makeHookCtx(data);
    const result = await plugin.hooks.beforeNodeCreate!(hookCtx);
    const tags = ((result as CreateNode).metadata as Record<string, unknown>)["tags"] as string[];
    expect(tags).toContain("has-links");
  });

  it("preserves existing metadata tags", async () => {
    const data = makeCreateNode({
      title: "test document",
      content: "this document is a test document for testing purposes",
      metadata: { tags: ["existing-tag"] },
    });

    const hookCtx = makeHookCtx(data);
    const result = await plugin.hooks.beforeNodeCreate!(hookCtx);
    const tags = ((result as CreateNode).metadata as Record<string, unknown>)["tags"] as string[];
    expect(tags).toContain("existing-tag");
  });

  it("adds autoTaggedAt to metadata", async () => {
    const data = makeCreateNode({
      title: "important document",
      content: "this important document needs important tagging for important reasons",
    });

    const hookCtx = makeHookCtx(data);
    const result = await plugin.hooks.beforeNodeCreate!(hookCtx);
    const metadata = (result as CreateNode).metadata as Record<string, unknown>;
    expect(typeof metadata["autoTaggedAt"]).toBe("string");
  });

  it("returns undefined for nodes with no extractable keywords", async () => {
    const data = makeCreateNode({
      title: "a is to",
      content: "",
    });

    const hookCtx = makeHookCtx(data);
    const result = await plugin.hooks.beforeNodeCreate!(hookCtx);
    // No meaningful keywords → returns undefined (no modification)
    expect(result).toBeUndefined();
  });

  it("respects maxTags config", async () => {
    const customPlugin = createAutoTagPlugin({ maxTags: 2 });
    customPlugin.init(makeMockContext());

    const data = makeCreateNode({
      title: "document concept idea proposal task resource",
      content: "document concept idea proposal task resource document concept idea proposal task",
    });

    const hookCtx = makeHookCtx(data);
    const result = await customPlugin.hooks.beforeNodeCreate!(hookCtx);
    if (result) {
      const tags = ((result as CreateNode).metadata as Record<string, unknown>)["tags"] as string[];
      expect(tags.length).toBeLessThanOrEqual(2);
    }
  });

  it("calls destroy cleanly", () => {
    expect(() => plugin.destroy(ctx)).not.toThrow();
  });
});

// ─── LinkExtractorPlugin Tests ────────────────────────────────────────────────

describe("extractLinks", () => {
  it("extracts raw URLs", () => {
    const links = extractLinks("Visit https://example.com for details");
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toBe("https://example.com");
    expect(links[0]?.type).toBe("url");
  });

  it("extracts markdown links", () => {
    const links = extractLinks("Check [Google](https://google.com) now");
    expect(links.some((l) => l.url === "https://google.com" && l.type === "markdown")).toBe(true);
    expect(links.some((l) => l.text === "Google")).toBe(true);
  });

  it("does not double-count markdown URLs as raw URLs", () => {
    const links = extractLinks("[Example](https://example.com)");
    const urls = links.filter((l) => l.url === "https://example.com");
    expect(urls).toHaveLength(1);
  });

  it("extracts wiki-style links", () => {
    const links = extractLinks("See also [[Graph Theory]] and [[Data Structures]]");
    const wikiLinks = links.filter((l) => l.type === "wiki");
    expect(wikiLinks).toHaveLength(2);
    expect(wikiLinks.map((l) => l.text)).toContain("Graph Theory");
    expect(wikiLinks.map((l) => l.text)).toContain("Data Structures");
  });

  it("handles mixed content", () => {
    const content = `
      See [Google](https://google.com) and https://github.com
      Also check [[Related Node]] for more.
    `;
    const links = extractLinks(content);
    expect(links.some((l) => l.type === "markdown")).toBe(true);
    expect(links.some((l) => l.type === "url")).toBe(true);
    expect(links.some((l) => l.type === "wiki")).toBe(true);
  });

  it("returns empty array for content with no links", () => {
    expect(extractLinks("No links here at all.")).toHaveLength(0);
  });
});

describe("LinkExtractorPlugin", () => {
  let plugin: LinkExtractorPlugin;
  let ctx: PluginContext;

  beforeEach(() => {
    plugin = new LinkExtractorPlugin();
    ctx = makeMockContext();
    plugin.init(ctx);
  });

  it("has correct name and version", () => {
    expect(plugin.name).toBe("link-extractor");
  });

  it("emits links-extracted event after node create with links", async () => {
    const emitted: unknown[] = [];
    ctx.on("links-extracted", (p) => emitted.push(p));

    const node = makeNode({
      content: "Visit https://example.com for details",
    });

    await plugin.hooks.afterNodeCreate!(makeHookCtx(node));
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { nodeId: string }).nodeId).toBe(node.id);
  });

  it("does not emit for node with no content", async () => {
    const emitted: unknown[] = [];
    ctx.on("links-extracted", (p) => emitted.push(p));

    const node = makeNode({ content: undefined });
    await plugin.hooks.afterNodeCreate!(makeHookCtx(node));
    expect(emitted).toHaveLength(0);
  });

  it("emits create-link-edges for URL links", async () => {
    const emitted: unknown[] = [];
    ctx.on("create-link-edges", (p) => emitted.push(p));

    const node = makeNode({ content: "See https://example.com" });
    await plugin.hooks.afterNodeCreate!(makeHookCtx(node));

    expect(emitted).toHaveLength(1);
    const payload = emitted[0] as { urlLinks: { url: string }[] };
    expect(payload.urlLinks.some((l) => l.url === "https://example.com")).toBe(true);
  });

  it("emits links-re-extracted on node update", async () => {
    const emitted: unknown[] = [];
    ctx.on("links-re-extracted", (p) => emitted.push(p));

    const node = makeNode({ content: "Updated: https://new-link.com" });
    await plugin.hooks.afterNodeUpdate!(makeHookCtx(node));

    expect(emitted).toHaveLength(1);
  });

  it("destroys cleanly", () => {
    expect(() => plugin.destroy(ctx)).not.toThrow();
  });
});

// ─── MetricsCollectorPlugin Tests ─────────────────────────────────────────────

describe("MetricsCollectorPlugin", () => {
  let plugin: MetricsCollectorPlugin;
  let ctx: PluginContext;

  beforeEach(() => {
    plugin = createMetricsCollectorPlugin({ collectionIntervalMs: 999_999 }) as MetricsCollectorPlugin;
    ctx = makeMockContext({ collectionIntervalMs: 999_999 });
    plugin.init(ctx);
  });

  it("has correct name", () => {
    expect(plugin.name).toBe("metrics-collector");
  });

  it("tracks node creation", async () => {
    const node = makeNode();
    await plugin.hooks.afterNodeCreate!(makeHookCtx(node));
    await plugin.hooks.afterNodeCreate!(makeHookCtx(makeNode({ id: "00000000-0000-0000-0000-000000000009" })));

    const metrics = plugin.collectMetrics();
    expect(metrics.nodeCount).toBe(2);
  });

  it("tracks node deletion", async () => {
    const node = makeNode();
    await plugin.hooks.afterNodeCreate!(makeHookCtx(node));
    await plugin.hooks.afterNodeDelete!(makeHookCtx({ id: node.id }));

    const metrics = plugin.collectMetrics();
    expect(metrics.nodeCount).toBe(0);
  });

  it("tracks edge creation and updates adjacency", async () => {
    const edge = makeEdge();
    await plugin.hooks.afterEdgeCreate!(makeHookCtx(edge));

    const metrics = plugin.collectMetrics();
    expect(metrics.edgeCount).toBe(1);
  });

  it("tracks edge deletion", async () => {
    const edge = makeEdge();
    await plugin.hooks.afterEdgeCreate!(makeHookCtx(edge));
    await plugin.hooks.afterEdgeDelete!(makeHookCtx({ id: edge.id }));

    const metrics = plugin.collectMetrics();
    expect(metrics.edgeCount).toBe(0);
  });

  it("calculates density correctly", async () => {
    // 3 nodes, 2 edges → density = 2 / (3*2) = 0.3333...
    for (let i = 0; i < 3; i++) {
      await plugin.hooks.afterNodeCreate!(makeHookCtx(makeNode({ id: `00000000-0000-0000-0000-00000000000${i}` })));
    }
    for (let i = 0; i < 2; i++) {
      await plugin.hooks.afterEdgeCreate!(
        makeHookCtx(makeEdge({ id: `00000000-0000-0000-0000-10000000000${i}` })),
      );
    }

    const metrics = plugin.collectMetrics();
    expect(metrics.density).toBeCloseTo(2 / 6, 2);
  });

  it("calculates average degree", async () => {
    for (let i = 0; i < 4; i++) {
      await plugin.hooks.afterNodeCreate!(makeHookCtx(makeNode({ id: `00000000-0000-0000-0000-00000000000${i}` })));
    }
    await plugin.hooks.afterEdgeCreate!(makeHookCtx(makeEdge()));

    const metrics = plugin.collectMetrics();
    // averageDegree = 2 * 1 / 4 = 0.5
    expect(metrics.averageDegree).toBeCloseTo(0.5, 2);
  });

  it("node creation rate is non-negative", async () => {
    await plugin.hooks.afterNodeCreate!(makeHookCtx(makeNode()));
    const metrics = plugin.collectMetrics();
    expect(metrics.nodeCreationRate).toBeGreaterThanOrEqual(0);
  });

  it("emits metrics-final on destroy", () => {
    const emitted: unknown[] = [];
    ctx.on("metrics-final", (p) => emitted.push(p));

    plugin.destroy(ctx);
    expect(emitted).toHaveLength(1);
    const m = emitted[0] as { nodeCount: number };
    expect(typeof m.nodeCount).toBe("number");
  });

  it("clears interval on destroy", () => {
    const spy = vi.spyOn(globalThis, "clearInterval");
    plugin.destroy(ctx);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
