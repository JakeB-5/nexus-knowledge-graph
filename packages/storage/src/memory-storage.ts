/**
 * InMemoryStorageProvider - stores objects in memory.
 * Intended for testing and development environments.
 */

import {
  StorageProvider,
  StorageObject,
  ListOptions,
  ListResult,
  PutOptions,
  PutResult,
} from './types.js';

interface MemoryEntry {
  data: Buffer;
  contentType: string;
  metadata: Record<string, string>;
  visibility: 'public' | 'private';
  lastModified: Date;
}

export class InMemoryStorageProvider implements StorageProvider {
  private readonly store = new Map<string, MemoryEntry>();
  private readonly maxSizeBytes: number;
  private currentSizeBytes = 0;

  /**
   * @param maxSizeBytes - optional total size limit in bytes (default: 100 MB)
   */
  constructor(maxSizeBytes = 100 * 1024 * 1024) {
    this.maxSizeBytes = maxSizeBytes;
  }

  private contentTypeFromKey(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      json: 'application/json',
      txt: 'text/plain',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      pdf: 'application/pdf',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  async put(
    key: string,
    data: Buffer | Uint8Array | string,
    options: PutOptions = {},
  ): Promise<PutResult> {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);

    // Enforce size limit
    const existing = this.store.get(key);
    const existingSize = existing?.data.length ?? 0;
    const newTotal = this.currentSizeBytes - existingSize + buf.length;
    if (newTotal > this.maxSizeBytes) {
      throw new Error(
        `InMemoryStorageProvider: size limit exceeded (${newTotal} > ${this.maxSizeBytes})`,
      );
    }

    const contentType = options.contentType ?? this.contentTypeFromKey(key);

    this.store.set(key, {
      data: buf,
      contentType,
      metadata: options.metadata ?? {},
      visibility: options.visibility ?? 'private',
      lastModified: new Date(),
    });

    this.currentSizeBytes = newTotal;

    return { key, size: buf.length, contentType };
  }

  async get(key: string): Promise<Buffer | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    // Return a copy so callers cannot mutate internal state
    return Buffer.from(entry.data);
  }

  async delete(key: string): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.data.length;
      this.store.delete(key);
    }
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async list(options: ListOptions = {}): Promise<ListResult> {
    const { prefix = '', limit = 100, cursor } = options;

    let keys = Array.from(this.store.keys()).sort();

    if (prefix) {
      keys = keys.filter((k) => k.startsWith(prefix));
    }

    // Cursor is the last key seen; resume after it
    const startIdx = cursor ? keys.findIndex((k) => k > cursor) : 0;
    const start = startIdx < 0 ? keys.length : startIdx;
    const sliced = keys.slice(start, start + limit);

    const objects: StorageObject[] = sliced.map((key) => {
      const entry = this.store.get(key)!;
      return {
        key,
        size: entry.data.length,
        contentType: entry.contentType,
        lastModified: entry.lastModified,
        metadata: { ...entry.metadata },
      };
    });

    const hasMore = start + sliced.length < keys.length;
    const nextCursor = hasMore ? sliced[sliced.length - 1] : undefined;

    return { objects, hasMore, nextCursor };
  }

  async getUrl(key: string): Promise<string> {
    return `memory://${key}`;
  }

  /** Return current total bytes stored. */
  get totalSize(): number {
    return this.currentSizeBytes;
  }

  /** Return number of objects stored. */
  get count(): number {
    return this.store.size;
  }

  /** Clear all stored objects. */
  clear(): void {
    this.store.clear();
    this.currentSizeBytes = 0;
  }

  /** Return stat info for a single key. */
  stat(key: string): StorageObject | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    return {
      key,
      size: entry.data.length,
      contentType: entry.contentType,
      lastModified: entry.lastModified,
      metadata: { ...entry.metadata },
    };
  }
}
