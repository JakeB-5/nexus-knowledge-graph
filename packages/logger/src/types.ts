// Core types for the logger package

export enum LogLevel {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
  Fatal = 5,
}

export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.Trace]: 'trace',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
  [LogLevel.Fatal]: 'fatal',
};

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context: Record<string, unknown>;
  error?: Error;
  traceId?: string;
  spanId?: string;
  service?: string;
  version?: string;
}

export interface LogTransport {
  name: string;
  minLevel: LogLevel;
  write(entry: LogEntry, formatted: string): void | Promise<void>;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

export interface LogFormatter {
  format(entry: LogEntry): string;
}

export interface RedactionConfig {
  fields: string[];
  replacement: string;
}

export interface LoggerConfig {
  name: string;
  level: LogLevel;
  transports: LogTransport[];
  formatter: LogFormatter;
  context?: Record<string, unknown>;
  service?: string;
  version?: string;
  redaction?: RedactionConfig;
  /** Whether to propagate log entries to parent logger transports */
  propagate?: boolean;
}
