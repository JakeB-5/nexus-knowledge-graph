import { describe, it, expect, beforeEach } from "vitest";
import { CSVParser } from "../csv/parser.js";
import { CSVImporter } from "../csv/importer.js";
import { CSVExporter } from "../csv/exporter.js";
import type { ImportOptions } from "../types.js";

const DEFAULT_OWNER = "00000000-0000-0000-0000-000000000001";
const defaultOptions: ImportOptions = { ownerId: DEFAULT_OWNER };

// ─── CSVParser ────────────────────────────────────────────────────────────────

describe("CSVParser", () => {
  let parser: CSVParser;

  beforeEach(() => {
    parser = new CSVParser();
  });

  describe("parse", () => {
    it("parses basic CSV with headers", () => {
      const csv = "title,content,type\nNode A,Some content,concept\nNode B,Other content,document";
      const result = parser.parse(csv);
      expect(result.headers).toEqual(["title", "content", "type"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.["title"]).toBe("Node A");
    });

    it("handles quoted fields with commas", () => {
      const csv = `title,content\n"Hello, World","Content with, comma"`;
      const result = parser.parse(csv);
      expect(result.rows[0]?.["title"]).toBe("Hello, World");
      expect(result.rows[0]?.["content"]).toBe("Content with, comma");
    });

    it("handles escaped quotes inside quoted fields", () => {
      const csv = `title,notes\n"He said ""hello""","Normal"`;
      const result = parser.parse(csv);
      expect(result.rows[0]?.["title"]).toBe(`He said "hello"`);
    });

    it("handles Windows line endings (CRLF)", () => {
      const csv = "a,b\r\n1,2\r\n3,4";
      const result = parser.parse(csv);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.["a"]).toBe("1");
    });

    it("skips empty lines when skipEmptyLines is true", () => {
      const csv = "title,content\nA,B\n\nC,D";
      const result = parser.parse(csv, { skipEmptyLines: true });
      expect(result.rows).toHaveLength(2);
    });

    it("trims whitespace when trim is true", () => {
      const csv = " title , content \n Alice , Some text ";
      const result = parser.parse(csv, { trim: true });
      expect(result.headers[0]).toBe("title");
      expect(result.rows[0]?.["title"]).toBe("Alice");
    });

    it("respects maxRows option", () => {
      const csv = "a\n1\n2\n3\n4\n5";
      const result = parser.parse(csv, { maxRows: 3 });
      expect(result.rows).toHaveLength(3);
    });

    it("handles tab-separated values", () => {
      const csv = "name\tvalue\nfoo\t42\nbar\t99";
      const result = parser.parse(csv, { delimiter: "\t" });
      expect(result.rows[0]?.["name"]).toBe("foo");
      expect(result.rows[0]?.["value"]).toBe("42");
    });

    it("returns totalRows count", () => {
      const csv = "h\n1\n2\n3";
      const result = parser.parse(csv);
      expect(result.totalRows).toBe(3);
    });
  });

  describe("detectDelimiter", () => {
    it("detects comma as delimiter", () => {
      expect(parser.detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    });

    it("detects tab as delimiter", () => {
      expect(parser.detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    });

    it("detects semicolon as delimiter", () => {
      expect(parser.detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    });

    it("detects pipe as delimiter", () => {
      expect(parser.detectDelimiter("a|b|c\n1|2|3")).toBe("|");
    });
  });

  describe("detectColumnTypes", () => {
    it("detects id column by name", () => {
      const types = parser.detectColumnTypes(["id", "name"], []);
      expect(types["id"]).toBe("id");
    });

    it("detects UUID values as id type", () => {
      const rows = Array.from({ length: 10 }, () => ({
        col: "550e8400-e29b-41d4-a716-446655440000",
      }));
      const types = parser.detectColumnTypes(["col"], rows);
      expect(types["col"]).toBe("id");
    });

    it("detects numeric columns", () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({ num: String(i) }));
      const types = parser.detectColumnTypes(["num"], rows);
      expect(types["num"]).toBe("number");
    });

    it("detects boolean columns", () => {
      const rows = [
        { flag: "true" }, { flag: "false" }, { flag: "true" }, { flag: "false" },
        { flag: "true" }, { flag: "false" }, { flag: "true" }, { flag: "false" },
        { flag: "true" }, { flag: "false" },
      ];
      const types = parser.detectColumnTypes(["flag"], rows);
      expect(types["flag"]).toBe("boolean");
    });

    it("detects content column by name", () => {
      const types = parser.detectColumnTypes(["body"], []);
      expect(types["body"]).toBe("content");
    });
  });

  describe("serialize", () => {
    it("round-trips through parse and serialize", () => {
      const csv = "title,content\nFoo,Bar\nBaz,Qux";
      const parsed = parser.parse(csv);
      const serialized = parser.serialize(parsed.rows, parsed.headers);
      expect(serialized).toContain("title,content");
      expect(serialized).toContain("Foo,Bar");
    });

    it("quotes fields containing delimiter", () => {
      const rows = [{ title: "Hello, World", content: "Normal" }];
      const serialized = parser.serialize(rows, ["title", "content"]);
      expect(serialized).toContain('"Hello, World"');
    });
  });

  describe("parseStream", () => {
    it("calls onBatch for each batch", () => {
      const rows = Array.from({ length: 250 }, (_, i) => `Row ${i},Content`).join("\n");
      const csv = `title,content\n${rows}`;
      const batches: number[] = [];

      parser.parseStream(csv, {}, (batch) => batches.push(batch.length), 100);

      expect(batches.length).toBe(3); // 100, 100, 50
      expect(batches[0]).toBe(100);
    });
  });
});

// ─── CSVImporter ──────────────────────────────────────────────────────────────

describe("CSVImporter", () => {
  let importer: CSVImporter;

  beforeEach(() => {
    importer = new CSVImporter();
  });

  it("has correct name and extensions", () => {
    expect(importer.name).toBe("csv");
    expect(importer.supportedExtensions).toContain(".csv");
  });

  it("imports CSV rows as nodes", async () => {
    const csv = "title,content,type\nAlice,A person,person\nBob,Another person,person";
    const parsed = await importer.parse(csv);
    const result = await importer.import(parsed, defaultOptions);

    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.nodes.some((n) => n.title === "Alice")).toBe(true);
    expect(result.errors.filter((e) => e.fatal)).toHaveLength(0);
  });

  it("skips rows with no title", async () => {
    const csv = "title,content\n,No title here\nFoo,Has title";
    const parsed = await importer.parse(csv);
    const result = await importer.import(parsed, defaultOptions);

    expect(result.nodes.some((n) => n.title === "Foo")).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("preserves extra columns as metadata", async () => {
    const csv = "title,content,custom_field\nFoo,Bar,custom_value";
    const parsed = await importer.parse(csv);
    const result = await importer.import(parsed, defaultOptions);

    const node = result.nodes.find((n) => n.title === "Foo");
    expect((node?.metadata as Record<string, unknown>)?.["custom_field"]).toBe("custom_value");
  });

  it("handles tag columns", async () => {
    const csv = "title,tags\nFoo,alpha;beta;gamma";
    const parsed = await importer.parse(csv);
    const result = await importer.import(parsed, defaultOptions);

    const node = result.nodes.find((n) => n.title === "Foo");
    const tags = (node?.metadata as Record<string, unknown>)?.["tags"];
    expect(Array.isArray(tags)).toBe(true);
    expect((tags as string[]).length).toBeGreaterThan(0);
  });

  it("imports edge rows in edge mode", async () => {
    const csv = "source_id,target_id,type\naaa,bbb,references\nbbb,ccc,contains";
    const parsed = await importer.parse(csv);
    const result = await importer.import(parsed, {
      ...defaultOptions,
      edgeMode: true,
    } as ImportOptions & { edgeMode: boolean });

    expect(result.edges.length).toBeGreaterThanOrEqual(2);
  });

  it("reports progress during batch processing", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => `Node ${i},Content`).join("\n");
    const csv = `title,content\n${rows}`;
    const parsed = await importer.parse(csv);
    const progress: number[] = [];

    await importer.import(parsed, {
      ...defaultOptions,
      batchSize: 50,
      onProgress: (p) => progress.push(p.percentage),
    });

    expect(progress.length).toBeGreaterThan(0);
  });

  it("validates empty CSV", async () => {
    const parsed = await importer.parse("");
    const validation = importer.validate(parsed);
    // empty CSV may have no headers
    expect(typeof validation.valid).toBe("boolean");
  });
});

