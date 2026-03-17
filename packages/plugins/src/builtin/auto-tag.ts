import type { Plugin, PluginManifest, PluginContext, PluginHooks } from "../types.js";
import type { CreateNode } from "@nexus/shared";

// ─── Keyword Extraction ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "shall", "should", "may", "might", "must", "can", "could", "not", "no",
  "so", "if", "as", "this", "that", "it", "its", "i", "you", "he", "she",
  "we", "they", "my", "your", "his", "her", "our", "their",
]);

interface AutoTagConfig {
  /** Minimum word frequency to be considered a tag candidate */
  minFrequency?: number;
  /** Maximum number of tags to apply */
  maxTags?: number;
  /** Minimum word length to be considered */
  minWordLength?: number;
  /** Custom rules: pattern -> tag */
  rules?: Array<{ pattern: RegExp; tag: string }>;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function extractKeywords(text: string, config: Required<AutoTagConfig>): string[] {
  const tokens = tokenize(text);
  const freq = new Map<string, number>();

  for (const token of tokens) {
    if (
      token.length < config.minWordLength ||
      STOP_WORDS.has(token) ||
      /^\d+$/.test(token)
    ) {
      continue;
    }
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  return Array.from(freq.entries())
    .filter(([, count]) => count >= config.minFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, config.maxTags)
    .map(([word]) => word);
}

function applyRules(
  text: string,
  rules: Array<{ pattern: RegExp; tag: string }>,
): string[] {
  const tags: string[] = [];
  for (const { pattern, tag } of rules) {
    if (pattern.test(text)) {
      tags.push(tag);
    }
  }
  return tags;
}

// ─── Plugin Implementation ────────────────────────────────────────────────────

const AUTO_TAG_MANIFEST: PluginManifest = {
  name: "auto-tag",
  version: "0.1.0",
  description: "Automatically extracts and applies tags to nodes based on content analysis",
  author: "Nexus",
  permissions: ["node:read", "node:write"],
};

export class AutoTagPlugin implements Plugin {
  readonly name = "auto-tag";
  readonly version = "0.1.0";
  readonly manifest = AUTO_TAG_MANIFEST;

  private config: Required<AutoTagConfig> = {
    minFrequency: 2,
    maxTags: 5,
    minWordLength: 4,
    rules: [
      { pattern: /\b(todo|task|action item)\b/i, tag: "todo" },
      { pattern: /\b(meeting|agenda|minutes)\b/i, tag: "meeting" },
      { pattern: /\b(question|how|why|what)\b/i, tag: "question" },
      { pattern: /\b(idea|proposal|suggestion)\b/i, tag: "idea" },
      { pattern: /\bhttps?:\/\//i, tag: "has-links" },
    ],
  };

  private ctx: PluginContext | null = null;

  readonly hooks: PluginHooks = {
    beforeNodeCreate: async (hookCtx) => {
      const data: CreateNode = hookCtx.data;
      if (!data.title && !data.content) return;

      const text = `${data.title} ${data.content ?? ""}`;
      const keywords = extractKeywords(text, this.config);
      const ruleBasedTags = applyRules(text, this.config.rules);

      const allTags = [...new Set([...keywords, ...ruleBasedTags])].slice(
        0,
        this.config.maxTags,
      );

      if (allTags.length === 0) return;

      const existingMetadata =
        (data.metadata as Record<string, unknown>) ?? {};
      const existingTags = Array.isArray(existingMetadata["tags"])
        ? (existingMetadata["tags"] as string[])
        : [];

      const mergedTags = [...new Set([...existingTags, ...allTags])];

      this.ctx?.logger.debug(`Auto-tagging node "${data.title}" with tags: ${mergedTags.join(", ")}`);

      return {
        ...data,
        metadata: {
          ...existingMetadata,
          tags: mergedTags,
          autoTaggedAt: new Date().toISOString(),
        },
      };
    },
  };

  init(ctx: PluginContext): void {
    this.ctx = ctx;

    // Merge config from context
    if (ctx.config["minFrequency"] !== undefined) {
      this.config.minFrequency = ctx.config["minFrequency"] as number;
    }
    if (ctx.config["maxTags"] !== undefined) {
      this.config.maxTags = ctx.config["maxTags"] as number;
    }
    if (ctx.config["minWordLength"] !== undefined) {
      this.config.minWordLength = ctx.config["minWordLength"] as number;
    }

    ctx.logger.info("AutoTagPlugin initialized", {
      minFrequency: this.config.minFrequency,
      maxTags: this.config.maxTags,
    });
  }

  destroy(ctx: PluginContext): void {
    this.ctx = null;
    ctx.logger.info("AutoTagPlugin destroyed");
  }
}

export function createAutoTagPlugin(config?: AutoTagConfig): Plugin {
  const plugin = new AutoTagPlugin();
  if (config) {
    Object.assign(plugin["config"], config);
  }
  return plugin;
}
