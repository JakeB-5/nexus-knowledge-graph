// Pretty formatter - colorized, human-readable terminal output

import { LogLevel, LOG_LEVEL_NAMES, type LogEntry, type LogFormatter } from '../types.js';

// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.Trace]: '\x1b[35m', // magenta
  [LogLevel.Debug]: '\x1b[36m', // cyan
  [LogLevel.Info]: '\x1b[32m',  // green
  [LogLevel.Warn]: '\x1b[33m',  // yellow
  [LogLevel.Error]: '\x1b[31m', // red
  [LogLevel.Fatal]: '\x1b[41m', // red background
};

function colorize(level: LogLevel, text: string): string {
  const color = LEVEL_COLORS[level] ?? '';
  return `${color}${BOLD}${text}${RESET}`;
}

function formatTimestamp(date: Date): string {
  return `${DIM}${date.toISOString()}${RESET}`;
}

function formatContext(ctx: Record<string, unknown>, indent = 2): string {
  if (Object.keys(ctx).length === 0) return '';
  const spaces = ' '.repeat(indent);
  const lines = Object.entries(ctx).map(([k, v]) => {
    const val =
      typeof v === 'object' && v !== null
        ? '\n' + formatContext(v as Record<string, unknown>, indent + 2)
        : String(v);
    return `${spaces}${DIM}${k}${RESET}: ${val}`;
  });
  return '\n' + lines.join('\n');
}

function padLevel(name: string): string {
  return name.toUpperCase().padEnd(5, ' ');
}

export class PrettyFormatter implements LogFormatter {
  private readonly colors: boolean;

  constructor(colors = true) {
    this.colors = colors;
  }

  format(entry: LogEntry): string {
    const levelName = LOG_LEVEL_NAMES[entry.level] ?? 'unknown';
    const paddedLevel = padLevel(levelName);

    const timestamp = formatTimestamp(entry.timestamp);
    const level = this.colors ? colorize(entry.level, paddedLevel) : paddedLevel;
    const message = entry.message;

    const parts: string[] = [`${timestamp} ${level} ${message}`];

    if (entry.traceId) {
      parts.push(`  ${DIM}traceId${RESET}: ${entry.traceId}`);
    }
    if (entry.spanId) {
      parts.push(`  ${DIM}spanId${RESET}: ${entry.spanId}`);
    }

    const ctxStr = formatContext(entry.context);
    if (ctxStr) {
      parts.push(ctxStr);
    }

    if (entry.error) {
      const errColor = this.colors ? '\x1b[31m' : '';
      parts.push(
        `  ${errColor}${entry.error.name}: ${entry.error.message}${RESET}`,
      );
      if (entry.error.stack) {
        const stackLines = entry.error.stack
          .split('\n')
          .slice(1)
          .map((l) => `    ${DIM}${l.trim()}${RESET}`)
          .join('\n');
        parts.push(stackLines);
      }
    }

    return parts.join('\n');
  }
}