// ─── CSVExporter ──────────────────────────────────────────────────────────────

describe("CSVExporter", () => {
  let exporter: CSVExporter;

  beforeEach(() => {
    exporter = new CSVExporter();
  });

  it("has correct name and extension", () => {
    expect(exporter.name).toBe("csv");
    expect(exporter.defaultExtension).toBe(".csv");
  });

  it("exports nodes to CSV format", async () => {
    const nodes = [
      { type: "concept" as const, title: "Alpha", content: "Content A", metadata: {}, ownerId: DEFAULT_OWNER },
      { type: "document" as const, title: "Beta", content: "Content B", metadata: {}, ownerId: DEFAULT_OWNER },
    ];

    const result = await exporter.export(nodes, [], { includeMetadata: false, includeEdges: false });
    expect(result.content).toContain("Alpha");
    expect(result.content).toContain("Beta");
    expect(result.mimeType).toBe("text/csv");
  });

  it("includes edge data when includeEdges is true", async () => {
    const nodes = [
      { type: "concept" as const, title: "A", content: undefined, metadata: {}, ownerId: DEFAULT_OWNER },
    ];
    const edges = [
      { type: "references" as const, sourceId: "aaa", targetId: "bbb", weight: 1, metadata: {} },
    ];

    const result = await exporter.export(nodes, edges, { includeMetadata: false, includeEdges: true });
    expect(result.content).toContain("references");
  });

  it("serializes result to string", async () => {
    const result = await exporter.export([], [], { includeMetadata: false, includeEdges: false });
    expect(typeof exporter.serialize(result)).toBe("string");
  });
});
