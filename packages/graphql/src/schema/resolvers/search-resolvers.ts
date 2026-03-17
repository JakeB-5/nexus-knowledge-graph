import { ilike, or, eq, and, sql } from "drizzle-orm";
import { nodes } from "@nexus/db";
import { NexusError, MAX_SEARCH_QUERY_LENGTH } from "@nexus/shared";
import type { GraphQLContext } from "../../context.js";
import type { DbNode } from "../../dataloaders.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchInput {
  query: string;
  nodeTypes?: string[];
  limit?: number;
  offset?: number;
  semantic?: boolean;
}

interface SearchResultItem {
  node: DbNode;
  score: number;
  highlights: string[];
}

// ─── Highlight Extractor ──────────────────────────────────────────────────────

function extractHighlights(text: string, query: string, maxCount = 3): string[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const highlights: string[] = [];
  const lowerText = text.toLowerCase();

  for (const term of terms) {
    const idx = lowerText.indexOf(term);
    if (idx === -1) continue;

    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + term.length + 40);
    const snippet = text.slice(start, end).trim();
    highlights.push(start > 0 ? `...${snippet}` : snippet);

    if (highlights.length >= maxCount) break;
  }

  return highlights;
}

// ─── Score Calculator ─────────────────────────────────────────────────────────

function calculateScore(node: DbNode, queryTerms: string[]): number {
  let score = 0;
  const titleLower = node.title.toLowerCase();
  const contentLower = (node.content ?? "").toLowerCase();

  for (const term of queryTerms) {
    // Title matches are worth more
    if (titleLower === term) score += 10;
    else if (titleLower.startsWith(term)) score += 7;
    else if (titleLower.includes(term)) score += 5;

    // Content matches
    const contentOccurrences = contentLower.split(term).length - 1;
    score += contentOccurrences * 1;
  }

  // Recency boost: newer nodes score slightly higher
  const ageMs = Date.now() - node.updatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  score += Math.max(0, 2 - ageDays / 30);

  return Math.round(score * 100) / 100;
}

// ─── Query Resolvers ──────────────────────────────────────────────────────────

export const searchQueryResolvers = {
  search: async (
    _: unknown,
    args: { input: SearchInput },
    ctx: GraphQLContext,
  ) => {
    const { input } = args;
    const startTime = Date.now();

    if (input.query.length > MAX_SEARCH_QUERY_LENGTH) {
      throw NexusError.validation(
        `Search query exceeds maximum length of ${MAX_SEARCH_QUERY_LENGTH}`,
      );
    }

    const limit = Math.min(input.limit ?? 20, 100);
    const offset = input.offset ?? 0;
    const queryTerms = input.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    // Build search conditions
    const textConditions = queryTerms.map((term) =>
      or(
        ilike(nodes.title, `%${term}%`),
        ilike(nodes.content, `%${term}%`),
      ),
    );

    const typeConditions =
      input.nodeTypes && input.nodeTypes.length > 0
        ? [
            or(
              ...input.nodeTypes.map((t) => eq(nodes.type, t as any)),
            ),
          ]
        : [];

    const allConditions = [...textConditions, ...typeConditions].filter(
      (c): c is NonNullable<typeof c> => c !== undefined,
    );

    const where =
      allConditions.length > 0 ? and(...allConditions) : undefined;

    const rows = await ctx.db
      .select()
      .from(nodes)
      .where(where)
      .limit(limit + offset)
      .offset(offset);

    // Score and sort results
    const results: SearchResultItem[] = rows
      .map((row) => {
        const node = row as DbNode;
        const score = calculateScore(node, queryTerms);
        const highlights = extractHighlights(
          `${node.title} ${node.content ?? ""}`,
          input.query,
        );
        return { node, score, highlights };
      })
      .sort((a, b) => b.score - a.score);

    return {
      results,
      total: results.length,
      query: input.query,
      took: Date.now() - startTime,
    };
  },

  suggest: async (
    _: unknown,
    args: { prefix: string; limit?: number },
    ctx: GraphQLContext,
  ) => {
    if (!args.prefix || args.prefix.length < 1) return [];

    const limit = Math.min(args.limit ?? 10, 20);

    const rows = await ctx.db
      .select({
        id: nodes.id,
        title: nodes.title,
        type: nodes.type,
      })
      .from(nodes)
      .where(ilike(nodes.title, `${args.prefix}%`))
      .limit(limit);

    return rows.map((row) => ({
      text: row.title,
      nodeId: row.id,
      type: row.type,
    }));
  },
};
