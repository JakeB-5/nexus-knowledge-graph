import { describe, it, expect, beforeEach, vi } from "vitest";
import { ImportPipeline, ValidationStage, SanitizationStage, DeduplicationStage } from "../pipeline.js";
import { MarkdownImporter } from "../markdown/importer.js";
import { CSVImporter } from "../csv/importer.js";
import type { ImportOptions, ImportResult, Importer } from "../types.js";
import type { CreateNode } from "@nexus/shared";

const DEFAULT_OWNER = "00000000-0000-0000-0000-000000000001";
const defaultOptions: ImportOptions = { ownerId: DEFAULT_OWNER };

// Helper: create minimal valid node
function makeNode(overrides: Partial<CreateNode> = {}): CreateNode {
  return {
    type: "concept",
    title: "Test Node",
    content: "Some content",
    metadata: {},
    ownerId: DEFAULT_OWNER,
    ...overrides,
  };
}

// Helper: create a mock importer
function mockImporter(result: Partial<ImportResult>): Importer<unknown> {
  return {
    name: "mock",
    supportedExtensions: [".mock"],
    parse: async () => ({}),
    validate: () => ({ valid: true, errors: [], warnings: [] }),
    import: async () => ({
      nodes: [],
      edges: [],
      warnings: [],
      errors: [],
      stats: {
        totalProcessed: 1,
        nodesCreated: 0,
        edgesCreated: 0,
        duplicatesSkipped: 0,
        errorsEncountered: 0,
        durationMs: 0,
      },
      ...result,
    }),
  };
}

// ─── Pipeline Stages ──────────────────────────────────────────────────────────

describe("ValidationStage", () => {
  it("keeps valid nodes", async () => {
    const stage = new ValidationStage();
    const nodes = [makeNode(), makeNode({ title: "Another" })];
    const result = await stage.run(nodes, {});
    expect(result).toHaveLength(2);
  });

  it("removes nodes with empty title", async () => {
    const stage = new ValidationStage();
    const nodes = [makeNode({ title: "" }), makeNode({ title: "Valid" })];
    const result = await stage.run(nodes, {});
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Valid");
  });

  it("removes nodes with missing ownerId", async () => {
    const stage = new ValidationStage();
    const nodes = [makeNode({ ownerId: "" }), makeNode()];
    const result = await stage.run(nodes, {});
    expect(result).toHaveLength(1);
  });
});

describe("SanitizationStage", () => {
  it("trims whitespace from titles", async () => {
    const stage = new SanitizationStage();
    const nodes = [makeNode({ title: "  Padded Title  " })];
    const result = await stage.run(nodes, {});
    expect(result[0]?.title).toBe("Padded Title");
  });

  it("strips HTML from content", async () => {
    const stage = new SanitizationStage();
    const nodes = [makeNode({ content: "<b>Bold</b> text" })];
    const result = await stage.run(nodes, {});
    expect(result[0]?.content).not.toContain("<b>");
    expect(result[0]?.content).toContain("Bold");
  });

  it("normalizes metadata", async () => {
    const stage = new SanitizationStage();
    const nodes = [makeNode({ metadata: { key: "  spaced  ", nullVal: null } })];
    const result = await stage.run(nodes, {});
    const meta = result[0]?.metadata as Record<string, unknown>;
    expect(meta?.["key"]).toBe("spaced");
    expect(meta?.["nullVal"]).toBeUndefined();
  });
});

describe("DeduplicationStage", () => {
  it("removes exact duplicate titles", async () => {
    const stage = new DeduplicationStage();
    const nodes = [
      makeNode({ title: "Same Title" }),
      makeNode({ title: "Same Title" }),
      makeNode({ title: "Different" }),
    ];
    const result = await stage.run(nodes, {});
    expect(result).toHaveLength(2);
  });

  it("keeps unique nodes intact", async () => {
    const stage = new DeduplicationStage();
    const nodes = [
      makeNode({ title: "Alpha" }),
      makeNode({ title: "Beta" }),
      makeNode({ title: "Gamma" }),
    ];
    const result = await stage.run(nodes, {});
    expect(result).toHaveLength(3);
  });
});

