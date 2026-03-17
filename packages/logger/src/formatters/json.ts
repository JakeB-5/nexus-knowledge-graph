// JSON formatter - produces machine-readable log lines

import { type LogEntry, LOG_LEVEL_NAMES } from '../types.js';
import type { LogFormatter } from '../types.js';

interface JsonLogLine {
  timestamp: string;
  level: string;
  levelCode: number;
  message: string;
  service?: string;
  version?: string;
  traceId?: string;
  spanId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

export class JsonFormatter implements LogFormatter {
  private readonly pretty: boolean;

  constructor(pretty = false) {
    this.pretty = pretty;
  }

  format(entry: LogEntry): string {
    const line: JsonLogLine = {
      timestamp: entry.timestamp.toISOString(),
      level: LOG_LEVEL_NAMES[entry.level] ?? 'unknown',
      levelCode: entry.level,
      message: entry.message,
      ...entry.context,
    };

    if (entry.service !== undefined) line['service'] = entry.service;
    if (entry.version !== undefined) line['version'] = entry.version;
    if (entry.traceId !== undefined) line['traceId'] = entry.traceId;
    if (entry.spanId !== undefined) line['spanId'] = entry.spanId;

    if (entry.error) {
      line['error'] = {
        name: entry.error.name,
        message: entry.error.message,
        stack: entry.error.stack,
      };
    }

    return this.pretty ? JSON.stringify(line, null, 2) : JSON.stringify(line);
  }
}
