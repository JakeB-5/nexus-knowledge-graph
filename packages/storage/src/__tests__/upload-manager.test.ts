/**
 * Tests for UploadManager.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageProvider } from '../memory-storage.js';
import { UploadManager, UploadProgress } from '../upload-manager.js';

describe('UploadManager', () => {
  let provider: InMemoryStorageProvider;
  let manager: UploadManager;

  beforeEach(() => {
    provider = new InMemoryStorageProvider();
    manager = new UploadManager(provider);
  });

  describe('generateKey', () => {
    it('generates a key with correct prefix', () => {
      const key = manager.generateKey('photo.jpg');
      expect(key).toMatch(/^uploads\/\d{4}-\d{2}-\d{2}\/[a-f0-9]+\/photo\.jpg$/);
    });

    it('sanitizes unsafe characters in filename', () => {
      const key = manager.generateKey('my file (1).jpg');
      expect(key).not.toContain(' ');
      expect(key).not.toContain('(');
      expect(key).not.toContain(')');
    });

    it('respects custom prefix', () => {
      const key = manager.generateKey('doc.pdf', 'documents');
      expect(key.startsWith('documents/')).toBe(true);
    });

    it('generates unique keys for the same filename', () => {
      const a = manager.generateKey('file.txt');
      const b = manager.generateKey('file.txt');
      expect(a).not.toBe(b);
    });
  });

  describe('validate', () => {
    const data = Buffer.from('hello world');
    const filename = 'test.txt';
    const contentType = 'text/plain';

    it('passes with no constraints', () => {
      const result = manager.validate(data, filename, contentType);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects oversized files', () => {
      const result = manager.validate(data, filename, contentType, { maxSizeBytes: 5 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds maximum');
    });

    it('rejects disallowed content type', () => {
      const result = manager.validate(data, filename, contentType, {
        allowedContentTypes: ['image/png'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not allowed');
    });

    it('rejects disallowed extension', () => {
      const result = manager.validate(data, filename, contentType, {
        allowedExtensions: ['.jpg'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not allowed');
    });

    it('accumulates multiple errors', () => {
      const result = manager.validate(data, filename, contentType, {
        maxSizeBytes: 1,
        allowedContentTypes: ['image/png'],
        allowedExtensions: ['.jpg'],
      });
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('passes when all constraints are met', () => {
      const result = manager.validate(data, filename, contentType, {
        maxSizeBytes: 100,
        allowedContentTypes: ['text/plain'],
        allowedExtensions: ['.txt'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('upload (single-shot)', () => {
    it('stores file in provider', async () => {
      const data = Buffer.from('content');
      const result = await manager.upload('myfile.txt', data, { contentType: 'text/plain' });
      expect(result.key).toBe('myfile.txt');
      expect(result.size).toBe(7);
      const stored = await provider.get('myfile.txt');
      expect(stored!.toString()).toBe('content');
    });

    it('calls onProgress with 100% after upload', async () => {
      const progress: UploadProgress[] = [];
      await manager.upload('f.txt', Buffer.from('abc'), {
        onProgress: (p) => progress.push(p),
      });
      expect(progress).toHaveLength(1);
      expect(progress[0]!.percent).toBe(100);
    });

    it('throws when validation fails', async () => {
      await expect(
        manager.upload('f.txt', Buffer.from('hello'), {
          contentType: 'text/plain',
          validation: { maxSizeBytes: 1 },
        }),
      ).rejects.toThrow('validation failed');
    });

    it('returns an uploadId', async () => {
      const result = await manager.upload('x.txt', Buffer.from('x'));
      expect(result.uploadId).toBeTruthy();
      expect(typeof result.uploadId).toBe('string');
    });
  });

  describe('uploadMultipart', () => {
    it('assembles chunks into the final object', async () => {
      const data = Buffer.alloc(12 * 1024, 0x42); // 12 KB
      const result = await manager.uploadMultipart('large.bin', data, {
        chunkSize: 4 * 1024,
        contentType: 'application/octet-stream',
      });
      expect(result.size).toBe(data.length);
      const stored = await provider.get('large.bin');
      expect(stored!.length).toBe(data.length);
      expect(stored!.every((b) => b === 0x42)).toBe(true);
    });

    it('reports progress for each chunk', async () => {
      const data = Buffer.alloc(9 * 1024);
      const progress: UploadProgress[] = [];
      await manager.uploadMultipart('prog.bin', data, {
        chunkSize: 3 * 1024,
        concurrency: 1,
        onProgress: (p) => progress.push(p),
      });
      expect(progress.length).toBeGreaterThanOrEqual(1);
      const last = progress[progress.length - 1]!;
      expect(last.percent).toBe(100);
    });

    it('cleans up part files after assembly', async () => {
      const data = Buffer.alloc(6 * 1024);
      const result = await manager.uploadMultipart('cleanup.bin', data, { chunkSize: 2 * 1024 });
      const partKey = `cleanup.bin.__parts__/${result.uploadId}/0`;
      expect(await provider.exists(partKey)).toBe(false);
    });

    it('throws when validation fails', async () => {
      await expect(
        manager.uploadMultipart('bad.bin', Buffer.alloc(100), {
          contentType: 'application/octet-stream',
          validation: { allowedContentTypes: ['image/png'] },
        }),
      ).rejects.toThrow('validation failed');
    });
  });

  describe('listActiveUploads and cancelUpload', () => {
    it('returns empty list when no uploads active', () => {
      expect(manager.listActiveUploads()).toHaveLength(0);
    });

    it('cancelUpload removes state without throwing', async () => {
      await manager.cancelUpload('nonexistent-id');
    });
  });
});
