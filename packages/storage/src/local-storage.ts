/**
 * LocalFileStorageProvider - stores objects on the local filesystem.
 *
 * Key layout:
 *   <baseDir>/<key>          - object data
 *   <baseDir>/<key>.meta.json - object metadata
 *
 * Atomic writes: data is written to a temp file then renamed into place.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  StorageProvider,
  StorageObject,
  ListOptions,
  ListResult,
  PutOptions,
  PutResult,
  StreamOptions,
} from './types.js';

// Companion metadata structure stored alongside data files
interface MetaFile {
  contentType: string;
  size: number;
  lastModified: string; // ISO 8601
  metadata: Record<string, string>;
  visibility: 'public' | 'private';
}

// Derive content type from file extension
function contentTypeFromExtension(key: string): string {
  const ext = path.extname(key).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
  };
  return map[ext] ?? 'application/octet-stream';
}

export class LocalFileStorageProvider implements StorageProvider {
  private readonly baseDir: string;
  private readonly baseUrl: string;

  constructor(baseDir: string, baseUrl = 'file://') {
    this.baseDir = baseDir;
    this.baseUrl = baseUrl;
  }

  // Resolve the filesystem path for a storage key
  private dataPath(key: string): string {
    // Sanitize key: no leading slash, no path traversal
    const safe = key.replace(/^\/+/, '').replace(/\.\.\//g, '');
    return path.join(this.baseDir, safe);
  }

  private metaPath(key: string): string {
    return this.dataPath(key) + '.meta.json';
  }

  // Ensure parent directories exist
  private async ensureDir(filePath: string): Promise<void> {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
  }

  // Read metadata companion file; returns null if missing
  private async readMeta(key: string): Promise<MetaFile | null> {
    try {
      const raw = await fsp.readFile(this.metaPath(key), 'utf8');
      return JSON.parse(raw) as MetaFile;
    } catch {
      return null;
    }
  }

  async put(
    key: string,
    data: Buffer | Uint8Array | string,
    options: PutOptions = {},
  ): Promise<PutResult> {
    const dataFilePath = this.dataPath(key);
    await this.ensureDir(dataFilePath);

    // Convert string to Buffer
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);

    // Atomic write: temp file → rename
    const tmpPath = path.join(
      os.tmpdir(),
      `nexus-storage-${crypto.randomBytes(8).toString('hex')}`,
    );
    await fsp.writeFile(tmpPath, buf);
    await fsp.rename(tmpPath, dataFilePath);

    const contentType = options.contentType ?? contentTypeFromExtension(key);

    const meta: MetaFile = {
      contentType,
      size: buf.length,
      lastModified: new Date().toISOString(),
      metadata: options.metadata ?? {},
      visibility: options.visibility ?? 'private',
    };

    await fsp.writeFile(this.metaPath(key), JSON.stringify(meta, null, 2));

    return { key, size: buf.length, contentType };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fsp.readFile(this.dataPath(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    // Remove data file and companion meta, ignoring missing files
    await Promise.allSettled([
      fsp.unlink(this.dataPath(key)),
      fsp.unlink(this.metaPath(key)),
    ]);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsp.access(this.dataPath(key), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async list(options: ListOptions = {}): Promise<ListResult> {
    const { prefix = '', limit = 100, cursor } = options;

    // Walk directory tree, collecting relative paths
    const all: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
          const relKey = path.relative(this.baseDir, fullPath);
          // Normalize to forward slashes on Windows
          all.push(relKey.replace(/\\/g, '/'));
        }
      }
    };

    await walk(this.baseDir);
    all.sort();

    // Apply prefix filter
    const filtered = prefix ? all.filter((k) => k.startsWith(prefix)) : all;

    // Apply cursor (cursor is the first key to include)
    const startIdx = cursor ? filtered.findIndex((k) => k > cursor) : 0;
    const sliced = filtered.slice(startIdx < 0 ? filtered.length : startIdx, startIdx + limit);

    // Fetch metadata for each key
    const objects: StorageObject[] = await Promise.all(
      sliced.map(async (key) => {
        const meta = await this.readMeta(key);
        let stat: fs.Stats | null = null;
        try {
          stat = await fsp.stat(this.dataPath(key));
        } catch {
          // ignore
        }
        return {
          key,
          size: meta?.size ?? stat?.size ?? 0,
          contentType: meta?.contentType ?? contentTypeFromExtension(key),
          lastModified: meta ? new Date(meta.lastModified) : (stat?.mtime ?? new Date()),
          metadata: meta?.metadata ?? {},
        };
      }),
    );

    const hasMore = startIdx + sliced.length < filtered.length;
    const nextCursor = hasMore ? sliced[sliced.length - 1] : undefined;

    return { objects, hasMore, nextCursor };
  }

  async getUrl(key: string): Promise<string> {
    return `${this.baseUrl.replace(/\/$/, '')}/${key}`;
  }

  /**
   * Read a file as a readable stream with optional byte-range support.
   */
  createReadStream(key: string, options: StreamOptions = {}): fs.ReadStream {
    return fs.createReadStream(this.dataPath(key), {
      start: options.start,
      end: options.end,
    });
  }

  /**
   * Return metadata for a single key, or null if not found.
   */
  async stat(key: string): Promise<StorageObject | null> {
    const meta = await this.readMeta(key);
    if (!meta) return null;
    return {
      key,
      size: meta.size,
      contentType: meta.contentType,
      lastModified: new Date(meta.lastModified),
      metadata: meta.metadata,
    };
  }
}
