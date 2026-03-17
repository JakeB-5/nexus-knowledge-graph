import type { CreateNode } from "@nexus/shared";
import { contentHash, normalizeForComparison } from "./transforms.js";

export type MergeStrategy = "keep_newest" | "keep_oldest" | "merge_metadata";
export type DeduplicationStrategy = "exact_title" | "fuzzy_title" | "content_hash" | "combined";

export interface DeduplicationOptions {
  strategy: DeduplicationStrategy;
  mergeStrategy: MergeStrategy;
  fuzzyThreshold?: number; // 0-1, default 0.85
  caseSensitive?: boolean;
}

export interface DeduplicationResult {
  unique: CreateNode[];
  duplicates: Array<{ original: CreateNode; duplicate: CreateNode; reason: string }>;
  mergedCount: number;
}

// ─── Levenshtein Distance ────────────────────────────────────────────────────

// Compute Levenshtein edit distance between two strings
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two-row DP for memory efficiency
  const maxLen = Math.max(a.length, b.length);
  // Early exit if strings are too different
  if (Math.abs(a.length - b.length) > maxLen * 0.5) {
    return Math.abs(a.length - b.length);
  }

  const prev = new Uint16Array(b.length + 1);
  const curr = new Uint16Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,          // insertion
        (prev[j] ?? 0) + 1,              // deletion
        (prev[j - 1] ?? 0) + cost,       // substitution
      );
    }
    prev.set(curr);
  }

  return prev[b.length] ?? 0;
}

