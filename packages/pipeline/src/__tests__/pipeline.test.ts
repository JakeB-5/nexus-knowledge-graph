import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from '../pipeline.js';

describe('Pipeline', () => {
  describe('Pipeline.from + toArray', () => {
    it('creates pipeline from array and collects', async () => {
      const result = await Pipeline.from([1, 2, 3]).toArray();
      expect(result).toEqual([1, 2, 3]);
    });

    it('creates pipeline from async generator', async () => {
      async function* gen() {
        yield 1;
        yield 2;
        yield 3;
      }
      const result = await Pipeline.from(gen()).toArray();
      expect(result).toEqual([1, 2, 3]);
    });

    it('creates pipeline from factory function', async () => {
      const result = await Pipeline.from(async function* () {
        yield 'a';
        yield 'b';
      }).toArray();
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('map', () => {
    it('transforms each item', async () => {
      const result = await Pipeline.from([1, 2, 3])
        .map((x) => x * 2)
        .toArray();
      expect(result).toEqual([2, 4, 6]);
    });

    it('chains multiple maps', async () => {
      const result = await Pipeline.from([1, 2, 3])
        .map((x) => x + 1)
        .map((x) => x * 10)
        .toArray();
      expect(result).toEqual([20, 30, 40]);
    });

    it('supports async map function', async () => {
      const result = await Pipeline.from([1, 2, 3])
        .map(async (x) => x * x)
        .toArray();
      expect(result).toEqual([1, 4, 9]);
    });

    it('maps to different type', async () => {
      const result = await Pipeline.from([1, 2, 3])
        .map((x) => String(x))
        .toArray();
      expect(result).toEqual(['1', '2', '3']);
    });
  });

  describe('filter', () => {
    it('filters items by predicate', async () => {
      const result = await Pipeline.from([1, 2, 3, 4, 5])
        .filter((x) => x % 2 === 0)
        .toArray();
      expect(result).toEqual([2, 4]);
    });

    it('filter with map chain', async () => {
      const result = await Pipeline.from([1, 2, 3, 4, 5, 6])
        .filter((x) => x % 2 === 0)
        .map((x) => x * 10)
        .toArray();
      expect(result).toEqual([20, 40, 60]);
    });

    it('async filter', async () => {
      const result = await Pipeline.from([1, 2, 3, 4])
        .filter(async (x) => x > 2)
        .toArray();
      expect(result).toEqual([3, 4]);
    });
  });

  describe('flatMap', () => {
    it('expands each item to multiple items', async () => {
      const result = await Pipeline.from([1, 2, 3])
        .flatMap((x) => [x, x * 10])
        .toArray();
      expect(result).toEqual([1, 10, 2, 20, 3, 30]);
    });

    it('async flatMap', async () => {
      const result = await Pipeline.from(['a', 'b'])
        .flatMap(async (x) => [x, x.toUpperCase()])
        .toArray();
      expect(result).toEqual(['a', 'A', 'b', 'B']);
    });

    it('can expand to empty array (filtering effect)', async () => {
      const result = await Pipeline.from([1, 2, 3, 4])
        .flatMap((x) => (x % 2 === 0 ? [x] : []))
        .toArray();
      expect(result).toEqual([2, 4]);
    });
  });

  describe('take', () => {
    it('takes first N items', async () => {
      const result = await Pipeline.from([1, 2, 3, 4, 5]).take(3).toArray();
      expect(result).toEqual([1, 2, 3]);
    });

    it('take 0 returns empty', async () => {
      const result = await Pipeline.from([1, 2, 3]).take(0).toArray();
      expect(result).toEqual([]);
    });

    it('take more than available returns all', async () => {
      const result = await Pipeline.from([1, 2]).take(10).toArray();
      expect(result).toEqual([1, 2]);
    });
  });

  describe('skip', () => {
    it('skips first N items', async () => {
      const result = await Pipeline.from([1, 2, 3, 4, 5]).skip(2).toArray();
      expect(result).toEqual([3, 4, 5]);
    });

    it('skip all returns empty', async () => {
      const result = await Pipeline.from([1, 2, 3]).skip(10).toArray();
      expect(result).toEqual([]);
    });
  });

  describe('batch', () => {
    it('groups items into batches', async () => {
      const result = await Pipeline.from([1, 2, 3, 4, 5]).batch(2).toArray();
      expect(result).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('batch size equals item count', async () => {
      const result = await Pipeline.from([1, 2, 3]).batch(3).toArray();
      expect(result).toEqual([[1, 2, 3]]);
    });
  });

  describe('distinct', () => {
    it('removes duplicates', async () => {
      const result = await Pipeline.from([1, 2, 1, 3, 2, 4]).distinct().toArray();
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('empty array stays empty', async () => {
      const result = await Pipeline.from<number>([]).distinct().toArray();
      expect(result).toEqual([]);
    });
  });

  describe('distinctBy', () => {
    it('deduplicates by key function', async () => {
      const items = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 1, name: 'Alice2' },
      ];
      const result = await Pipeline.from(items).distinctBy((x) => x.id).toArray();
      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Alice');
    });
  });

  describe('tap', () => {
    it('calls side effect without changing items', async () => {
      const seen: number[] = [];
      const result = await Pipeline.from([1, 2, 3])
        .tap((x) => seen.push(x))
        .toArray();
      expect(result).toEqual([1, 2, 3]);
      expect(seen).toEqual([1, 2, 3]);
    });

    it('async tap', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      await Pipeline.from([1, 2]).tap(fn).toArray();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('forEach', () => {
    it('calls sink function for each item', async () => {
      const seen: number[] = [];
      await Pipeline.from([10, 20, 30]).forEach((x) => { seen.push(x); });
      expect(seen).toEqual([10, 20, 30]);
    });
  });

  describe('first / last / count', () => {
    it('first returns the first item', async () => {
      const result = await Pipeline.from([5, 6, 7]).first();
      expect(result).toBe(5);
    });

    it('first returns undefined for empty', async () => {
      expect(await Pipeline.from<number>([]).first()).toBe(undefined);
    });

    it('last returns the last item', async () => {
      expect(await Pipeline.from([1, 2, 3]).last()).toBe(3);
    });

    it('count returns item count', async () => {
      expect(await Pipeline.from([1, 2, 3, 4]).count()).toBe(4);
    });
  });

  describe('metrics', () => {
    it('tracks items processed', async () => {
      const p = Pipeline.from([1, 2, 3]).map((x) => x * 2);
      await p.toArray();
      const metrics = p.getMetrics();
      expect(metrics.itemsProcessed).toBe(3);
    });

    it('tracks start and end time', async () => {
      const p = Pipeline.from([1, 2]);
      await p.toArray();
      const metrics = p.getMetrics();
      expect(metrics.startTime).toBeGreaterThan(0);
      expect(metrics.endTime).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('skip strategy drops failed items', async () => {
      const result = await Pipeline.from([1, 2, 3])
        .map((x) => {
          if (x === 2) throw new Error('fail');
          return x;
        })
        .onError('skip')
        .toArray();
      expect(result).toEqual([1, 3]);
    });

    it('dead-letter strategy records failed items', async () => {
      const p = Pipeline.from([1, 2, 3])
        .map((x) => {
          if (x === 2) throw new Error('fail');
          return x;
        })
        .onError('dead-letter');
      await p.toArray();
      expect(p.getDeadLetterQueue()).toEqual([2]);
    });

    it('throw strategy propagates errors', async () => {
      const p = Pipeline.from([1, 2, 3])
        .map((x) => {
          if (x === 2) throw new Error('boom');
          return x;
        })
        .onError('throw');
      await expect(p.toArray()).rejects.toThrow('boom');
    });
  });

  describe('chained pipeline composition', () => {
    it('combines map and filter', async () => {
      const result = await Pipeline.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        .filter((x) => x % 2 === 0)
        .map((x) => x * x)
        .take(3)
        .toArray();
      expect(result).toEqual([4, 16, 36]);
    });

    it('complex pipeline with multiple stages', async () => {
      const result = await Pipeline.from(['hello world', 'foo bar baz', 'test'])
        .flatMap((s) => s.split(' '))
        .map((w) => w.toUpperCase())
        .filter((w) => w.length > 3)
        .distinct()
        .toArray();
      expect(result).toContain('HELLO');
      expect(result).toContain('WORLD');
      expect(result).not.toContain('FOO');
    });
  });
});
