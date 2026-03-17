/**
 * Tests for InMemoryStorageProvider.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageProvider } from '../memory-storage.js';

describe('InMemoryStorageProvider', () => {
  let provider: InMemoryStorageProvider;

  beforeEach(() => {
    provider = new InMemoryStorageProvider();
  });

  describe('put and get', () => {
    it('stores and retrieves a Buffer', async () => {
      const data = Buffer.from('hello');
      await provider.put('test.txt', data, { contentType: 'text/plain' });
      const result = await provider.get('test.txt');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('hello');
    });

    it('stores and retrieves a string', async () => {
      await provider.put('doc.txt', 'content');
      const result = await provider.get('doc.txt');
      expect(result!.toString()).toBe('content');
    });

    it('stores Uint8Array', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await provider.put('bytes.bin', data);
      const result = await provider.get('bytes.bin');
      expect(result![0]).toBe(1);
      expect(result![1]).toBe(2);
      expect(result![2]).toBe(3);
    });

    it('returns null for non-existent key', async () => {
      expect(await provider.get('missing.txt')).toBeNull();
    });

    it('returns a copy of the stored data', async () => {
      const data = Buffer.from('original');
      await provider.put('copy-test.txt', data);
      const got = await provider.get('copy-test.txt');
      got![0] = 0x00;
      const got2 = await provider.get('copy-test.txt');
      expect(got2![0]).toBe('o'.charCodeAt(0)); // unchanged
    });

    it('returns correct PutResult', async () => {
      const result = await provider.put('f.json', '{}', { contentType: 'application/json' });
      expect(result.key).toBe('f.json');
      expect(result.size).toBe(2);
      expect(result.contentType).toBe('application/json');
    });

    it('infers content type from extension', async () => {
      await provider.put('image.png', Buffer.from('x'));
      expect(provider.stat('image.png')?.contentType).toBe('image/png');
    });

    it('overwrites existing entry and updates size tracking', async () => {
      await provider.put('ow.txt', 'hello');
      await provider.put('ow.txt', 'hi');
      const got = await provider.get('ow.txt');
      expect(got!.toString()).toBe('hi');
      expect(provider.totalSize).toBe(2);
    });
  });

  describe('size limit', () => {
    it('throws when size limit is exceeded', async () => {
      const small = new InMemoryStorageProvider(10);
      await expect(small.put('big.bin', Buffer.alloc(11))).rejects.toThrow('size limit exceeded');
    });

    it('allows writes up to the size limit', async () => {
      const small = new InMemoryStorageProvider(10);
      await expect(small.put('ok.bin', Buffer.alloc(10))).resolves.toBeDefined();
    });
  });

  describe('delete', () => {
    it('removes a stored entry', async () => {
      await provider.put('del.txt', 'bye');
      await provider.delete('del.txt');
      expect(await provider.get('del.txt')).toBeNull();
    });

    it('updates totalSize after delete', async () => {
      await provider.put('a.txt', '12345');
      await provider.delete('a.txt');
      expect(provider.totalSize).toBe(0);
    });

    it('does not throw for missing key', async () => {
      await expect(provider.delete('ghost.txt')).resolves.toBeUndefined();
    });
  });

  describe('exists', () => {
    it('returns true for stored key', async () => {
      await provider.put('e.txt', 'x');
      expect(await provider.exists('e.txt')).toBe(true);
    });

    it('returns false for missing key', async () => {
      expect(await provider.exists('none.txt')).toBe(false);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await provider.put('a/1.txt', 'aaa');
      await provider.put('a/2.txt', 'bb');
      await provider.put('b/3.txt', 'c');
    });

    it('lists all objects', async () => {
      const result = await provider.list();
      expect(result.objects.map((o) => o.key).sort()).toEqual(['a/1.txt', 'a/2.txt', 'b/3.txt']);
    });

    it('filters by prefix', async () => {
      const result = await provider.list({ prefix: 'a/' });
      expect(result.objects.map((o) => o.key)).toEqual(['a/1.txt', 'a/2.txt']);
    });

    it('paginates with limit and cursor', async () => {
      const p1 = await provider.list({ limit: 2 });
      expect(p1.objects.length).toBe(2);
      expect(p1.hasMore).toBe(true);
      const p2 = await provider.list({ cursor: p1.nextCursor });
      expect(p2.objects.length).toBe(1);
      expect(p2.hasMore).toBe(false);
    });

    it('returns empty list for non-matching prefix', async () => {
      const result = await provider.list({ prefix: 'z/' });
      expect(result.objects).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('objects contain correct size', async () => {
      const result = await provider.list({ prefix: 'a/' });
      const byKey = Object.fromEntries(result.objects.map((o) => [o.key, o]));
      expect(byKey['a/1.txt']?.size).toBe(3);
      expect(byKey['a/2.txt']?.size).toBe(2);
    });
  });

  describe('getUrl', () => {
    it('returns memory:// URL', async () => {
      const url = await provider.getUrl('some/key.png');
      expect(url).toBe('memory://some/key.png');
    });
  });

  describe('clear', () => {
    it('removes all entries', async () => {
      await provider.put('x.txt', 'x');
      provider.clear();
      expect(provider.count).toBe(0);
      expect(provider.totalSize).toBe(0);
    });
  });

  describe('count and totalSize', () => {
    it('tracks count correctly', async () => {
      expect(provider.count).toBe(0);
      await provider.put('a.txt', 'x');
      expect(provider.count).toBe(1);
      await provider.put('b.txt', 'y');
      expect(provider.count).toBe(2);
    });

    it('tracks totalSize correctly', async () => {
      await provider.put('a.txt', 'abc');
      await provider.put('b.txt', 'de');
      expect(provider.totalSize).toBe(5);
    });
  });
});