// Compute normalized similarity score (0-1, 1 = identical)
export function similarity(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

// ─── Deduplication Engine ────────────────────────────────────────────────────

export class Deduplicator {
  private options: DeduplicationOptions;

  constructor(options: Partial<DeduplicationOptions> = {}) {
    this.options = {
      strategy: options.strategy ?? "combined",
      mergeStrategy: options.mergeStrategy ?? "merge_metadata",
      fuzzyThreshold: options.fuzzyThreshold ?? 0.85,
      caseSensitive: options.caseSensitive ?? false,
    };
  }

  deduplicate(nodes: CreateNode[]): DeduplicationResult {
    switch (this.options.strategy) {
      case "exact_title":
        return this.deduplicateByExactTitle(nodes);
      case "fuzzy_title":
        return this.deduplicateByFuzzyTitle(nodes);
      case "content_hash":
        return this.deduplicateByContentHash(nodes);
      case "combined":
        return this.deduplicateCombined(nodes);
    }
  }

  // Exact title match deduplication
  private deduplicateByExactTitle(nodes: CreateNode[]): DeduplicationResult {
    const seen = new Map<string, CreateNode>();
    const unique: CreateNode[] = [];
    const duplicates: DeduplicationResult["duplicates"] = [];

    for (const node of nodes) {
      const key = this.normalizeKey(node.title);
      const existing = seen.get(key);

      if (existing) {
        duplicates.push({ original: existing, duplicate: node, reason: "exact_title_match" });
        const merged = this.merge(existing, node);
        seen.set(key, merged);
        // Update in unique array
        const idx = unique.indexOf(existing);
        if (idx !== -1) unique[idx] = merged;
      } else {
        seen.set(key, node);
        unique.push(node);
      }
    }

    return { unique, duplicates, mergedCount: duplicates.length };
  }

  // Fuzzy title matching using Levenshtein similarity
  private deduplicateByFuzzyTitle(nodes: CreateNode[]): DeduplicationResult {
    const unique: CreateNode[] = [];
    const duplicates: DeduplicationResult["duplicates"] = [];
    const threshold = this.options.fuzzyThreshold ?? 0.85;

    for (const node of nodes) {
      const normTitle = this.normalizeKey(node.title);
      let matched = false;

      for (let i = 0; i < unique.length; i++) {
        const existing = unique[i];
        if (!existing) continue;
        const existingNorm = this.normalizeKey(existing.title);
        const sim = similarity(normTitle, existingNorm);

        if (sim >= threshold) {
          duplicates.push({
            original: existing,
            duplicate: node,
            reason: `fuzzy_title_match(${sim.toFixed(2)})`,
          });
          unique[i] = this.merge(existing, node);
          matched = true;
          break;
        }
      }

      if (!matched) {
        unique.push(node);
      }
    }

    return { unique, duplicates, mergedCount: duplicates.length };
  }

  // Content hash deduplication
  private deduplicateByContentHash(nodes: CreateNode[]): DeduplicationResult {
    const seen = new Map<string, CreateNode>();
    const unique: CreateNode[] = [];
    const duplicates: DeduplicationResult["duplicates"] = [];

    for (const node of nodes) {
      const hashKey = contentHash(
        normalizeForComparison(`${node.title} ${node.content ?? ""}`),
      );
      const existing = seen.get(hashKey);

      if (existing) {
        duplicates.push({ original: existing, duplicate: node, reason: "content_hash_match" });
        const merged = this.merge(existing, node);
        seen.set(hashKey, merged);
        const idx = unique.indexOf(existing);
        if (idx !== -1) unique[idx] = merged;
      } else {
        seen.set(hashKey, node);
        unique.push(node);
      }
    }

    return { unique, duplicates, mergedCount: duplicates.length };
  }

  // Combined strategy: first exact title, then content hash, then fuzzy
  private deduplicateCombined(nodes: CreateNode[]): DeduplicationResult {
    // Pass 1: exact title
    const pass1 = this.deduplicateByExactTitle(nodes);

    // Pass 2: content hash on the already-deduped set
    const pass2 = this.deduplicateByContentHash(pass1.unique);

    // Pass 3: fuzzy title (only on remaining)
    const pass3 = this.deduplicateByFuzzyTitle(pass2.unique);

    return {
      unique: pass3.unique,
      duplicates: [...pass1.duplicates, ...pass2.duplicates, ...pass3.duplicates],
      mergedCount: pass1.mergedCount + pass2.mergedCount + pass3.mergedCount,
    };
  }

  // Merge two nodes according to the configured merge strategy
  merge(original: CreateNode, duplicate: CreateNode): CreateNode {
    switch (this.options.mergeStrategy) {
      case "keep_oldest":
        return this.mergeMetadata(original, duplicate);
      case "keep_newest":
        return this.mergeMetadata(duplicate, original);
      case "merge_metadata":
      default:
        return this.mergeMetadata(original, duplicate);
    }
  }

  // Deep merge: keep base node, union metadata from both
  private mergeMetadata(base: CreateNode, other: CreateNode): CreateNode {
    const baseMeta = base.metadata as Record<string, unknown>;
    const otherMeta = other.metadata as Record<string, unknown>;

    const mergedMeta: Record<string, unknown> = { ...otherMeta, ...baseMeta };

    // Merge tags arrays
    const baseTags = Array.isArray(baseMeta["tags"]) ? baseMeta["tags"] as string[] : [];
    const otherTags = Array.isArray(otherMeta["tags"]) ? otherMeta["tags"] as string[] : [];
    if (baseTags.length > 0 || otherTags.length > 0) {
      mergedMeta["tags"] = Array.from(new Set([...baseTags, ...otherTags]));
    }

    // Prefer longer content
    const content = selectLonger(base.content, other.content);

    return {
      ...base,
      content,
      metadata: mergedMeta,
    };
  }

  private normalizeKey(title: string): string {
    const norm = normalizeForComparison(title);
    return this.options.caseSensitive ? norm : norm.toLowerCase();
  }
}

function selectLonger(a: string | undefined, b: string | undefined): string | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

// ─── Convenience Helpers ─────────────────────────────────────────────────────

// Deduplicate a node list with default combined strategy
export function deduplicateNodes(
  nodes: CreateNode[],
  options?: Partial<DeduplicationOptions>,
): DeduplicationResult {
  return new Deduplicator(options).deduplicate(nodes);
}

// Check if two nodes are likely duplicates
export function areDuplicates(
  a: CreateNode,
  b: CreateNode,
  threshold = 0.85,
): boolean {
  if (normalizeForComparison(a.title) === normalizeForComparison(b.title)) return true;
  if (similarity(normalizeForComparison(a.title), normalizeForComparison(b.title)) >= threshold) return true;

  if (a.content && b.content) {
    const hashA = contentHash(normalizeForComparison(a.content));
    const hashB = contentHash(normalizeForComparison(b.content));
    if (hashA === hashB) return true;
  }

  return false;
}
