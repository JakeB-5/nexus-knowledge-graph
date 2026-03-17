import { randomUUID } from "crypto";
import type { CreateNode, CreateEdge } from "@nexus/shared";
import type {
  Importer,
  ImportOptions,
  ImportResult,
  ParsedHTMLDocument,
  ValidationResult,
} from "../types.js";
import { HTMLParser } from "./parser.js";
import { detectNodeType } from "../transforms.js";

export class HTMLImporter implements Importer<ParsedHTMLDocument> {
  readonly name = "html";
  readonly supportedExtensions = [".html", ".htm", ".xhtml"];

  private parser = new HTMLParser();

  async parse(content: string, source?: string): Promise<ParsedHTMLDocument> {
    return this.parser.parse(content, source);
  }

  validate(parsed: ParsedHTMLDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!parsed.textContent.trim()) {
      errors.push("HTML document has no extractable text content");
    }

    if (!parsed.title || parsed.title === "Untitled") {
      warnings.push("HTML document has no title");
    }

    if (parsed.links.length > 1000) {
      warnings.push(`Document has ${parsed.links.length} links — only first 1000 will create edges`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async import(parsed: ParsedHTMLDocument, options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();
    const nodes: CreateNode[] = [];
    const edges: CreateEdge[] = [];

    const { ownerId } = options;

    // Build the primary page node
    const pageNodeId = randomUUID();
    const og = parsed.source ? {} : {};

    const type = detectNodeType(
      parsed.metaTags["og:type"] ?? parsed.metaTags["type"] ?? "",
      parsed.title,
      parsed.textContent,
    );

    const tags = this.extractTagsFromMeta(parsed.metaTags);

    nodes.push({
      type,
      title: parsed.title,
      content: parsed.textContent.slice(0, 100_000),
      metadata: {
        url: parsed.source,
        metaTags: parsed.metaTags,
        tags,
        headingCount: parsed.headings.length,
        linkCount: parsed.links.length,
        imageCount: parsed.images.length,
        ...og,
      },
      ownerId,
    });

    // Create section concept nodes from headings
    const headingNodeIds: string[] = [];
    for (let i = 0; i < parsed.headings.length; i++) {
      const heading = parsed.headings[i];
      if (!heading || heading.level > 3) continue; // only H1-H3

      const headingId = randomUUID();
      headingNodeIds.push(headingId);

      nodes.push({
        type: "concept",
        title: heading.text.slice(0, 500),
        content: undefined,
        metadata: {
          headingLevel: heading.level,
          source: parsed.source,
          position: i,
        },
        ownerId,
      });

      edges.push({
        type: "contains",
        sourceId: pageNodeId,
        targetId: headingId,
        weight: 1 - (heading.level - 1) * 0.1,
        metadata: { headingLevel: heading.level },
      });
    }

    // Create resource nodes for external links
    const maxLinks = Math.min(parsed.links.length, 1000);
    const seenHrefs = new Set<string>();

    for (let i = 0; i < maxLinks; i++) {
      const link = parsed.links[i];
      if (!link) continue;

      if (seenHrefs.has(link.href)) continue;
      seenHrefs.add(link.href);

      if (link.isExternal) {
        const resourceId = randomUUID();
        nodes.push({
          type: "resource",
          title: link.text.slice(0, 500) || link.href,
          content: undefined,
          metadata: {
            url: link.href,
            linkType: "external",
            sourceUrl: parsed.source,
          },
          ownerId,
        });

        edges.push({
          type: "references",
          sourceId: pageNodeId,
          targetId: resourceId,
          weight: 0.7,
          metadata: { href: link.href, linkText: link.text },
        });
      } else {
        // Internal link — create a reference edge (target may not exist yet)
        const internalId = randomUUID();
        nodes.push({
          type: "document",
          title: link.text.slice(0, 500) || link.href,
          content: undefined,
          metadata: {
            url: link.href,
            linkType: "internal",
            placeholder: true,
            sourceUrl: parsed.source,
          },
          ownerId,
        });

        edges.push({
          type: "references",
          sourceId: pageNodeId,
          targetId: internalId,
          weight: 0.9,
          metadata: { href: link.href, linkText: link.text, internal: true },
        });
      }
    }

    // Create resource nodes for images
    for (const image of parsed.images.slice(0, 100)) {
      const imageId = randomUUID();
      nodes.push({
        type: "resource",
        title: image.alt ?? image.title ?? image.src.split("/").pop() ?? "Image",
        content: undefined,
        metadata: {
          url: image.src,
          alt: image.alt,
          title: image.title,
          resourceType: "image",
        },
        ownerId,
      });

      edges.push({
        type: "contains",
        sourceId: pageNodeId,
        targetId: imageId,
        weight: 0.5,
        metadata: { resourceType: "image" },
      });
    }

    options.onProgress?.({
      phase: "importing",
      current: nodes.length,
      total: nodes.length,
      percentage: 100,
      message: `Imported HTML page: ${parsed.title}`,
    });

    return {
      nodes,
      edges,
      warnings: [],
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

  private extractTagsFromMeta(metaTags: Record<string, string>): string[] {
    const tags: string[] = [];

    const keywordsRaw = metaTags["keywords"] ?? metaTags["article:tag"] ?? "";
    if (keywordsRaw) {
      tags.push(...keywordsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean));
    }

    const section = metaTags["article:section"];
    if (section) tags.push(section.toLowerCase());

    return Array.from(new Set(tags));
  }
}
