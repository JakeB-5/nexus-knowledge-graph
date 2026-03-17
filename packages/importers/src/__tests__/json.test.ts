import { describe, it, expect, beforeEach } from "vitest";
import { JSONImporter } from "../json/importer.js";
import { JSONExporter } from "../json/exporter.js";
import type { ImportOptions } from "../types.js";

const DEFAULT_OWNER = "00000000-0000-0000-0000-000000000001";
const defaultOptions: ImportOptions = { ownerId: DEFAULT_OWNER };

// ─── JSONImporter ─────────────────────────────────────────────────────────────

describe("JSONImporter", () => {
  let importer: JSONImporter;

  beforeEach(() => {
    importer = new JSONImporter();
  });

  it("has correct name and extensions", () => {
    expect(importer.name).toBe("json");
    expect(importer.supportedExtensions).toContain(".json");
  });

  describe("parse", () => {
    it("parses valid JSON object", async () => {
      const doc = await importer.parse('{"title":"Hello","content":"World"}');
      expect(doc.isArray).toBe(false);
      expect(doc.isJsonLd).toBe(false);
    });

    it("parses valid JSON array", async () => {
      const doc = await importer.parse('[{"title":"A"},{"title":"B"}]');
      expect(doc.isArray).toBe(true);
      expect(doc.nodeCount).toBeGreaterThan(0);
    });

    it("detects JSON-LD by @context", async () => {
      const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "Person", "name": "Alice" });
      const doc = await importer.parse(jsonLd);
      expect(doc.isJsonLd).toBe(true);
    });

    it("throws on invalid JSON", async () => {
      await expect(importer.parse("{invalid json}")).rejects.toThrow("Invalid JSON");
    });

    it("measures depth correctly", async () => {
      const nested = JSON.stringify({ a: { b: { c: { d: "leaf" } } } });
      const doc = await importer.parse(nested);
      expect(doc.depth).toBeGreaterThanOrEqual(4);
    });
  });

  describe("validate", () => {
    it("returns valid for normal JSON", async () => {
      const doc = await importer.parse('{"title":"Test"}');
      const v = importer.validate(doc);
      expect(v.valid).toBe(true);
    });

    it("warns on deeply nested JSON", async () => {
      let nested: Record<string, unknown> = { leaf: "value" };
      for (let i = 0; i < 12; i++) nested = { child: nested };
      const doc = await importer.parse(JSON.stringify(nested));
      const v = importer.validate(doc);
      expect(v.warnings.some((w) => w.includes("depth"))).toBe(true);
    });
  });

  describe("import - array", () => {
    it("creates a node per array item", async () => {
      const json = JSON.stringify([
        { title: "Node A", content: "Content A", type: "concept" },
        { title: "Node B", content: "Content B", type: "document" },
      ]);
      const doc = await importer.parse(json);
      const result = await importer.import(doc, defaultOptions);

      expect(result.nodes.some((n) => n.title === "Node A")).toBe(true);
      expect(result.nodes.some((n) => n.title === "Node B")).toBe(true);
    });

    it("creates a container node for the array", async () => {
      const json = JSON.stringify([{ title: "Item", content: "Body" }]);
      const doc = await importer.parse(json);
      const result = await importer.import(doc, defaultOptions);

      expect(result.nodes.some((n) => n.type === "document")).toBe(true);
    });

    it("uses 'name' field as title when 'title' absent", async () => {
      const json = JSON.stringify([{ name: "Alice", age: 30 }]);
      const doc = await importer.parse(json);
      const result = await importer.import(doc, defaultOptions);

      expect(result.nodes.some((n) => n.title === "Alice")).toBe(true);
    });
  });

  describe("import - object", () => {
    it("creates a root node from JSON object", async () => {
      const json = JSON.stringify({ title: "My Object", content: "Some text" });
      const doc = await importer.parse(json);
      const result = await importer.import(doc, defaultOptions);

      expect(result.nodes.some((n) => n.title === "My Object")).toBe(true);
    });

    it("creates child nodes for nested arrays", async () => {
      const json = JSON.stringify({
        title: "Parent",
        children: [{ title: "Child A" }, { title: "Child B" }],
      });
      const doc = await importer.parse(json);
      const result = await importer.import(doc, defaultOptions);

      expect(result.nodes.length).toBeGreaterThan(1);
      expect(result.edges.some((e) => e.type === "contains")).toBe(true);
    });

    it("detects person type from content signals", async () => {
      const json = JSON.stringify({
        title: "Dr. Smith",
        content: "A biography of Dr. Smith, born in 1970.",
      });
      const doc = await importer.parse(json);
      const result = await importer.import(doc, defaultOptions);

      const root = result.nodes.find((n) => n.title === "Dr. Smith");
      expect(root?.type).toBe("person");
    });
  });

  describe("import - JSON-LD", () => {
    it("imports JSON-LD graph nodes", async () => {
      const jsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@id": "urn:a", "@type": "Person", "name": "Alice" },
          { "@id": "urn:b", "@type": "Organization", "name": "Acme Corp" },
        ],
      });

      const doc = await importer.parse(jsonLd);
      const result = await importer.import(doc, defaultOptions);

      expect(result.nodes.some((n) => n.title === "Alice")).toBe(true);
      expect(result.nodes.some((n) => n.title === "Acme Corp")).toBe(true);
    });

    it("creates edges from JSON-LD @id references", async () => {
      const jsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@id": "urn:alice",
            "@type": "Person",
            "name": "Alice",
            "worksFor": { "@id": "urn:acme" },
          },
          { "@id": "urn:acme", "@type": "Organization", "name": "Acme" },
        ],
      });

      const doc = await importer.parse(jsonLd);
      const result = await importer.import(doc, defaultOptions);

      expect(result.edges.some((e) => e.type === "references")).toBe(true);
    });
  });

  it("calls progress callback", async () => {
    const json = JSON.stringify([{ title: "A" }, { title: "B" }]);
    const doc = await importer.parse(json);
    const progresses: number[] = [];

    await importer.import(doc, {
      ...defaultOptions,
      onProgress: (p) => progresses.push(p.percentage),
    });

    expect(progresses.length).toBeGreaterThan(0);
  });

  it("returns stats", async () => {
    const json = JSON.stringify({ title: "Stats Test", content: "Content" });
    const doc = await importer.parse(json);
    const result = await importer.import(doc, defaultOptions);

    expect(result.stats.nodesCreated).toBeGreaterThan(0);
    expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── JSONExporter ─────────────────────────────────────────────────────────────

describe("JSONExporter", () => {
  let exporter: JSONExporter;

  const sampleNodes = [
    { type: "document" as const, title: "Doc A", content: "Content A", metadata: {}, ownerId: DEFAULT_OWNER },
    { type: "concept" as const, title: "Concept B", content: undefined, metadata: { tags: ["x"] }, ownerId: DEFAULT_OWNER },
  ];

  const sampleEdges = [
    { type: "references" as const, sourceId: "Doc A", targetId: "Concept B", weight: 0.8, metadata: {} },
  ];

  beforeEach(() => {
    exporter = new JSONExporter();
  });

  it("has correct name and extension", () => {
    expect(exporter.name).toBe("json");
    expect(exporter.defaultExtension).toBe(".json");
  });

  describe("flat format", () => {
    it("exports nodes as flat array", async () => {
      const result = await exporter.export(sampleNodes, [], {
        includeMetadata: true,
        includeEdges: false,
      });

      const parsed = JSON.parse(result.content);
      expect(Array.isArray(parsed.nodes)).toBe(true);
      expect(parsed.nodes).toHaveLength(2);
    });

    it("includes edges when includeEdges is true", async () => {
      const result = await exporter.export(sampleNodes, sampleEdges, {
        includeMetadata: true,
        includeEdges: true,
      });

      const parsed = JSON.parse(result.content);
      expect(Array.isArray(parsed.edges)).toBe(true);
      expect(parsed.edges).toHaveLength(1);
    });

    it("excludes metadata when includeMetadata is false", async () => {
      const result = await exporter.export(sampleNodes, [], {
        includeMetadata: false,
        includeEdges: false,
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.nodes[0].metadata).toBeUndefined();
    });

    it("includes version and exportedAt", async () => {
      const result = await exporter.export(sampleNodes, [], {
        includeMetadata: false,
        includeEdges: false,
      });
      const parsed = JSON.parse(result.content);
      expect(parsed.version).toBe("1.0");
      expect(parsed.exportedAt).toBeDefined();
    });
  });

  describe("nested format", () => {
    it("exports as nested tree", async () => {
      const nodes = [
        { type: "document" as const, title: "Root", content: "r", metadata: {}, ownerId: DEFAULT_OWNER },
        { type: "concept" as const, title: "Child", content: "c", metadata: {}, ownerId: DEFAULT_OWNER },
      ];
      const edges = [
        { type: "contains" as const, sourceId: "Root", targetId: "Child", weight: 1, metadata: {} },
      ];

      const result = await exporter.export(nodes, edges, {
        includeMetadata: true,
        includeEdges: true,
        jsonFormat: "nested",
      } as Parameters<typeof exporter.export>[2]);

      const parsed = JSON.parse(result.content);
      expect(parsed.format).toBe("nested");
      expect(Array.isArray(parsed.nodes)).toBe(true);
    });
  });

  describe("JSON-LD format", () => {
    it("exports as JSON-LD with @context and @graph", async () => {
      const result = await exporter.export(sampleNodes, sampleEdges, {
        includeMetadata: true,
        includeEdges: true,
        jsonFormat: "jsonld",
      } as Parameters<typeof exporter.export>[2]);

      const parsed = JSON.parse(result.content);
      expect(parsed["@context"]).toBeDefined();
      expect(Array.isArray(parsed["@graph"])).toBe(true);
      expect(parsed["@graph"]).toHaveLength(2);
    });

    it("assigns @id based on title", async () => {
      const result = await exporter.export(sampleNodes, [], {
        includeMetadata: false,
        includeEdges: false,
        jsonFormat: "jsonld",
      } as Parameters<typeof exporter.export>[2]);

      const parsed = JSON.parse(result.content);
      const ids = parsed["@graph"].map((n: Record<string, unknown>) => n["@id"] as string);
      expect(ids.every((id: string) => typeof id === "string" && id.startsWith("urn:"))).toBe(true);
    });
  });

  it("produces pretty output when pretty is true", async () => {
    const result = await exporter.export(sampleNodes, [], {
      includeMetadata: false,
      includeEdges: false,
      pretty: true,
    });

    expect(result.content).toContain("\n");
  });

  it("serializes result to string", async () => {
    const result = await exporter.export([], [], { includeMetadata: false, includeEdges: false });
    expect(typeof exporter.serialize(result)).toBe("string");
  });
});
