// ─── Relay-style Cursor Encoding ──────────────────────────────────────────────

const CURSOR_PREFIX = "cursor:";

export function encodeCursor(value: string): string {
  return Buffer.from(CURSOR_PREFIX + value, "utf8").toString("base64");
}

export function decodeCursor(cursor: string): string {
  const decoded = Buffer.from(cursor, "base64").toString("utf8");
  if (!decoded.startsWith(CURSOR_PREFIX)) {
    throw new Error(`Invalid cursor: "${cursor}"`);
  }
  return decoded.slice(CURSOR_PREFIX.length);
}
