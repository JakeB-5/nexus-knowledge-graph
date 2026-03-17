import { describe, it, expect, vi } from 'vitest';
import {
  take,
  skip,
  distinct,
  distinctBy,
  throttle,
  debounce,
  buffer,
  window,
  tap,
  retry,
  mapAsync,
  filterAsync,
  flatMapAsync,
  scan,
} from '../transforms.js';
import { arraySource } from '../sources.js';

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of gen) result.push(item);
  return result;
}

describe('take', () => {
  it('passes first N items', () => {
    const fn = take<number>(3);
    expect(fn(1)).toBe(true);
    expect(fn(2)).toBe(true);
    expect(fn(3)).toBe(true);
    expect(fn(4)).toBe(false);
    expect(fn(5)).toBe(false);
  });

  it('take 0 blocks all', () => {
    const fn = take<number>(0);
    expect(fn(1)).toBe(false);
  });
});

describe('skip', () => {
  it('skips first N items', () => {
    const fn = skip<number>(2);
    expect(fn(1)).toBe(false);
    expect(fn(2)).toBe(false);
    expect(fn(3)).toBe(true);
    expect(fn(4)).toBe(true);
  });

  it('skip 0 passes all', () => {
    const fn = skip<number>(0);
    expect(fn(1)).toBe(true);
  });
});

describe('distinct', () => {
  it('removes duplicates', () => {
    const fn = distinct<number>();
    expect(fn(1)).toBe(true);
    expect(fn(2)).toBe(true);
    expect(fn(1)).toBe(false);
    expect(fn(3)).toBe(true);
    expect(fn(2)).toBe(false);
  });

  it('works with strings', () => {
    const fn = distinct<string>();
    expect(fn('a')).toBe(true);
    expect(fn('b')).toBe(true);
    expect(fn('a')).toBe(false);
  });
});

describe('distinctBy', () => {
  it('deduplicates by key function', () => {
    const fn = distinctBy<{ id: number }, number>((x) => x.id);
    expect(fn({ id: 1 })).toBe(true);
    expect(fn({ id: 2 })).toBe(true);
    expect(fn({ id: 1 })).toBe(false);
    expect(fn({ id: 3 })).toBe(true);
  });
});

describe('throttle', () => {
  it('passes the first item immediately', () => {
    const fn = throttle<number>(100);
    expect(fn(1)).toBe(true);
  });

  it('blocks items within the window', () => {
    const fn = throttle<number>(1000);
    expect(fn(1)).toBe(true);
    expect(fn(2)).toBe(false);
    expect(fn(3)).toBe(false);
  });
});

describe('debounce', () => {
  it('emits only the last item after the window', async () => {
    async function* src() {
      yield 1;
      yield 2;
      yield 3;
    }
    const result = await collect(debounce<number>(0)(src()));
    // With 0ms delay, last item should be emitted
    expect(result).toContain(3);
  });

  it('passes single item through', async () => {
    async function* src() {
      yield 42;
    }
    const result = await collect(debounce<number>(0)(src()));
    expect(result).toContain(42);
  });
});

describe('buffer', () => {
  it('groups items into fixed-size arrays', async () => {
    const result = await collect(buffer<number>(3)(arraySource([1, 2, 3, 4, 5])));
    expect(result).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('emits single batch when size >= items', async () => {
    const result = await collect(buffer<number>(10)(arraySource([1, 2, 3])));
    expect(result).toEqual([[1, 2, 3]]);
  });

  it('handles empty source', async () => {
    const result = await collect(buffer<number>(3)(arraySource([])));
    expect(result).toEqual([]);
  });
});

describe('window (time-based)', () => {
  it('collects items into a window and emits at end', async () => {
    const result = await collect(window<number>(10)(arraySource([1, 2, 3, 4, 5])));
    // Since items arrive instantly (<10ms), they may all land in one window
    const flat = result.flat();
    expect(flat).toEqual([1, 2, 3, 4, 5]);
  });

  it('emits remaining items at end', async () => {
    const result = await collect(window<number>(1000)(arraySource([1, 2])));
    expect(result.flat()).toEqual([1, 2]);
  });
});

describe('tap', () => {
  it('calls side effect and passes item through', async () => {
    const seen: number[] = [];
    const fn = tap<number>((x) => { seen.push(x); });
    expect(await fn(1)).toBe(1);
    expect(await fn(2)).toBe(2);
    expect(seen).toEqual([1, 2]);
  });

  it('async tap', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const transform = tap<number>(fn);
    await transform(5);
    expect(fn).toHaveBeenCalledWith(5);
  });
});

describe('retry', () => {
  it('retries a failing function', async () => {
    let attempts = 0;
    const fn = retry<number, number>(
      async (x) => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return x * 2;
      },
      3,
      0,
    );
    expect(await fn(5)).toBe(10);
    expect(attempts).toBe(3);
  });

  it('throws after max attempts', async () => {
    const fn = retry<number, number>(
      async () => { throw new Error('always fails'); },
      2,
      0,
    );
    await expect(fn(1)).rejects.toThrow('always fails');
  });

  it('succeeds on first try', async () => {
    const fn = retry<number, number>(async (x) => x + 1, 3, 0);
    expect(await fn(10)).toBe(11);
  });
});

describe('scan', () => {
  it('emits running sum', async () => {
    const result = await collect(scan<number, number>((acc, x) => acc + x, 0)(arraySource([1, 2, 3, 4])));
    expect(result).toEqual([1, 3, 6, 10]);
  });

  it('emits each intermediate accumulation', async () => {
    const result = await collect(scan<number, number[]>((acc, x) => [...acc, x], [])(arraySource([1, 2, 3])));
    expect(result).toEqual([[1], [1, 2], [1, 2, 3]]);
  });
});

describe('mapAsync', () => {
  it('maps over async iterable', async () => {
    const result = await collect(mapAsync(arraySource([1, 2, 3]), (x) => x * 10));
    expect(result).toEqual([10, 20, 30]);
  });
});

describe('filterAsync', () => {
  it('filters async iterable', async () => {
    const result = await collect(filterAsync(arraySource([1, 2, 3, 4, 5]), (x) => x % 2 === 0));
    expect(result).toEqual([2, 4]);
  });
});

describe('flatMapAsync', () => {
  it('flat maps over async iterable', async () => {
    const result = await collect(
      flatMapAsync(arraySource([1, 2, 3]), (x) => [x, x * 10]),
    );
    expect(result).toEqual([1, 10, 2, 20, 3, 30]);
  });
});
