import { NexusError, ErrorCode } from "@nexus/shared";
import { db as getDb, listNodes, getNodeById } from "@nexus/db";
import { FullTextSearchEngine } from "@nexus/search";
import type { SearchResult } from "@nexus/shared";
import { normalizeLimit } from "../utils/pagination.js";
import { LRUCache } from "../utils/lru-cache.js";

// ── Types ──────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof getDb>;
type NodeRecord = NonNullable<Awaited<ReturnType<typeof getNodeById>>>;

export interface SearchOptions {
  nodeTypes?: string[];
  limit?: number;
  offset?: number;
  userId?: string;
}

export interface SearchResponse {
  items: SearchResult<NodeRecord>[];
  total: number;
  suggestions?: string[];
  took: number; // ms
}

// ── Query history ──────────────────────────────────────────────────────────

interface QueryHistoryEntry {
  query: string;
  timestamp: number;
  userId?: string;
  resultCount: number;
}

const queryHistory: QueryHistoryEntry[] = [];
const MAX_HISTORY = 1000;

function recordQuery(entry: QueryHistoryEntry): void {
  if (queryHistory.length >= MAX_HISTORY) queryHistory.shift();
  queryHistory.push(entry);
}

// ── Result cache ───────────────────────────────────────────────────────────

interface CachedSearchResult {
  hits: SearchResult<NodeRecord>[];
  total: number;
}

const resultCache = new LRUCache<string, CachedSearchResult>({
  maxSize: 200,
  defaultTtlMs: 2 * 60_000,
});

// ── In-memory search index ─────────────────────────────────────────────────

const textEngine = new FullTextSearchEngine();
let indexLoaded = false;

async function ensureIndexLoaded(db: Db): Promise<void> {
  if (indexLoaded) return;

  // Page through all nodes and add them to the in-memory index
  let page = 1;
  const pageSize = 500;
  let hasMore = true;

  while (hasMore) {
    const result = await listNodes(db, { page, limit: pageSize });
    for (const node of result.items) {
      textEngine.add({
        id: node.id,
        title: node.title,
        content: node.content ?? "",
        type: node.type,
      });
    }
    hasMore = result.items.length === pageSize;
    page++;
    if (page > 20) break; // safety cap at 10 000 nodes
  }

  indexLoaded = true;
}

// ── SearchService ──────────────────────────────────────────────────────────

export class SearchService {
  private readonly db: Db;

  constructor() {
    this.db = getDb();
  }

  // ── Main search ──

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const start = Date.now();

    if (!query || query.trim().length === 0) {
      throw NexusError.validation("Search query must not be empty");
    }
    if (query.length > 500) {
      throw new NexusError(
        ErrorCode.SEARCH_QUERY_TOO_LONG,
        "Search query must not exceed 500 characters",
        400,
      );
    }

    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    const cacheKey = this.buildCacheKey(query, options);
    const cached = resultCache.get(cacheKey);
    if (cached) {
      return {
        items: cached.hits,
        total: cached.total,
        suggestions: this.buildSuggestions(query),
        took: Date.now() - start,
      };
    }

    // Warm index if needed
    await ensureIndexLoaded(this.db);

    // Full-text search via in-memory engine
    const hits = textEngine.search(query, {
      limit: limit + offset + 10,
      types: options.nodeTypes,
      minScore: 0.01,
    });

    if (hits.length === 0) {
      recordQuery({ query, timestamp: Date.now(), userId: options.userId, resultCount: 0 });
      return { items: [], total: 0, suggestions: this.buildSuggestions(query), took: Date.now() - start };
    }

    const pagedHits = hits.slice(offset, offset + limit);

    // Fetch full node records
    const nodeRecords = await Promise.all(
      pagedHits.map((h) => getNodeById(this.db, h.id)),
    );

    const results: SearchResult<NodeRecord>[] = pagedHits
      .map((hit, i) => {
        const node = nodeRecords[i];
        if (!node) return null;
        if (options.nodeTypes?.length && !options.nodeTypes.includes(node.type)) return null;
        return {
          item: node,
          score: hit.score,
          highlights: hit.highlights,
        };
      })
      .filter((r): r is SearchResult<NodeRecord> => r !== null);

    // Sort by score descending
    results.sort((a, b) => b.score - a.score || b.item.updatedAt.getTime() - a.item.updatedAt.getTime());

    const response: CachedSearchResult = { hits: results, total: hits.length };
    resultCache.set(cacheKey, response);
    recordQuery({ query, timestamp: Date.now(), userId: options.userId, resultCount: results.length });

    return {
      items: results,
      total: hits.length,
      suggestions: this.buildSuggestions(query),
      took: Date.now() - start,
    };
  }

  // ── DB fallback search ──

  async dbSearch(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const start = Date.now();
    const limit = normalizeLimit(options.limit ?? 20);
    const offset = options.offset ?? 0;
    const page = Math.floor(offset / limit) + 1;

    const result = await listNodes(this.db, {
      search: query,
      type: options.nodeTypes?.[0],
      limit,
      page,
    });

    const results: SearchResult<NodeRecord>[] = result.items.map((node) => ({
      item: node as NodeRecord,
      score: 1,
      highlights: [node.title],
    }));

    return { items: results, total: result.total, took: Date.now() - start };
  }

  // ── Index management ──

  indexNode(node: NodeRecord): void {
    textEngine.add({
      id: node.id,
      title: node.title,
      content: node.content ?? "",
      type: node.type,
    });
    resultCache.clear();
  }

  removeFromIndex(nodeId: string): void {
    textEngine.remove(nodeId);
    resultCache.clear();
  }

  async reloadIndex(): Promise<void> {
    textEngine.clear();
    indexLoaded = false;
    await ensureIndexLoaded(this.db);
  }

  // ── Query suggestions ──

  buildSuggestions(query: string, maxSuggestions = 5): string[] {
    const lower = query.toLowerCase();
    const recentUnique = [...new Set(
      queryHistory
        .filter((h) => h.query.toLowerCase().startsWith(lower) && h.query !== query && h.resultCount > 0)
        .map((h) => h.query)
        .reverse(),
    )];
    return recentUnique.slice(0, maxSuggestions);
  }

  // ── Analytics ──

  getQueryAnalytics(): {
    totalQueries: number;
    topQueries: Array<{ query: string; count: number }>;
    averageResults: number;
    zeroResultQueries: string[];
  } {
    const counts = new Map<string, number>();
    let totalResults = 0;
    const zeroResult = new Set<string>();

    for (const entry of queryHistory) {
      counts.set(entry.query, (counts.get(entry.query) ?? 0) + 1);
      totalResults += entry.resultCount;
      if (entry.resultCount === 0) zeroResult.add(entry.query);
    }

    const topQueries = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    return {
      totalQueries: queryHistory.length,
      topQueries,
      averageResults: queryHistory.length > 0 ? totalResults / queryHistory.length : 0,
      zeroResultQueries: [...zeroResult].slice(0, 20),
    };
  }

  // ── Helpers ──

  private buildCacheKey(query: string, options: SearchOptions): string {
    return `${query}:${options.nodeTypes?.join(",") ?? ""}:${options.limit ?? 20}:${options.offset ?? 0}`;
  }
}
