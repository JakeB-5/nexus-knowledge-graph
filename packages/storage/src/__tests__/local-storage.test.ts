/**
 * Tests for LocalFileStorageProvider.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { LocalFileStorageProvider } from '../local-storage.js';

function tmpDir(): string {
  return path.join(os.tmpdir(), `nexus-storage-test-${crypto.randomBytes(6).toString('hex')}`);
}

describe('LocalFileStorageProvider', () => {
  let baseDir: string;
  let provider: LocalFileStorageProvider;

  beforeEach(async () => {
    baseDir = tmpDir();
    await fsp.mkdir(baseDir, { recursive: true });
    provider = new LocalFileStorageProvider(baseDir, 'http://localhost/files');
  });

  afterEach(async () => {
    await fsp.rm(baseDir, { recursive: true, force: true });
  });

  describe('put and get', () => {
    it('stores and retrieves a Buffer', async () => {
      const data = Buffer.from('hello world');
      await provider.put('test/hello.txt', data, { contentType: 'text/plain' });
      const result = await provider.get('test/hello.txt');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('hello world');
    });

    it('stores and retrieves a string', async () => {
      await provider.put('docs/readme.txt', 'some content');
      const result = await provider.get('docs/readme.txt');
      expect(result!.toString()).toBe('some content');
    });

    it('returns null for non-existent key', async () => {
      const result = await provider.get('nonexistent/file.txt');
      expect(result).toBeNull();
    });

    it('returns PutResult with correct metadata', async () => {
      const data = Buffer.from('abc');
      const result = await provider.put('file.json', data, { contentType: 'application/json' });
      expect(result.key).toBe('file.json');
      expect(result.size).toBe(3);
      expect(result.contentType).toBe('application/json');
    });

    it('infers content type from extension when not provided', async () => {
      await provider.put('image.png', Buffer.from('fake-png'));
      const meta = await provider.stat('image.png');
      expect(meta?.contentType).toBe('image/png');
    });

    it('stores custom metadata', async () => {
      await provider.put('file.txt', 'data', { metadata: { author: 'alice' } });
      const meta = await provider.stat('file.txt');
      expect(meta?.metadata).toEqual({ author: 'alice' });
    });
  });

  describe('exists', () => {
    it('returns true for existing key', async () => {
      await provider.put('exists.txt', 'x');
      expect(await provider.exists('exists.txt')).toBe(true);
    });

    it('returns false for missing key', async () => {
      expect(await provider.exists('missing.txt')).toBe(false);
    });
  });

  describe('delete', () => {
    it('removes file and metadata', async () => {
      await provider.put('del.txt', 'bye');
      await provider.delete('del.txt');
      expect(await provider.exists('del.txt')).toBe(false);
    });

    it('does not throw when deleting non-existent key', async () => {
      await expect(provider.delete('ghost.txt')).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await provider.put('a/file1.txt', 'f1');
      await provider.put('a/file2.txt', 'f2');
      await provider.put('b/file3.txt', 'f3');
    });

    it('lists all objects without prefix', async () => {
      const result = await provider.list();
      const keys = result.objects.map((o) => o.key);
      expect(keys).toContain('a/file1.txt');
      expect(keys).toContain('a/file2.txt');
      expect(keys).toContain('b/file3.txt');
    });

    it('filters by prefix', async () => {
      const result = await provider.list({ prefix: 'a/' });
      expect(result.objects.map((o) => o.key)).toEqual(['a/file1.txt', 'a/file2.txt']);
    });

    it('respects limit', async () => {
      const result = await provider.list({ limit: 1 });
      expect(result.objects.length).toBe(1);
      expect(result.hasMore).toBe(true);
    });

    it('supports cursor-based pagination', async () => {
      const page1 = await provider.list({ limit: 2 });
      expect(page1.hasMore).toBe(true);
      const page2 = await provider.list({ cursor: page1.nextCursor, limit: 10 });
      expect(page2.objects.length).toBeGreaterThan(0);
    });

    it('objects have correct metadata', async () => {
      const result = await provider.list({ prefix: 'a/' });
      for (const obj of result.objects) {
        expect(obj.size).toBeGreaterThan(0);
        expect(obj.contentType).toBe('text/plain');
        expect(obj.lastModified).toBeInstanceOf(Date);
      }
    });
  });

  describe('getUrl', () => {
    it('generates a URL with the base URL prefix', async () => {
      const url = await provider.getUrl('images/photo.jpg');
      expect(url).toBe('http://localhost/files/images/photo.jpg');
    });
  });

  describe('stat', () => {
    it('returns null for missing key', async () => {
      expect(await provider.stat('no.txt')).toBeNull();
    });

    it('returns metadata for existing key', async () => {
      await provider.put('stat-test.txt', 'hello', { metadata: { tag: 'test' } });
      const meta = await provider.stat('stat-test.txt');
      expect(meta?.key).toBe('stat-test.txt');
      expect(meta?.size).toBe(5);
      expect(meta?.metadata).toEqual({ tag: 'test' });
    });
  });

  describe('atomic writes', () => {
    it('survives concurrent puts to the same key', async () => {
      const writes = Array.from({ length: 10 }, (_, i) =>
        provider.put('concurrent.txt', String(i)),
      );
      await Promise.all(writes);
      const data = await provider.get('concurrent.txt');
      expect(data).not.toBeNull();
      // Data should be a valid number string from one of the concurrent writes
      const value = parseInt(data!.toString(), 10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(9);
    });
  });
});
