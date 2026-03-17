import type { CreateNode } from "@nexus/shared";
import type { NodeType } from "@nexus/shared";

// ─── Text Cleaning ──────────────────────────────────────────────────────────

// Strip all HTML tags from a string
export function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Normalize whitespace: collapse runs of spaces/tabs, trim
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Strip markdown markup from text
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")   // code blocks
    .replace(/`[^`]+`/g, "")          // inline code
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1") // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // links
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t: string, l?: string) => l ?? t) // wikilinks
    .replace(/^#{1,6}\s+/gm, "")      // headings
    .replace(/[*_~]+/g, "")           // emphasis
    .replace(/^>\s+/gm, "")           // blockquotes
    .replace(/^[-*+]\s+/gm, "")       // lists
    .replace(/^\d+\.\s+/gm, "")       // ordered lists
    .trim();
}

// Clean text for use as node title: strip markup, normalize, truncate
export function cleanTitle(raw: string, maxLength = 500): string {
  return normalizeWhitespace(stripHtml(stripMarkdown(raw))).slice(0, maxLength);
}

// Clean text for use as node content
export function cleanContent(raw: string, maxLength = 100_000): string {
  return normalizeWhitespace(stripHtml(raw)).slice(0, maxLength);
}

// ─── Title Extraction ───────────────────────────────────────────────────────

// Heuristically extract a title from an arbitrary object
export function extractTitle(obj: Record<string, unknown>): string | null {
  for (const key of ["title", "name", "label", "heading", "subject", "displayName", "@name"]) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) {
      return cleanTitle(val);
    }
  }
  return null;
}

// Extract a title from plain text (first non-empty line)
export function extractTitleFromText(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] ?? "Untitled";
  // Limit to 100 chars for title
  return cleanTitle(firstLine, 100);
}

// ─── Node Type Detection ────────────────────────────────────────────────────

// Heuristically determine NodeType from raw type string, title, and content
export function detectNodeType(
  rawType: string,
  title: string,
  content: string,
): NodeType {
  const normalized = rawType.toLowerCase().trim().replace(/\s+/g, "_");

  // Direct type match
  const directMap: Record<string, NodeType> = {
    document: "document",
    doc: "document",
    concept: "concept",
    idea: "concept",
    term: "concept",
    tag: "tag",
    label: "tag",
    person: "person",
    people: "person",
    human: "person",
    individual: "person",
    author: "person",
    user: "person",
    organization: "organization",
    org: "organization",
    company: "organization",
    institution: "organization",
    team: "organization",
    event: "event",
    meeting: "event",
    conference: "event",
    location: "location",
    place: "location",
    city: "location",
    country: "location",
    address: "location",
    resource: "resource",
    link: "resource",
    url: "resource",
    file: "resource",
    image: "resource",
    video: "resource",
    audio: "resource",
  };

  if (normalized in directMap) return directMap[normalized]!;

  // Heuristic from title/content
  return detectNodeTypeFromText(title, content);
}

// Heuristic type detection from text signals
export function detectNodeTypeFromText(title: string, content: string): NodeType {
  const combined = `${title} ${content}`.toLowerCase();

  // Person signals
  if (/\b(dr\.|mr\.|ms\.|mrs\.|prof\.|phd|born|died|biography|person|author)\b/.test(combined)) {
    return "person";
  }

  // Organization signals
  if (/\b(inc\.|ltd\.|llc|corp\.|company|organization|founded|headquarters|ceo|employees)\b/.test(combined)) {
    return "organization";
  }

  // Event signals
  if (/\b(conference|summit|meeting|workshop|event|ceremony|festival|scheduled|agenda)\b/.test(combined)) {
    return "event";
  }

  // Location signals
  if (/\b(city|country|state|province|street|address|latitude|longitude|region|district)\b/.test(combined)) {
    return "location";
  }

  // Resource signals
  if (/\b(https?:\/\/|\.pdf|\.mp4|\.jpg|\.png|\.docx|download|file|attachment)\b/.test(combined)) {
    return "resource";
  }

  // Tag signals (short titles, no real content)
  if (title.length < 30 && !content.trim()) {
    return "tag";
  }

  // Long content suggests document
  if (content.length > 500) return "document";

  // Default
  return "concept";
}

// ─── Metadata Normalization ─────────────────────────────────────────────────

// Normalize metadata values: stringify arrays, parse dates, etc.
export function normalizeMetadata(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;

      // Try to parse ISO dates
      if (/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/.test(trimmed)) {
        const d = new Date(trimmed);
        result[key] = isNaN(d.getTime()) ? trimmed : d.toISOString();
      } else {
        result[key] = trimmed;
      }
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.filter((v) => v !== null && v !== undefined).map((v) =>
        typeof v === "string" ? v.trim() : v,
      );
    } else if (typeof value === "object") {
      result[key] = normalizeMetadata(value as Record<string, unknown>);
    }
  }

  return result;
}

// ─── Content Hash ───────────────────────────────────────────────────────────

// Simple FNV-1a 32-bit hash for content deduplication
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// Normalize text for comparison: lowercase, collapse whitespace, strip punctuation
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Node Validation ────────────────────────────────────────────────────────

// Validate and sanitize a CreateNode, returning cleaned version
export function sanitizeNode(node: CreateNode): CreateNode {
  return {
    ...node,
    title: cleanTitle(node.title),
    content: node.content ? cleanContent(node.content) : undefined,
    metadata: normalizeMetadata(node.metadata as Record<string, unknown>),
  };
}

// Check if a node has the minimum required fields
export function isValidNode(node: Partial<CreateNode>): node is CreateNode {
  return (
    typeof node.title === "string" &&
    node.title.trim().length > 0 &&
    typeof node.ownerId === "string" &&
    node.ownerId.trim().length > 0 &&
    node.type !== undefined
  );
}
