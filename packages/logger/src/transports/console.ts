// Console transport - writes to stdout/stderr, colorized in dev, JSON in production

import { LogLevel, type LogEntry, type LogTransport } from '../types.js';
import { PrettyFormatter } from '../formatters/pretty.js';
import { JsonFormatter } from '../formatters/json.js';
import type { LogFormatter } from '../types.js';

export interface ConsoleTransportOptions {
  name?: string;
  minLevel?: LogLevel;
  /** Force a specific mode; defaults to auto-detect via NODE_ENV */
  mode?: 'pretty' | 'json';
  /** Whether to write error/fatal to stderr (default: true) */
  useStderr?: boolean;
  /** Override formatter */
  formatter?: LogFormatter;
}

export class ConsoleTransport implements LogTransport {
  readonly name: string;
  readonly minLevel: LogLevel;
  private readonly useStderr: boolean;
  private readonly formatter: LogFormatter;

  constructor(options: ConsoleTransportOptions = {}) {
    this.name = options.name ?? 'console';
    this.minLevel = options.minLevel ?? LogLevel.Trace;
    this.useStderr = options.useStderr ?? true;

    if (options.formatter) {
      this.formatter = options.formatter;
    } else {
      const mode = options.mode ?? (process.env['NODE_ENV'] === 'production' ? 'json' : 'pretty');
      this.formatter = mode === 'json' ? new JsonFormatter() : new PrettyFormatter(true);
    }
  }

  write(entry: LogEntry, _formatted: string): void {
    // Re-format using our own formatter so console transport is self-contained
    const output = this.formatter.format(entry);

    if (this.useStderr && entry.level >= LogLevel.Error) {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }
}
