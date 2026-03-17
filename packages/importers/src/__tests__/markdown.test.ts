import { describe, it, expect, beforeEach } from "vitest";
import { MarkdownParser } from "../markdown/parser.js";
import { MarkdownImporter } from "../markdown/importer.js";
import { MarkdownExporter } from "../markdown/exporter.js";
import type { ImportOptions } from "../types.js";

const DEFAULT_OWNER = "00000000-0000-0000-0000-000000000001";

const defaultOptions: ImportOptions = {
  ownerId: DEFAULT_OWNER,
  skipDuplicates: false,
};

// ─── MarkdownParser ───────────────────────────────────────────────────────────

describe("MarkdownParser", () => {
  let parser: MarkdownParser;

  beforeEach(() => {
    parser = new MarkdownParser();
  });

  describe("extractFrontMatter", () => {
    it("parses valid YAML front matter", () => {
      const content = `---\ntitle: My Doc\ntags: [a, b]\n---\n# Hello`;
      const { frontMatter, body } = parser.extractFrontMatter(content);
      expect(frontMatter["title"]).toBe("My Doc");
      expect(frontMatter["tags"]).toEqual(["a", "b"]);
      expect(body).toContain("# Hello");
    });

    it("returns empty object when no front matter", () => {
      const content = "# Hello\nNo front matter here.";
      const { frontMatter, body } = parser.extractFrontMatter(content);
      expect(frontMatter).toEqual({});
      expect(body).toBe(content);
    });

    it("handles malformed YAML gracefully", () => {
      const content = "---\n: invalid: yaml:\n---\n# Body";
      const { frontMatter } = parser.extractFrontMatter(content);
      expect(frontMatter).toEqual({});
    });
  });

  describe("extractHeadings", () => {
    it("extracts all heading levels", () => {
      const content = "# H1\n## H2\n### H3\n#### H4";
      const headings = parser.extractHeadings(content);
      expect(headings).toHaveLength(4);
      expect(headings[0]).toMatchObject({ level: 1, text: "H1" });
      expect(headings[1]).toMatchObject({ level: 2, text: "H2" });
    });

    it("includes correct line numbers", () => {
      const content = "# First\n\nSome text\n\n## Second";
      const headings = parser.extractHeadings(content);
      expect(headings[0]?.line).toBe(1);
      expect(headings[1]?.line).toBe(5);
    });

    it("returns empty array for content without headings", () => {
      expect(parser.extractHeadings("Just plain text.")).toEqual([]);
    });
  });

  describe("extractLinks", () => {
    it("extracts wikilinks", () => {
      const content = "See [[Other Page]] for details.";
      const links = parser.extractLinks(content);
      const wikilinks = links.filter((l) => l.type === "wikilink");
      expect(wikilinks).toHaveLength(1);
      expect(wikilinks[0]?.target).toBe("Other Page");
    });

    it("extracts wikilinks with labels", () => {
      const content = "See [[Target|Custom Label]] here.";
      const links = parser.extractLinks(content);
      const wl = links.find((l) => l.type === "wikilink");
      expect(wl?.target).toBe("Target");
      expect(wl?.label).toBe("Custom Label");
    });

    it("extracts external links", () => {
      const content = "Visit [Google](https://google.com) today.";
      const links = parser.extractLinks(content);
      const external = links.filter((l) => l.type === "external");
      expect(external).toHaveLength(1);
      expect(external[0]?.target).toBe("https://google.com");
    });

    it("extracts internal relative links", () => {
      const content = "Read [intro](./intro.md) first.";
      const links = parser.extractLinks(content);
      const internal = links.filter((l) => l.type === "internal");
      expect(internal).toHaveLength(1);
      expect(internal[0]?.target).toBe("./intro.md");
    });

    it("handles multiple link types in one document", () => {
      const content = "[[Wiki]] and [Ext](https://x.com) and [Int](./foo.md)";
      const links = parser.extractLinks(content);
      expect(links.filter((l) => l.type === "wikilink")).toHaveLength(1);
      expect(links.filter((l) => l.type === "external")).toHaveLength(1);
      expect(links.filter((l) => l.type === "internal")).toHaveLength(1);
    });
  });

  describe("extractTags", () => {
    it("extracts hashtags from content", () => {
      const tags = parser.extractTags("Hello #TypeScript and #nodejs world", {});
      expect(tags).toContain("typescript");
      expect(tags).toContain("nodejs");
    });

    it("extracts tags from front matter array", () => {
      const tags = parser.extractTags("", { tags: ["alpha", "beta"] });
      expect(tags).toContain("alpha");
      expect(tags).toContain("beta");
    });

    it("extracts tags from front matter string", () => {
      const tags = parser.extractTags("", { tags: "one, two, three" });
      expect(tags).toContain("one");
      expect(tags).toContain("three");
    });

    it("deduplicates tags", () => {
      const tags = parser.extractTags("#foo #foo", { tags: ["foo"] });
      expect(tags.filter((t) => t === "foo")).toHaveLength(1);
    });
  });

  describe("extractTitle", () => {
    it("prefers front matter title", () => {
      const headings = [{ level: 1, text: "H1 Title", line: 1 }];
      const title = parser.extractTitle(headings, { title: "FM Title" }, undefined);
      expect(title).toBe("FM Title");
    });

    it("falls back to first H1", () => {
      const headings = [{ level: 1, text: "Document Title", line: 1 }];
      const title = parser.extractTitle(headings, {}, undefined);
      expect(title).toBe("Document Title");
    });

    it("falls back to filename when no headings", () => {
      const title = parser.extractTitle([], {}, "notes/my-note.md");
      expect(title).toBe("my note");
    });

    it("returns Untitled when nothing is available", () => {
      const title = parser.extractTitle([], {}, undefined);
      expect(title).toBe("Untitled");
    });
  });

  describe("extractCodeBlocks", () => {
    it("extracts language and content", () => {
      const content = "```typescript\nconst x = 1;\n```";
      const { codeBlocks } = parser.extractCodeBlocks(content);
      expect(codeBlocks).toHaveLength(1);
      expect(codeBlocks[0]?.language).toBe("typescript");
      expect(codeBlocks[0]?.content).toContain("const x = 1;");
    });

    it("handles blocks with metadata", () => {
      const content = "```ts title=foo.ts\nconst y = 2;\n```";
      const { codeBlocks } = parser.extractCodeBlocks(content);
      expect(codeBlocks[0]?.metadata["title"]).toBe("foo.ts");
    });

    it("replaces code blocks with placeholders in stripped output", () => {
      const content = "Before\n```js\ncode\n```\nAfter";
      const { stripped } = parser.extractCodeBlocks(content);
      expect(stripped).toContain("[CODE_BLOCK_0]");
      expect(stripped).not.toContain("code");
    });
  });

  describe("buildSectionTree", () => {
    it("builds nested section hierarchy", () => {
      const content = "# Root\n## Child 1\n### Grandchild\n## Child 2";
      const headings = parser.extractHeadings(content);
      const sections = parser.buildSectionTree(headings, content);

      expect(sections[0]?.heading).toBe("Root");
      expect(sections[0]?.children[0]?.heading).toBe("Child 1");
      expect(sections[0]?.children[0]?.children[0]?.heading).toBe("Grandchild");
      expect(sections[0]?.children[1]?.heading).toBe("Child 2");
    });

    it("handles flat headings at the same level", () => {
      const content = "## A\n## B\n## C";
      const headings = parser.extractHeadings(content);
      const sections = parser.buildSectionTree(headings, content);
      expect(sections).toHaveLength(3);
    });
  });

  describe("chunkDocument", () => {
    it("returns single chunk for small documents", () => {
      const content = "Short content";
      const chunks = parser.chunkDocument(content, 4000);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.content).toBe(content);
    });

    it("splits large documents at paragraph boundaries", () => {
      const para = "A".repeat(1000);
      const content = `${para}\n\n${para}\n\n${para}\n\n${para}\n\n${para}`;
      const chunks = parser.chunkDocument(content, 2000);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(2100); // some slack
      }
    });
  });

  describe("parse (full)", () => {
    it("parses complete markdown document", () => {
      const md = `---
title: Test Doc
tags: [foo, bar]
---
# Test Doc

Some content here.

## Section A

Content in A. See [[Other]] and [link](https://example.com).

#hashtag

\`\`\`typescript
const x = 1;
\`\`\`
`;
      const doc = parser.parse(md, "test.md");
      expect(doc.title).toBe("Test Doc");
      expect(doc.tags).toContain("foo");
      expect(doc.tags).toContain("hashtag");
      expect(doc.links.some((l) => l.type === "wikilink")).toBe(true);
      expect(doc.links.some((l) => l.type === "external")).toBe(true);
      expect(doc.codeBlocks).toHaveLength(1);
      expect(doc.sections.length).toBeGreaterThan(0);
    });
  });
});

