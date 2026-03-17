/**
 * Cursor-based pagination utilities.
 * Cursors are base64-encoded JSON containing { id, createdAt }.
 */

export interface CursorPayload {
  id: string;
  createdAt: string; // ISO 8601
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  pageInfo: PageInfo;
  totalCount?: number;
}

export interface CursorPageParams {
  after?: string;  // cursor: return items after this
  before?: string; // cursor: return items before this
  first?: number;  // fetch N items from the front
  last?: number;   // fetch N items from the back
}

// ── Encoding / Decoding ────────────────────────────────────────────────────

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf-8").toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)["id"] !== "string" ||
      typeof (parsed as Record<string, unknown>)["createdAt"] !== "string"
    ) {
      throw new Error("Invalid cursor structure");
    }
    return parsed as CursorPayload;
  } catch {
    throw new Error(`Invalid cursor: ${cursor}`);
  }
}

export function encodeCursorFromRow(row: { id: string; createdAt: Date | string }): string {
  return encodeCursor({
    id: row.id,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  });
}

// ── Page Info Construction ─────────────────────────────────────────────────

/**
 * Build PageInfo from a fetched items array.
 * Pass `requested` = the limit you asked for, and `items` = what you got.
 * If items.length > requested, there is a next page (trim the extra item before returning).
 */
export function buildPageInfo<T extends { id: string; createdAt: Date | string }>(
  items: T[],
  requested: number,
  hasPrev: boolean = false,
): { pageInfo: PageInfo; items: T[] } {
  const hasNextPage = items.length > requested;
  if (hasNextPage) items = items.slice(0, requested);

  const startCursor = items.length > 0 ? encodeCursorFromRow(items[0]!) : null;
  const endCursor = items.length > 0 ? encodeCursorFromRow(items[items.length - 1]!) : null;

  return {
    items,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: hasPrev,
      startCursor,
      endCursor,
    },
  };
}

// ── Offset ↔ Cursor conversion ─────────────────────────────────────────────

/**
 * Convert a simple offset+limit query into cursor params.
 * Useful when migrating from offset pagination.
 * NOTE: This is a lossy approximation – id and createdAt are synthetic.
 */
export function offsetToCursorParams(
  offset: number,
  limit: number,
): { first: number; skip: number } {
  return { first: limit, skip: offset };
}

// ── SQL helper ─────────────────────────────────────────────────────────────

/**
 * Return WHERE clause components for cursor pagination over (createdAt, id).
 * Use with Drizzle `and(...)`.
 */
export function cursorWhereClause(afterCursor?: string): { afterId: string; afterCreatedAt: Date } | null {
  if (!afterCursor) return null;
  const { id, createdAt } = decodeCursor(afterCursor);
  return { afterId: id, afterCreatedAt: new Date(createdAt) };
}

// ── Normalise limit ────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function normalizeLimit(limit: unknown): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}
