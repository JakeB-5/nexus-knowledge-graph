import { randomUUID } from "crypto";
import type { CreateNode, CreateEdge } from "@nexus/shared";
import type {
  Importer,
  ImportOptions,
  ImportResult,
  ImportWarning,
  ParsedMarkdownDocument,
  ParsedSection,
  ValidationResult,
} from "../types.js";
import { MarkdownParser } from "./parser.js";

export interface VaultImportOptions extends ImportOptions {
  files: Array<{ path: string; content: string }>;
  resolveWikilinks?: boolean;
}

export class MarkdownImporter implements Importer<ParsedMarkdownDocument> {
  readonly name = "markdown";
  readonly supportedExtensions = [".md", ".markdown", ".mdx"];

  private parser = new MarkdownParser();

  async parse(content: string, source?: string): Promise<ParsedMarkdownDocument> {
    return this.parser.parse(content, source);
  }

  validate(parsed: ParsedMarkdownDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!parsed.title || parsed.title === "Untitled") {
      warnings.push("Document has no title — using 'Untitled'");
    }

    if (!parsed.rawContent.trim()) {
      errors.push("Document content is empty");
    }

    if (parsed.rawContent.length > 100_000) {
      warnings.push(`Document is very large (${parsed.rawContent.length} chars); consider chunking`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async import(parsed: ParsedMarkdownDocument, options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();
    const nodes: CreateNode[] = [];
    const edges: CreateEdge[] = [];
    const warnings: ImportWarning[] = [];

    const { ownerId, tags: extraTags = [] } = options;

    // Build root document node
    const rootNodeId = randomUUID();
    const allTags = Array.from(new Set([...parsed.tags, ...extraTags]));

    const rootNode: CreateNode = {
      type: "document",
      title: parsed.title,
      content: this.parser.extractPlainText(parsed.rawContent).slice(0, 100_000),
      metadata: {
        ...parsed.frontMatter,
        tags: allTags,
        source: parsed.source,
        links: parsed.links.length,
        codeBlocks: parsed.codeBlocks.length,
      },
      ownerId,
    };
    nodes.push(rootNode);

    // Create tag nodes and edges
    for (const tag of allTags) {
      const tagNodeId = randomUUID();
      nodes.push({
        type: "tag",
        title: tag,
        content: undefined,
        metadata: { source: parsed.source },
        ownerId,
      });
      edges.push({
        type: "tagged_with",
        sourceId: rootNodeId,
        targetId: tagNodeId,
        weight: 1,
        metadata: {},
      });
    }

    // Create section nodes for H2+ sections
    const sectionNodeIds = new Map<string, string>();
    this.processSections(parsed.sections, rootNodeId, nodes, edges, ownerId, sectionNodeIds, options);

    // Create wikilink edges
    const wikilinkEdges = this.processWikilinks(parsed, rootNodeId, nodes, options);
    edges.push(...wikilinkEdges);

    // Create external link resource nodes
    for (const link of parsed.links) {
      if (link.type === "external") {
        const resourceId = randomUUID();
        nodes.push({
          type: "resource",
          title: link.label ?? link.target,
          content: undefined,
          metadata: {
            url: link.target,
            linkType: "external",
          },
          ownerId,
        });
        edges.push({
          type: "references",
          sourceId: rootNodeId,
          targetId: resourceId,
          weight: 0.8,
          metadata: { url: link.target, line: link.line },
        });
      }
    }

    // Code block nodes
    if (parsed.codeBlocks.length > 0) {
      for (const block of parsed.codeBlocks) {
        if (block.content.trim().length > 20) {
          const codeNodeId = randomUUID();
          nodes.push({
            type: "concept",
            title: `Code: ${block.language || "unknown"}`,
            content: block.content.slice(0, 10_000),
            metadata: {
              language: block.language,
              codeBlock: true,
              ...block.metadata,
              parentSource: parsed.source,
            },
            ownerId,
          });
          edges.push({
            type: "contains",
            sourceId: rootNodeId,
            targetId: codeNodeId,
            weight: 1,
            metadata: { line: block.line },
          });
        }
      }
    }

    options.onProgress?.({
      phase: "importing",
      current: nodes.length,
      total: nodes.length,
      percentage: 100,
      message: `Imported ${nodes.length} nodes from markdown`,
    });

    return {
      nodes,
      edges,
      warnings,
      errors: [],
      stats: {
        totalProcessed: 1,
        nodesCreated: nodes.length,
        edgesCreated: edges.length,
        duplicatesSkipped: 0,
        errorsEncountered: 0,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Import an Obsidian-style vault: multiple markdown files linked together
  async importVault(vaultOptions: VaultImportOptions): Promise<ImportResult> {
    const startTime = Date.now();
    const allNodes: CreateNode[] = [];
    const allEdges: CreateEdge[] = [];
    const allWarnings: ImportWarning[] = [];

    const { files, onProgress, resolveWikilinks = true } = vaultOptions;

    // First pass: parse all files
    const parsed: Array<{ doc: ParsedMarkdownDocument; path: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      try {
        const doc = await this.parse(file.content, file.path);
        parsed.push({ doc, path: file.path });
      } catch (e) {
        allWarnings.push({
          message: `Failed to parse ${file.path}: ${String(e)}`,
          source: file.path,
        });
      }

      onProgress?.({
        phase: "parsing",
        current: i + 1,
        total: files.length,
        percentage: Math.round(((i + 1) / files.length) * 100),
        message: `Parsed ${file.path}`,
      });
    }

    // Build title → nodeId map for wikilink resolution
    const titleToNodeId = new Map<string, string>();

    // Second pass: import each document
    const seenTitles = new Set<string>();
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item) continue;

      if (vaultOptions.skipDuplicates && seenTitles.has(item.doc.title.toLowerCase())) {
        allWarnings.push({
          message: `Skipping duplicate: ${item.doc.title}`,
          source: item.path,
        });
        continue;
      }
      seenTitles.add(item.doc.title.toLowerCase());

      const result = await this.import(item.doc, vaultOptions);
      const rootNode = result.nodes[0];
      if (rootNode) {
        const nodeId = randomUUID();
        titleToNodeId.set(item.doc.title.toLowerCase(), nodeId);
        titleToNodeId.set(item.path.toLowerCase(), nodeId);
      }

      allNodes.push(...result.nodes);
      allEdges.push(...result.edges);
      allWarnings.push(...result.warnings);

      onProgress?.({
        phase: "importing",
        current: i + 1,
        total: parsed.length,
        percentage: Math.round(((i + 1) / parsed.length) * 100),
        message: `Imported ${item.doc.title}`,
      });
    }

    // Third pass: resolve cross-document wikilinks if requested
    if (resolveWikilinks) {
      for (const item of parsed) {
        const srcId = titleToNodeId.get(item.doc.title.toLowerCase());
        if (!srcId) continue;

        for (const link of item.doc.links) {
          if (link.type === "wikilink") {
            const targetId = titleToNodeId.get(link.target.toLowerCase());
            if (targetId && targetId !== srcId) {
              allEdges.push({
                type: "references",
                sourceId: srcId,
                targetId,
                weight: 0.9,
                metadata: { wikilinkLabel: link.label, resolved: true },
              });
            }
          }
        }
      }
    }

    return {
      nodes: allNodes,
      edges: allEdges,
      warnings: allWarnings,
      errors: [],
      stats: {
        totalProcessed: files.length,
        nodesCreated: allNodes.length,
        edgesCreated: allEdges.length,
        duplicatesSkipped: files.length - parsed.length,
        errorsEncountered: allWarnings.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Process sections recursively, creating child nodes for H2+
  private processSections(
    sections: ParsedSection[],
    parentId: string,
    nodes: CreateNode[],
    edges: CreateEdge[],
    ownerId: string,
    sectionNodeIds: Map<string, string>,
    _options: ImportOptions,
  ): void {
    for (const section of sections) {
      // Skip empty or root sections
      if (section.level < 2 || !section.heading) continue;

      const sectionId = randomUUID();
      sectionNodeIds.set(section.heading.toLowerCase(), sectionId);

      nodes.push({
        type: "concept",
        title: section.heading,
        content: section.content.slice(0, 10_000) || undefined,
        metadata: {
          sectionLevel: section.level,
          startLine: section.startLine,
        },
        ownerId,
      });

      edges.push({
        type: "contains",
        sourceId: parentId,
        targetId: sectionId,
        weight: 1,
        metadata: { sectionLevel: section.level },
      });

      if (section.children.length > 0) {
        this.processSections(
          section.children,
          sectionId,
          nodes,
          edges,
          ownerId,
          sectionNodeIds,
          _options,
        );
      }
    }
  }

  // Build wikilink edges (unresolved — will point to placeholder nodes)
  private processWikilinks(
    parsed: ParsedMarkdownDocument,
    rootNodeId: string,
    nodes: CreateNode[],
    options: ImportOptions,
  ): CreateEdge[] {
    const edges: CreateEdge[] = [];
    const wikilinkTargets = new Map<string, string>();

    for (const link of parsed.links) {
      if (link.type !== "wikilink") continue;

      let targetId = wikilinkTargets.get(link.target.toLowerCase());
      if (!targetId) {
        targetId = randomUUID();
        wikilinkTargets.set(link.target.toLowerCase(), targetId);
        // Create a placeholder concept node for the wikilink target
        nodes.push({
          type: "concept",
          title: link.label ?? link.target,
          content: undefined,
          metadata: {
            wikilinkTarget: link.target,
            placeholder: true,
            source: parsed.source,
          },
          ownerId: options.ownerId,
        });
      }

      edges.push({
        type: "references",
        sourceId: rootNodeId,
        targetId,
        weight: 0.9,
        metadata: { wikilinkLabel: link.label, line: link.line },
      });
    }

    return edges;
  }
}
