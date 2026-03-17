/**
 * Formatters for audit entries - human-readable, JSON, CSV, and timeline views
 */

import type { AuditEntry } from "./types.js";
import { AuditLogger } from "./audit-logger.js";

// Group entries by date string
export interface TimelineGroup {
  date: string; // YYYY-MM-DD
  entries: AuditEntry[];
}

/** Format a single entry as a human-readable string */
export function formatEntryHuman(entry: AuditEntry): string {
  const timestamp = entry.timestamp.toISOString().replace("T", " ").slice(0, 19);
  const description = AuditLogger.describeAction(entry);
  const parts = [`[${timestamp}]`, description];

  if (entry.ip) parts.push(`from ${entry.ip}`);
  if (entry.requestId) parts.push(`(req:${entry.requestId})`);

  return parts.join(" ");
}

/** Format a list of entries as human-readable lines */
export function formatEntriesHuman(entries: AuditEntry[]): string {
  return entries.map(formatEntryHuman).join("\n");
}

/** Format a single entry as JSON-serializable object */
export function formatEntryJson(entry: AuditEntry): Record<string, unknown> {
  return {
    id: entry.id,
    action: entry.action,
    actor: {
      id: entry.actor.id,
      type: entry.actor.type,
      name: entry.actor.name,
      email: entry.actor.email,
    },
    resource: {
      type: entry.resource.type,
      id: entry.resource.id,
      name: entry.resource.name,
    },
    timestamp: entry.timestamp.toISOString(),
    outcome: entry.outcome,
    errorMessage: entry.errorMessage,
    metadata: entry.metadata,
    ip: entry.ip,
    userAgent: entry.userAgent,
    requestId: entry.requestId,
    sessionId: entry.sessionId,
    diff: entry.diff,
  };
}

/** Format a list of entries as a JSON string */
export function formatEntriesJson(entries: AuditEntry[], pretty = false): string {
  const data = entries.map(formatEntryJson);
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

/** CSV column headers */
const CSV_HEADERS = [
  "id",
  "timestamp",
  "action",
  "outcome",
  "actorId",
  "actorType",
  "actorName",
  "actorEmail",
  "resourceType",
  "resourceId",
  "resourceName",
  "ip",
  "userAgent",
  "requestId",
  "sessionId",
  "errorMessage",
  "hasDiff",
];

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function entryToCsvRow(entry: AuditEntry): string {
  const fields = [
    entry.id,
    entry.timestamp.toISOString(),
    entry.action,
    entry.outcome,
    entry.actor.id,
    entry.actor.type,
    entry.actor.name ?? "",
    entry.actor.email ?? "",
    entry.resource.type,
    entry.resource.id,
    entry.resource.name ?? "",
    entry.ip ?? "",
    entry.userAgent ?? "",
    entry.requestId ?? "",
    entry.sessionId ?? "",
    entry.errorMessage ?? "",
    entry.diff && entry.diff.length > 0 ? "true" : "false",
  ];

  return fields.map((f) => escapeCsvField(String(f))).join(",");
}

/** Format entries as a CSV string */
export function formatEntriesCsv(entries: AuditEntry[]): string {
  const header = CSV_HEADERS.join(",");
  const rows = entries.map(entryToCsvRow);
  return [header, ...rows].join("\n");
}

/** Group entries by calendar date */
export function groupByDate(entries: AuditEntry[]): TimelineGroup[] {
  const groups = new Map<string, AuditEntry[]>();

  for (const entry of entries) {
    const day = entry.timestamp.toISOString().slice(0, 10);
    const group = groups.get(day);
    if (group) {
      group.push(entry);
    } else {
      groups.set(day, [entry]);
    }
  }

  // Sort groups by date descending
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, groupEntries]) => ({
      date,
      entries: groupEntries.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      ),
    }));
}

/** Format entries as a timeline string grouped by date */
export function formatTimeline(entries: AuditEntry[]): string {
  const groups = groupByDate(entries);
  const lines: string[] = [];

  for (const group of groups) {
    lines.push(`=== ${group.date} ===`);
    for (const entry of group.entries) {
      const time = entry.timestamp.toISOString().slice(11, 19);
      const desc = AuditLogger.describeAction(entry);
      lines.push(`  ${time}  ${desc}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
