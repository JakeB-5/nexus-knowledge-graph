import type { Plugin, PluginManifest, PluginContext, PluginHooks } from "../types.js";
import type { Node } from "@nexus/shared";

// ─── URL & Markdown Link Detection ───────────────────────────────────────────

const URL_RE =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/g;

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

export interface ExtractedLink {
  url?: string;
  text: string;
  type: "url" | "markdown" | "wiki";
}

export function extractLinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seenUrls = new Set<string>();

  // Markdown links first (they contain URLs - parse before raw URL scan)
  let match: RegExpExecArray | null;
  MARKDOWN_LINK_RE.lastIndex = 0;
  while ((match = MARKDOWN_LINK_RE.exec(content)) !== null) {
    const text = match[1] ?? "";
    const url = match[2] ?? "";
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      links.push({ url, text, type: "markdown" });
    }
  }

  // Raw URLs not already captured by markdown parsing
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(content)) !== null) {
    const url = match[0] ?? "";
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      links.push({ url, text: url, type: "url" });
    }
  }

  // Wiki-style links [[NodeTitle]] - no URL, reference by title
  WIKI_LINK_RE.lastIndex = 0;
  while ((match = WIKI_LINK_RE.exec(content)) !== null) {
    const text = match[1] ?? "";
    links.push({ text, type: "wiki" });
  }

  return links;
}

// ─── Plugin Implementation ────────────────────────────────────────────────────

const LINK_EXTRACTOR_MANIFEST: PluginManifest = {
  name: "link-extractor",
  version: "0.1.0",
  description:
    "Extracts URLs and wiki-style links from node content and stores them in metadata",
  author: "Nexus",
  permissions: ["node:read", "node:write", "edge:write"],
};

export class LinkExtractorPlugin implements Plugin {
  readonly name = "link-extractor";
  readonly version = "0.1.0";
  readonly manifest = LINK_EXTRACTOR_MANIFEST;

  private ctx: PluginContext | null = null;

  readonly hooks: PluginHooks = {
    afterNodeCreate: async (hookCtx) => {
      const node: Node = hookCtx.data;
      if (!node.content) return;

      const links = extractLinks(node.content);
      if (links.length === 0) return;

      this.ctx?.logger.info(
        `Extracted ${links.length} link(s) from node "${node.title}"`,
        { nodeId: node.id },
      );

      // Emit event so other plugins (e.g., metrics) can react
      this.ctx?.emit("links-extracted", {
        nodeId: node.id,
        links,
      });

      // Store extracted links in node metadata via event
      // (In a real implementation this would call a graph service to create edges)
      const urlLinks = links.filter((l) => l.type !== "wiki" && l.url);
      const wikiLinks = links.filter((l) => l.type === "wiki");

      if (urlLinks.length > 0 || wikiLinks.length > 0) {
        this.ctx?.emit("create-link-edges", {
          sourceNodeId: node.id,
          urlLinks: urlLinks.map((l) => ({ url: l.url!, text: l.text })),
          wikiLinks: wikiLinks.map((l) => l.text),
        });
      }
    },

    afterNodeUpdate: async (hookCtx) => {
      const node: Node = hookCtx.data;
      if (!node.content) return;

      const links = extractLinks(node.content);
      this.ctx?.logger.debug(
        `Re-extracted ${links.length} link(s) from updated node "${node.title}"`,
        { nodeId: node.id },
      );

      this.ctx?.emit("links-re-extracted", {
        nodeId: node.id,
        links,
      });
    },
  };

  init(ctx: PluginContext): void {
    this.ctx = ctx;
    ctx.logger.info("LinkExtractorPlugin initialized");

    // Listen for requests to resolve wiki links to actual nodes
    ctx.on("resolve-wiki-links", (payload) => {
      const { nodeId, titles } = payload as { nodeId: string; titles: string[] };
      ctx.logger.debug(`Resolving ${titles.length} wiki links for node ${nodeId}`);
      // Actual resolution would call a node lookup service
    });
  }

  destroy(ctx: PluginContext): void {
    this.ctx = null;
    ctx.logger.info("LinkExtractorPlugin destroyed");
  }
}

export function createLinkExtractorPlugin(): Plugin {
  return new LinkExtractorPlugin();
}
