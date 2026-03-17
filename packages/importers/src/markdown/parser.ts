import { parse as parseYAML } from "yaml";
import type {
  ParsedMarkdownDocument,
  ParsedSection,
  ParsedLink,
  ParsedCodeBlock,
} from "../types.js";

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/m;
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const EXTERNAL_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
const INTERNAL_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const HASHTAG_RE = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)/g;
const CODE_BLOCK_RE = /```([^\n]*)\n([\s\S]*?)```/g;
const INLINE_CODE_RE = /`[^`]+`/g;

export interface HeadingToken {
  level: number;
  text: string;
  line: number;
}

export interface MarkdownAST {
  frontMatter: Record<string, unknown>;
  headings: HeadingToken[];
  links: ParsedLink[];
  codeBlocks: ParsedCodeBlock[];
  tags: string[];
  title: string;
  bodyContent: string;
  rawContent: string;
}

export class MarkdownParser {
  // Parse a full markdown document into AST representation
  parse(content: string, source?: string): ParsedMarkdownDocument {
    const { frontMatter, body } = this.extractFrontMatter(content);
    const { codeBlocks, stripped } = this.extractCodeBlocks(body);
    const headings = this.extractHeadings(body);
    const links = this.extractLinks(stripped);
    const tags = this.extractTags(stripped, frontMatter);
    const title = this.extractTitle(headings, frontMatter, source);
    const sections = this.buildSectionTree(headings, body);

    return {
      frontMatter,
      title,
      sections,
      links,
      codeBlocks,
      tags,
      rawContent: content,
      source,
    };
  }

  // Extract YAML front matter block from markdown
  extractFrontMatter(content: string): {
    frontMatter: Record<string, unknown>;
    body: string;
  } {
    const match = FRONT_MATTER_RE.exec(content);
    if (!match) {
      return { frontMatter: {}, body: content };
    }

    let frontMatter: Record<string, unknown> = {};
    try {
      const parsed = parseYAML(match[1] ?? "");
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        frontMatter = parsed as Record<string, unknown>;
      }
    } catch {
      // Malformed YAML — treat as empty
    }

    const body = content.slice(match[0].length);
    return { frontMatter, body };
  }

  // Extract all code blocks and return content with placeholders
  extractCodeBlocks(content: string): {
    codeBlocks: ParsedCodeBlock[];
    stripped: string;
  } {
    const codeBlocks: ParsedCodeBlock[] = [];
    let line = 1;
    let stripped = content;
    let match: RegExpExecArray | null;

    // Reset lastIndex
    CODE_BLOCK_RE.lastIndex = 0;

    const contentBeforeBlocks = content;
    stripped = content.replace(CODE_BLOCK_RE, (full, lang: string, code: string, offset: number) => {
      const lineNumber = contentBeforeBlocks.slice(0, offset).split("\n").length;

      // Parse meta from language string (e.g. "ts title=foo.ts")
      const parts = (lang ?? "").trim().split(/\s+/);
      const language = parts[0] ?? "";
      const metaParts = parts.slice(1);
      const metadata: Record<string, unknown> = {};
      for (const part of metaParts) {
        const eqIdx = part.indexOf("=");
        if (eqIdx !== -1) {
          metadata[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
        } else {
          metadata[part] = true;
        }
      }

      codeBlocks.push({ language, content: code.trimEnd(), metadata, line: lineNumber });
      return `[CODE_BLOCK_${codeBlocks.length - 1}]`;
    });

    void line; // suppress unused warning

    return { codeBlocks, stripped };
  }

  // Extract all headings from content
  extractHeadings(content: string): HeadingToken[] {
    const headings: HeadingToken[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const m = /^(#{1,6})\s+(.+)$/.exec(line);
      if (m) {
        headings.push({
          level: (m[1] ?? "").length,
          text: (m[2] ?? "").trim(),
          line: i + 1,
        });
      }
    }

    return headings;
  }

  // Extract all link types: wikilinks, external, internal
  extractLinks(content: string): ParsedLink[] {
    const links: ParsedLink[] = [];
    const lines = content.split("\n");

    // Wikilinks [[Target]] or [[Target|Label]]
    let m: RegExpExecArray | null;
    WIKILINK_RE.lastIndex = 0;
    while ((m = WIKILINK_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split("\n").length;
      links.push({
        type: "wikilink",
        target: (m[1] ?? "").trim(),
        label: m[2]?.trim(),
        line: lineNum,
      });
    }

    // External links [Label](https://...)
    EXTERNAL_LINK_RE.lastIndex = 0;
    while ((m = EXTERNAL_LINK_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split("\n").length;
      links.push({
        type: "external",
        target: m[2] ?? "",
        label: m[1] || undefined,
        line: lineNum,
      });
    }

    // Internal relative links [Label](./path) — exclude external
    INTERNAL_LINK_RE.lastIndex = 0;
    while ((m = INTERNAL_LINK_RE.exec(content)) !== null) {
      const target = m[2] ?? "";
      if (!target.startsWith("http://") && !target.startsWith("https://")) {
        const lineNum = content.slice(0, m.index).split("\n").length;
        links.push({
          type: "internal",
          target,
          label: m[1] || undefined,
          line: lineNum,
        });
      }
    }

    void lines; // suppress

    return links;
  }

  // Extract hashtags and tags from front matter
  extractTags(content: string, frontMatter: Record<string, unknown>): string[] {
    const tags = new Set<string>();

    // From front matter: tags: [a, b] or tags: a, b
    const fmTags = frontMatter["tags"];
    if (Array.isArray(fmTags)) {
      for (const t of fmTags) {
        if (typeof t === "string") tags.add(t.toLowerCase().trim());
      }
    } else if (typeof fmTags === "string") {
      for (const t of fmTags.split(",")) {
        tags.add(t.toLowerCase().trim());
      }
    }

    // From #hashtags in content
    HASHTAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HASHTAG_RE.exec(content)) !== null) {
      const tag = m[1];
      if (tag) tags.add(tag.toLowerCase());
    }

    return Array.from(tags).filter(Boolean);
  }

  // Derive document title from H1, front matter, or source filename
  extractTitle(
    headings: HeadingToken[],
    frontMatter: Record<string, unknown>,
    source?: string,
  ): string {
    // Front matter title takes highest precedence
    if (typeof frontMatter["title"] === "string" && frontMatter["title"].trim()) {
      return frontMatter["title"].trim();
    }

    // First H1 heading
    const h1 = headings.find((h) => h.level === 1);
    if (h1) return h1.text;

    // First heading of any level
    const firstHeading = headings[0];
    if (firstHeading) return firstHeading.text;

    // Derive from filename
    if (source) {
      const base = source.replace(/\\/g, "/").split("/").pop() ?? source;
      return base.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    }

    return "Untitled";
  }

  // Build nested section tree from flat headings list
  buildSectionTree(headings: HeadingToken[], content: string): ParsedSection[] {
    if (headings.length === 0) {
      // Entire document is one section with no heading
      return [
        {
          level: 0,
          heading: "",
          content: this.stripHeadings(content),
          children: [],
          startLine: 1,
        },
      ];
    }

    const lines = content.split("\n");
    const root: ParsedSection[] = [];
    const stack: ParsedSection[] = [];

    for (let hi = 0; hi < headings.length; hi++) {
      const heading = headings[hi];
      if (!heading) continue;

      const nextHeading = headings[hi + 1];
      const startLine = heading.line;
      const endLine = nextHeading ? nextHeading.line - 1 : lines.length;

      const sectionLines = lines.slice(startLine, endLine);
      const sectionContent = sectionLines
        .filter((l) => !/^#{1,6}\s/.test(l))
        .join("\n")
        .trim();

      const section: ParsedSection = {
        level: heading.level,
        heading: heading.text,
        content: sectionContent,
        children: [],
        startLine,
      };

      // Pop stack until we find a parent
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top && top.level < heading.level) break;
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(section);
      } else {
        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(section);
      }

      stack.push(section);
    }

    return root;
  }

  // Strip heading lines from content
  private stripHeadings(content: string): string {
    return content
      .split("\n")
      .filter((l) => !HEADING_RE.test(l))
      .join("\n")
      .trim();
  }

  // Extract plain text from markdown (remove markup)
  extractPlainText(content: string): string {
    return content
      .replace(CODE_BLOCK_RE, "")
      .replace(INLINE_CODE_RE, "")
      .replace(WIKILINK_RE, (_, target: string, label?: string) => label ?? target)
      .replace(EXTERNAL_LINK_RE, (_, label: string) => label)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1") // images
      .replace(/[*_~`#>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Chunk a large document into segments
  chunkDocument(content: string, maxChunkSize = 4000): Array<{ content: string; startOffset: number; endOffset: number }> {
    const chunks: Array<{ content: string; startOffset: number; endOffset: number }> = [];

    if (content.length <= maxChunkSize) {
      chunks.push({ content, startOffset: 0, endOffset: content.length });
      return chunks;
    }

    // Chunk at paragraph boundaries
    const paragraphs = content.split(/\n\n+/);
    let current = "";
    let startOffset = 0;
    let currentOffset = 0;

    for (const para of paragraphs) {
      if (current.length + para.length + 2 > maxChunkSize && current.length > 0) {
        chunks.push({ content: current.trim(), startOffset, endOffset: currentOffset });
        startOffset = currentOffset;
        current = para;
      } else {
        if (current.length > 0) current += "\n\n";
        current += para;
      }
      currentOffset += para.length + 2;
    }

    if (current.trim()) {
      chunks.push({ content: current.trim(), startOffset, endOffset: content.length });
    }

    return chunks;
  }
}