// ─── ImportPipeline ───────────────────────────────────────────────────────────

describe("ImportPipeline", () => {
  describe("constructor", () => {
    it("creates pipeline with default stages", () => {
      const pipeline = new ImportPipeline();
      expect(pipeline).toBeDefined();
    });

    it("can disable deduplicate stage", () => {
      const pipeline = new ImportPipeline({ deduplicate: false });
      expect(pipeline).toBeDefined();
    });
  });

  describe("run", () => {
    it("runs successfully with valid markdown", async () => {
      const pipeline = new ImportPipeline();
      const importer = new MarkdownImporter();
      const md = "# Test Document\n\nSome content here.";

      const result = await pipeline.run(md, importer, defaultOptions);

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.errors.filter((e) => e.fatal)).toHaveLength(0);
      expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("runs successfully with valid CSV", async () => {
      const pipeline = new ImportPipeline();
      const importer = new CSVImporter();
      const csv = "title,content,type\nAlpha,Content A,concept\nBeta,Content B,document";

      const result = await pipeline.run(csv, importer, defaultOptions);

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("returns fatal error when parse fails", async () => {
      const pipeline = new ImportPipeline();
      const badImporter: Importer<unknown> = {
        name: "bad",
        supportedExtensions: [],
        parse: async () => { throw new Error("Parse failure"); },
        validate: () => ({ valid: true, errors: [], warnings: [] }),
        import: async () => ({ nodes: [], edges: [], warnings: [], errors: [], stats: { totalProcessed: 0, nodesCreated: 0, edgesCreated: 0, duplicatesSkipped: 0, errorsEncountered: 0, durationMs: 0 } }),
      };

      const result = await pipeline.run("content", badImporter, defaultOptions);
      expect(result.errors.some((e) => e.fatal)).toBe(true);
      expect(result.nodes).toHaveLength(0);
    });

    it("returns fatal error when validate fails", async () => {
      const pipeline = new ImportPipeline();
      const invalidImporter: Importer<unknown> = {
        name: "invalid",
        supportedExtensions: [],
        parse: async () => ({}),
        validate: () => ({ valid: false, errors: ["Content is empty"], warnings: [] }),
        import: async () => ({ nodes: [], edges: [], warnings: [], errors: [], stats: { totalProcessed: 0, nodesCreated: 0, edgesCreated: 0, duplicatesSkipped: 0, errorsEncountered: 0, durationMs: 0 } }),
      };

      const result = await pipeline.run("content", invalidImporter, defaultOptions);
      expect(result.errors.some((e) => e.fatal)).toBe(true);
    });

    it("deduplicates nodes across the pipeline", async () => {
      const pipeline = new ImportPipeline({ deduplicate: true });
      const nodes: CreateNode[] = [
        makeNode({ title: "Duplicate" }),
        makeNode({ title: "Duplicate" }),
        makeNode({ title: "Unique" }),
      ];
      const importer = mockImporter({ nodes });

      const result = await pipeline.run("content", importer, defaultOptions);
      const dupCount = result.nodes.filter((n) => n.title === "Duplicate").length;
      expect(dupCount).toBe(1);
    });

    it("reports progress via callback", async () => {
      const pipeline = new ImportPipeline();
      const importer = new MarkdownImporter();
      const md = "# Progress\n\nContent here.";
      const phases: string[] = [];

      await pipeline.run(md, importer, {
        ...defaultOptions,
        onProgress: (p) => phases.push(p.phase),
      });

      expect(phases).toContain("parsing");
      expect(phases).toContain("importing");
    });

    it("collects warnings from importer", async () => {
      const pipeline = new ImportPipeline();
      const importer = mockImporter({
        warnings: [{ message: "A warning" }],
      });

      const result = await pipeline.run("content", importer, defaultOptions);
      expect(result.warnings.some((w) => w.message === "A warning")).toBe(true);
    });

    it("processes nodes in batches", async () => {
      const pipeline = new ImportPipeline({ chunkSize: 5, deduplicate: false, sanitize: false, validate: false });
      const nodes: CreateNode[] = Array.from({ length: 20 }, (_, i) => makeNode({ title: `Node ${i}` }));
      const importer = mockImporter({ nodes });

      const result = await pipeline.run("content", importer, defaultOptions);
      expect(result.nodes).toHaveLength(20);
    });
  });

  describe("runOnResult", () => {
    it("processes an existing ImportResult through pipeline stages", async () => {
      const pipeline = new ImportPipeline({ deduplicate: true });

      const inputResult: ImportResult = {
        nodes: [
          makeNode({ title: "Dup" }),
          makeNode({ title: "Dup" }),
          makeNode({ title: "Unique" }),
        ],
        edges: [],
        warnings: [],
        errors: [],
        stats: { totalProcessed: 3, nodesCreated: 3, edgesCreated: 0, duplicatesSkipped: 0, errorsEncountered: 0, durationMs: 0 },
      };

      const result = await pipeline.runOnResult(inputResult);
      expect(result.nodes.filter((n) => n.title === "Dup")).toHaveLength(1);
      expect(result.stats.duplicatesSkipped).toBe(1);
    });
  });

  describe("addStage", () => {
    it("allows adding custom stages", async () => {
      const pipeline = new ImportPipeline({ validate: false, sanitize: false, deduplicate: false });

      let stageCalled = false;
      pipeline.addStage({
        name: "custom",
        run: async (nodes) => {
          stageCalled = true;
          return nodes;
        },
      });

      const importer = mockImporter({ nodes: [makeNode()] });
      await pipeline.run("content", importer, defaultOptions);

      expect(stageCalled).toBe(true);
    });
  });

  describe("mergeResults", () => {
    it("merges multiple import results", () => {
      const a: ImportResult = {
        nodes: [makeNode({ title: "A" })],
        edges: [],
        warnings: [{ message: "w1" }],
        errors: [],
        stats: { totalProcessed: 1, nodesCreated: 1, edgesCreated: 0, duplicatesSkipped: 0, errorsEncountered: 0, durationMs: 10 },
      };
      const b: ImportResult = {
        nodes: [makeNode({ title: "B" }), makeNode({ title: "C" })],
        edges: [{ type: "references", sourceId: "A", targetId: "B", weight: 1, metadata: {} }],
        warnings: [],
        errors: [],
        stats: { totalProcessed: 2, nodesCreated: 2, edgesCreated: 1, duplicatesSkipped: 0, errorsEncountered: 0, durationMs: 20 },
      };

      const merged = ImportPipeline.mergeResults([a, b]);
      expect(merged.nodes).toHaveLength(3);
      expect(merged.edges).toHaveLength(1);
      expect(merged.warnings).toHaveLength(1);
      expect(merged.stats.totalProcessed).toBe(3);
      expect(merged.stats.durationMs).toBe(30);
    });

    it("returns empty result for empty array", () => {
      const merged = ImportPipeline.mergeResults([]);
      expect(merged.nodes).toHaveLength(0);
      expect(merged.stats.nodesCreated).toBe(0);
    });
  });

  describe("error handling with onError callback", () => {
    it("calls onError callback for fatal errors", async () => {
      const errors: string[] = [];
      const pipeline = new ImportPipeline({
        onError: (e) => errors.push(e.message),
      });

      const badImporter: Importer<unknown> = {
        name: "bad",
        supportedExtensions: [],
        parse: async () => { throw new Error("boom"); },
        validate: () => ({ valid: true, errors: [], warnings: [] }),
        import: async () => ({ nodes: [], edges: [], warnings: [], errors: [], stats: { totalProcessed: 0, nodesCreated: 0, edgesCreated: 0, duplicatesSkipped: 0, errorsEncountered: 0, durationMs: 0 } }),
      };

      await pipeline.run("content", badImporter, defaultOptions);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("boom");
    });
  });
});
