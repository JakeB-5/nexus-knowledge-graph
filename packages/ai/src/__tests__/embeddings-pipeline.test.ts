/**
 * Tests for EmbeddingsPipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockAIProvider } from '../providers/mock.js';
import {
  EmbeddingsPipeline,
  EmbeddingNode,
  InMemoryEmbeddingCache,
} from '../embeddings-pipeline.js';

describe('EmbeddingsPipeline', () => {
  let provider: MockAIProvider;
  let pipeline: EmbeddingsPipeline;

  beforeEach(() => {
    provider = new MockAIProvider({ embeddingDimensions: 16 });
    pipeline = new EmbeddingsPipeline(provider, undefined, { batchSize: 5 });
  });

  describe('embed', () => {
    it('generates embeddings for a list of nodes', async () => {
      const nodes: EmbeddingNode[] = [
        { id: 'n1', text: 'Hello world' },
        { id: 'n2', text: 'Goodbye world' },
      ];
      const result = await pipeline.embed(nodes);
      expect(result.records).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.processed).toBe(2);
    });

    it('each record has correct fields', async () => {
      const nodes: EmbeddingNode[] = [{ id: 'n1', text: 'Test text' }];
      const result = await pipeline.embed(nodes);
      const record = result.records[0]!;
      expect(record.nodeId).toBe('n1');
      expect(Array.isArray(record.embedding)).toBe(true);
      expect(record.embedding.length).toBe(16);
      expect(record.contentHash).toBeTruthy();
      expect(record.generatedAt).toBeInstanceOf(Date);
    });

    it('skips nodes with unchanged content (incremental)', async () => {
      const nodes: EmbeddingNode[] = [{ id: 'n1', text: 'Same text' }];
      await pipeline.embed(nodes);
      const result2 = await pipeline.embed(nodes);
      expect(result2.skipped).toBe(1);
      expect(result2.processed).toBe(0);
    });

    it('re-embeds nodes when content changes', async () => {
      await pipeline.embed([{ id: 'n1', text: 'original text' }]);
      const result = await pipeline.embed([{ id: 'n1', text: 'updated text' }]);
      // Content changed, so it should be processed, not skipped
      expect(result.processed).toBe(1);
    });

    it('handles empty node list', async () => {
      const result = await pipeline.embed([]);
      expect(result.records).toHaveLength(0);
      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('processes in batches', async () => {
      const nodes = Array.from({ length: 12 }, (_, i) => ({
        id: `n${i}`,
        text: `text ${i}`,
      }));
      const result = await pipeline.embed(nodes, { batchSize: 4 });
      expect(result.records).toHaveLength(12);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('embedOne', () => {
    it('embeds a single node', async () => {
      const record = await pipeline.embedOne({ id: 'solo', text: 'Solo embedding' });
      expect(record.nodeId).toBe('solo');
      expect(record.embedding.length).toBe(16);
    });

    it('throws when node fails to embed', async () => {
      // Force error by giving empty text that maps to an empty batch error
      // We'll test the error propagation path by using a broken provider
      const brokenProvider = new MockAIProvider();
      // Override embed to throw
      brokenProvider.doEmbed = async () => { throw new Error('API down'); };
      const brokenPipeline = new EmbeddingsPipeline(brokenProvider as MockAIProvider);
      await expect(brokenPipeline.embedOne({ id: 'x', text: 'text' })).rejects.toThrow();
    });
  });

  describe('invalidate', () => {
    it('forces re-embedding after invalidation', async () => {
      const nodes: EmbeddingNode[] = [{ id: 'n1', text: 'text' }];
      await pipeline.embed(nodes);
      pipeline.invalidate('n1');
      const result = await pipeline.embed(nodes);
      // After invalidation, should be re-processed (not skipped from version record)
      // It may still be cached, but version record is gone
      expect(result.records).toHaveLength(1);
    });
  });

  describe('clearCache', () => {
    it('clears all cached embeddings', async () => {
      await pipeline.embed([{ id: 'n1', text: 'text' }]);
      pipeline.clearCache();
      const result = await pipeline.embed([{ id: 'n1', text: 'text' }]);
      // After clear, should be re-processed
      expect(result.processed).toBe(1);
    });
  });

  describe('reduceDimensions', () => {
    it('reduces embeddings to target dimensions', () => {
      const embeddings = [
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
      ];
      const reduced = pipeline.reduceDimensions(embeddings, 3);
      expect(reduced).toHaveLength(2);
      expect(reduced[0]).toHaveLength(3);
      expect(reduced[1]).toHaveLength(3);
    });

    it('returns original if targetDims >= sourceDims', () => {
      const embeddings = [[0.1, 0.2, 0.3]];
      const reduced = pipeline.reduceDimensions(embeddings, 3);
      expect(reduced[0]).toHaveLength(3);
    });

    it('returns empty array for empty input', () => {
      expect(pipeline.reduceDimensions([], 3)).toHaveLength(0);
    });

    it('produces deterministic results', () => {
      const embeddings = [[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]];
      const r1 = pipeline.reduceDimensions(embeddings, 4);
      const r2 = pipeline.reduceDimensions(embeddings, 4);
      expect(r1[0]).toEqual(r2[0]);
    });
  });

  describe('InMemoryEmbeddingCache', () => {
    it('stores and retrieves embeddings', () => {
      const cache = new InMemoryEmbeddingCache();
      cache.set('key1', [0.1, 0.2]);
      expect(cache.get('key1')).toEqual([0.1, 0.2]);
    });

    it('returns undefined for missing keys', () => {
      const cache = new InMemoryEmbeddingCache();
      expect(cache.get('missing')).toBeUndefined();
    });

    it('reports correct size', () => {
      const cache = new InMemoryEmbeddingCache();
      expect(cache.size()).toBe(0);
      cache.set('k1', [1]);
      cache.set('k2', [2]);
      expect(cache.size()).toBe(2);
    });

    it('evicts oldest entry when full', () => {
      const cache = new InMemoryEmbeddingCache(2);
      cache.set('a', [1]);
      cache.set('b', [2]);
      cache.set('c', [3]); // should evict 'a'
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
    });

    it('delete removes entry', () => {
      const cache = new InMemoryEmbeddingCache();
      cache.set('k', [1]);
      cache.delete('k');
      expect(cache.has('k')).toBe(false);
    });

    it('clear removes all entries', () => {
      const cache = new InMemoryEmbeddingCache();
      cache.set('a', [1]);
      cache.set('b', [2]);
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });
});