// ─── MarkdownImporter ─────────────────────────────────────────────────────────

describe("MarkdownImporter", () => {
  let importer: MarkdownImporter;

  beforeEach(() => {
    importer = new MarkdownImporter();
  });

  it("has correct name and supported extensions", () => {
    expect(importer.name).toBe("markdown");
    expect(importer.supportedExtensions).toContain(".md");
  });

  it("imports a minimal markdown document", async () => {
    const md = "# Hello World\n\nThis is content.";
    const parsed = await importer.parse(md, "hello.md");
    const result = await importer.import(parsed, defaultOptions);

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes[0]?.title).toBe("Hello World");
    expect(result.nodes[0]?.type).toBe("document");
    expect(result.errors).toHaveLength(0);
  });

  it("creates tag nodes for extracted tags", async () => {
    const md = "# Doc\n\n#alpha #beta";
    const parsed = await importer.parse(md);
    const result = await importer.import(parsed, defaultOptions);

    const tagNodes = result.nodes.filter((n) => n.type === "tag");
    expect(tagNodes.length).toBeGreaterThan(0);
    expect(tagNodes.some((n) => n.title === "alpha")).toBe(true);
  });

  it("creates resource nodes for external links", async () => {
    const md = "# Doc\n\nSee [Google](https://google.com)";
    const parsed = await importer.parse(md);
    const result = await importer.import(parsed, defaultOptions);

    const resourceNodes = result.nodes.filter((n) => n.type === "resource");
    expect(resourceNodes.length).toBeGreaterThan(0);
  });

  it("creates section nodes for H2+ headings", async () => {
    const md = "# Main\n\n## Section A\n\nContent A\n\n## Section B\n\nContent B";
    const parsed = await importer.parse(md);
    const result = await importer.import(parsed, defaultOptions);

    const conceptNodes = result.nodes.filter((n) => n.type === "concept");
    expect(conceptNodes.length).toBeGreaterThan(0);
  });

  it("creates code block nodes for substantial code", async () => {
    const md = "# Doc\n\n```typescript\nconst longCode = 'this is a long code block';\n```";
    const parsed = await importer.parse(md);
    const result = await importer.import(parsed, defaultOptions);

    const codeNodes = result.nodes.filter((n) =>
      (n.metadata as Record<string, unknown>)["codeBlock"] === true
    );
    expect(codeNodes.length).toBeGreaterThan(0);
  });

  it("includes front matter in root node metadata", async () => {
    const md = "---\nauthor: Alice\ndate: 2024-01-01\n---\n# Doc\n\nContent";
    const parsed = await importer.parse(md);
    const result = await importer.import(parsed, defaultOptions);

    const root = result.nodes[0];
    expect((root?.metadata as Record<string, unknown>)["author"]).toBe("Alice");
  });

  it("calls progress callback", async () => {
    const md = "# Progress Test\n\nContent here.";
    const parsed = await importer.parse(md);
    const progresses: number[] = [];

    await importer.import(parsed, {
      ...defaultOptions,
      onProgress: (p) => progresses.push(p.percentage),
    });

    expect(progresses.length).toBeGreaterThan(0);
    expect(progresses[progresses.length - 1]).toBe(100);
  });

  it("validates empty document with warning", async () => {
    const parsed = await importer.parse("   ");
    const validation = importer.validate(parsed);
    expect(validation.valid).toBe(false);
  });

  describe("importVault", () => {
    it("imports multiple files as linked documents", async () => {
      const files = [
        { path: "a.md", content: "# Document A\n\nSee [[Document B]]" },
        { path: "b.md", content: "# Document B\n\nReferences [[Document A]]" },
      ];

      const result = await importer.importVault({
        ...defaultOptions,
        files,
        resolveWikilinks: true,
      });

      expect(result.nodes.length).toBeGreaterThan(1);
      expect(result.stats.totalProcessed).toBe(2);
    });
  });
});

