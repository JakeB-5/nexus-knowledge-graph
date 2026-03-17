import { stringify as stringifyYAML } from "yaml";
import type { CreateNode, CreateEdge } from "@nexus/shared";
import type { Exporter, ExportOptions, ExportResult } from "../types.js";

export interface MarkdownExportOptions extends ExportOptions {
  vaultMode?: boolean; // export each node as separate file
  wikilinkStyle?: boolean; // use [[links]] vs [links](url)
  includeCodeBlocks?: boolean;
  frontMatterFields?: string[]; // which metadata fields to include in front matter
}

export class MarkdownExporter implements Exporter<CreateNode, CreateEdge> {
  readonly name = "markdown";
  readonly defaultExtension = ".md";

  export(
    nodes: CreateNode[],
    edges: CreateEdge[],
    options: ExportOptions,
  ): Promise<ExportResult> {
    const mdOptions = options as MarkdownExportOptions;

    if (mdOptions.vaultMode) {
      return Promise.resolve(this.exportVault(nodes, edges, mdOptions));
    }

    return Promise.resolve(this.exportSingleFile(nodes, edges, mdOptions));
  }

  serialize(result: ExportResult): string {
    return result.content;
  }

  // Export all nodes into a single concatenated markdown file
  private exportSingleFile(
    nodes: CreateNode[],
    edges: CreateEdge[],
    options: MarkdownExportOptions,
  ): ExportResult {
    const parts: string[] = [];

    // Build adjacency map for edges
    const edgeMap = this.buildEdgeMap(edges);

    for (const node of nodes) {
      parts.push(this.renderNode(node, edgeMap, nodes, options));
      parts.push("\n---\n");
    }

    const content = parts.join("\n");
    return {
      content,
      mimeType: "text/markdown",
      encoding: "utf-8",
    };
  }

  // Export each node as a separate file entry (returns zip-like manifest)
  private exportVault(
    nodes: CreateNode[],
    edges: CreateEdge[],
    options: MarkdownExportOptions,
  ): ExportResult {
    const edgeMap = this.buildEdgeMap(edges);
    const files: Array<{ filename: string; content: string }> = [];

    for (const node of nodes) {
      const content = this.renderNode(node, edgeMap, nodes, options);
      const filename = this.sanitizeFilename(node.title) + ".md";
      files.push({ filename, content });
    }

    // Serialize as a JSON manifest of files
    const manifest = {
      format: "nexus-vault-v1",
      exportedAt: new Date().toISOString(),
      totalFiles: files.length,
      files,
    };

    return {
      content: JSON.stringify(manifest, null, options.pretty ? 2 : 0),
      filename: "vault-export.json",
      mimeType: "application/json",
      encoding: "utf-8",
    };
  }

  // Render a single node as markdown
  private renderNode(
    node: CreateNode,
    edgeMap: Map<string, CreateEdge[]>,
    allNodes: CreateNode[],
    options: MarkdownExportOptions,
  ): string {
    const sections: string[] = [];

    // Front matter
    if (options.includeMetadata) {
      const frontMatter = this.buildFrontMatter(node, options);
      if (Object.keys(frontMatter).length > 0) {
        sections.push(`---\n${stringifyYAML(frontMatter).trim()}\n---\n`);
      }
    }

    // Title
    sections.push(`# ${node.title}\n`);

    // Content body
    if (node.content) {
      sections.push(node.content + "\n");
    }

    // Edges as links section
    if (options.includeEdges) {
      const outEdges = edgeMap.get("out") ?? [];
      const nodeEdges = outEdges.filter((e) => e.sourceId === node.title);
      const relevantEdges = this.getNodeEdges(node, edges => edges, edgeMap, allNodes);

      if (relevantEdges.length > 0) {
        sections.push("\n## Related\n");
        for (const { edge, targetNode } of relevantEdges) {
          if (!targetNode) continue;
          const link = options.wikilinkStyle
            ? `[[${targetNode.title}]]`
            : `[${targetNode.title}](${this.sanitizeFilename(targetNode.title)}.md)`;
          sections.push(`- **${this.formatEdgeType(edge.type)}**: ${link}`);
        }
        sections.push("");
      }

      void nodeEdges; // suppress warning
    }

    return sections.join("\n");
  }

  // Build front matter object from node metadata
  private buildFrontMatter(
    node: CreateNode,
    options: MarkdownExportOptions,
  ): Record<string, unknown> {
    const fm: Record<string, unknown> = {};

    fm["type"] = node.type;
    fm["ownerId"] = node.ownerId;

    const allowedFields = options.frontMatterFields;
    const meta = node.metadata as Record<string, unknown>;

    if (allowedFields) {
      for (const field of allowedFields) {
        if (meta[field] !== undefined) {
          fm[field] = meta[field];
        }
      }
    } else {
      // Include all metadata except internal fields
      for (const [key, value] of Object.entries(meta)) {
        if (!["placeholder", "wikilinkTarget"].includes(key)) {
          fm[key] = value;
        }
      }
    }

    // Tags as array
    const tags = meta["tags"];
    if (Array.isArray(tags) && tags.length > 0) {
      fm["tags"] = tags;
    }

    return fm;
  }

  // Get edges originating from a node with resolved target nodes
  private getNodeEdges(
    node: CreateNode,
    _edgesFilter: (e: CreateEdge[]) => CreateEdge[],
    edgeMap: Map<string, CreateEdge[]>,
    allNodes: CreateNode[],
  ): Array<{ edge: CreateEdge; targetNode: CreateNode | undefined }> {
    const titleIndex = new Map(allNodes.map((n) => [n.title, n]));
    const sourceEdges = edgeMap.get(node.title) ?? [];

    return sourceEdges.map((edge) => ({
      edge,
      targetNode: titleIndex.get(edge.targetId) ?? allNodes.find((n) => n.ownerId === edge.targetId),
    }));
  }

  // Build a map from source title → edges
  private buildEdgeMap(edges: CreateEdge[]): Map<string, CreateEdge[]> {
    const map = new Map<string, CreateEdge[]>();
    for (const edge of edges) {
      const list = map.get(edge.sourceId) ?? [];
      list.push(edge);
      map.set(edge.sourceId, list);
    }
    return map;
  }

  // Format edge type to human-readable string
  private formatEdgeType(type: string): string {
    return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Sanitize a title for use as a filename
  private sanitizeFilename(title: string): string {
    return title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 100);
  }

  // Export a set of nodes as an Obsidian-compatible vault structure
  exportObsidianVault(
    nodes: CreateNode[],
    edges: CreateEdge[],
  ): Array<{ path: string; content: string }> {
    const edgeMap = this.buildEdgeMap(edges);
    const files: Array<{ path: string; content: string }> = [];

    for (const node of nodes) {
      const content = this.renderNode(node, edgeMap, nodes, {
        includeMetadata: true,
        includeEdges: true,
        wikilinkStyle: true,
        format: "obsidian",
        pretty: false,
        encoding: "utf-8",
      });
      const path = `vault/${node.type}/${this.sanitizeFilename(node.title)}.md`;
      files.push({ path, content });
    }

    return files;
  }
}
