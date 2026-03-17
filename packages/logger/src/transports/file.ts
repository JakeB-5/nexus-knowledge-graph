// File transport - async buffered writes with log rotation by size or date

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LogLevel, type LogEntry, type LogTransport } from '../types.js';

export type RotationMode = 'size' | 'date' | 'none';

export interface FileTransportOptions {
  name?: string;
  minLevel?: LogLevel;
  /** Absolute path to the log file */
  filePath: string;
  /** Rotation mode (default: 'size') */
  rotation?: RotationMode;
  /** Max file size in bytes before rotation (default: 10 MB) */
  maxSize?: number;
  /** Max number of rotated files to keep (default: 5) */
  maxFiles?: number;
  /** Buffer flush interval in ms (default: 1000) */
  flushInterval?: number;
  /** Max buffer size in bytes before forced flush (default: 64 KB) */
  maxBuffer?: number;
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_FILES = 5;
const DEFAULT_FLUSH_INTERVAL = 1000;
const DEFAULT_MAX_BUFFER = 64 * 1024; // 64 KB

export class FileTransport implements LogTransport {
  readonly name: string;
  readonly minLevel: LogLevel;

  private readonly filePath: string;
  private readonly rotation: RotationMode;
  private readonly maxSize: number;
  private readonly maxFiles: number;
  private readonly maxBuffer: number;

  private buffer: string[] = [];
  private bufferSize = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private currentDate: string;
  private closed = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: FileTransportOptions) {
    this.name = options.name ?? 'file';
    this.minLevel = options.minLevel ?? LogLevel.Info;
    this.filePath = options.filePath;
    this.rotation = options.rotation ?? 'size';
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    this.maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
    this.currentDate = this.getDateString();

    // Ensure directory exists
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    // Start periodic flush
    const interval = options.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, interval);
    // Allow process to exit without waiting on this timer
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  write(_entry: LogEntry, formatted: string): void {
    if (this.closed) return;
    const line = formatted + '\n';
    this.buffer.push(line);
    this.bufferSize += line.length;

    if (this.bufferSize >= this.maxBuffer) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const lines = this.buffer.splice(0);
    this.bufferSize = 0;
    const chunk = lines.join('');

    // Serialize writes via queue
    this.writeQueue = this.writeQueue.then(() => this.writeChunk(chunk));
    await this.writeQueue;
  }

  private async writeChunk(chunk: string): Promise<void> {
    // Check rotation before writing
    await this.maybeRotate();
    await fs.promises.appendFile(this.filePath, chunk, 'utf8');
  }

  private async maybeRotate(): Promise<void> {
    if (this.rotation === 'none') return;

    if (this.rotation === 'date') {
      const today = this.getDateString();
      if (today !== this.currentDate) {
        this.currentDate = today;
        await this.rotate();
      }
      return;
    }

    // Size-based rotation
    try {
      const stat = await fs.promises.stat(this.filePath);
      if (stat.size >= this.maxSize) {
        await this.rotate();
      }
    } catch {
      // File may not exist yet; ignore
    }
  }

  private async rotate(): Promise<void> {
    const dir = path.dirname(this.filePath);
    const base = path.basename(this.filePath);

    // Shift existing rotated files
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const from = path.join(dir, `${base}.${i}`);
      const to = path.join(dir, `${base}.${i + 1}`);
      try {
        await fs.promises.rename(from, to);
      } catch {
        // File may not exist
      }
    }

    // Rename current to .1
    try {
      await fs.promises.rename(this.filePath, path.join(dir, `${base}.1`));
    } catch {
      // File may not exist
    }

    // Delete oldest if over limit
    const oldest = path.join(dir, `${base}.${this.maxFiles + 1}`);
    try {
      await fs.promises.unlink(oldest);
    } catch {
      // Not present
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private getDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