// ─── MarkdownExporter ─────────────────────────────────────────────────────────

describe("MarkdownExporter", () => {
  let exporter: MarkdownExporter;

  beforeEach(() => {
    exporter = new MarkdownExporter();
  });

  it("has correct name and extension", () => {
    expect(exporter.name).toBe("markdown");
    expect(exporter.defaultExtension).toBe(".md");
  });

  it("exports nodes as markdown with H1 titles", async () => {
    const nodes = [
      {
        type: "document" as const,
        title: "My Document",
        content: "Some content here.",
        metadata: {},
        ownerId: DEFAULT_OWNER,
      },
    ];

    const result = await exporter.export(nodes, [], {
      includeMetadata: false,
      includeEdges: false,
    });

    expect(result.content).toContain("# My Document");
    expect(result.content).toContain("Some content here.");
    expect(result.mimeType).toBe("text/markdown");
  });

  it("includes front matter when includeMetadata is true", async () => {
    const nodes = [
      {
        type: "concept" as const,
        title: "Concept Node",
        content: undefined,
        metadata: { tags: ["a", "b"] },
        ownerId: DEFAULT_OWNER,
      },
    ];

    const result = await exporter.export(nodes, [], {
      includeMetadata: true,
      includeEdges: false,
    });

    expect(result.content).toContain("---");
    expect(result.content).toContain("type: concept");
  });

  it("exports vault as JSON manifest in vault mode", async () => {
    const nodes = [
      { type: "document" as const, title: "A", content: "A content", metadata: {}, ownerId: DEFAULT_OWNER },
      { type: "document" as const, title: "B", content: "B content", metadata: {}, ownerId: DEFAULT_OWNER },
    ];

    const result = await exporter.export(nodes, [], {
      includeMetadata: false,
      includeEdges: false,
      format: "vault",
      vaultMode: true,
    } as Parameters<typeof exporter.export>[2]);

    expect(result.mimeType).toBe("application/json");
    const parsed = JSON.parse(result.content);
    expect(parsed.files).toHaveLength(2);
  });

  it("serializes result to string", async () => {
    const result = await exporter.export([], [], { includeMetadata: false, includeEdges: false });
    expect(typeof exporter.serialize(result)).toBe("string");
  });
});
