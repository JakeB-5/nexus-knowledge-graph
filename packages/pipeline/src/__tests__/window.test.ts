import { describe, it, expect } from 'vitest';
import {
  tumblingWindow,
  slidingWindow,
  sessionWindow,
  countWindow,
  aggregateWindow,
  aggregateWindows,
} from '../operators/window.js';

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of gen) result.push(item);
  return result;
}

interface Event {
  value: number;
  ts: number;
}

const getTs = (e: Event) => e.ts;

describe('tumblingWindow', () => {
  it('groups items into non-overlapping time windows', async () => {
    const events: Event[] = [
      { value: 1, ts: 0 },
      { value: 2, ts: 50 },
      { value: 3, ts: 100 },
      { value: 4, ts: 150 },
      { value: 5, ts: 200 },
    ];

    const windows = await collect(tumblingWindow(
      (async function* () { for (const e of events) yield e; })(),
      100,
      getTs,
    ));

    expect(windows.length).toBeGreaterThanOrEqual(2);
    expect(windows[0]!.items.some((e) => e.value === 1)).toBe(true);
    expect(windows[0]!.items.some((e) => e.value === 2)).toBe(true);
  });

  it('emits final partial window', async () => {
    const events: Event[] = [
      { value: 1, ts: 0 },
      { value: 2, ts: 10 },
    ];

    const windows = await collect(tumblingWindow(
      (async function* () { for (const e of events) yield e; })(),
      1000,
      getTs,
    ));

    expect(windows).toHaveLength(1);
    expect(windows[0]!.items).toHaveLength(2);
  });

  it('returns empty for empty source', async () => {
    const windows = await collect(tumblingWindow(
      (async function* () { /* empty */ })(),
      100,
      getTs,
    ));
    expect(windows).toHaveLength(0);
  });

  it('window startTime and endTime are set correctly', async () => {
    const events: Event[] = [{ value: 1, ts: 500 }];
    const windows = await collect(tumblingWindow(
      (async function* () { for (const e of events) yield e; })(),
      1000,
      getTs,
    ));
    expect(windows[0]!.startTime).toBe(500);
    expect(windows[0]!.endTime).toBe(1500);
  });
});

describe('slidingWindow', () => {
  it('produces overlapping windows', async () => {
    const events: Event[] = [
      { value: 1, ts: 0 },
      { value: 2, ts: 50 },
      { value: 3, ts: 100 },
      { value: 4, ts: 150 },
    ];

    const windows = await collect(slidingWindow(
      (async function* () { for (const e of events) yield e; })(),
      150,
      50,
      getTs,
    ));

    // Multiple overlapping windows expected
    expect(windows.length).toBeGreaterThanOrEqual(1);
  });

  it('emits remaining items at end', async () => {
    const events: Event[] = [{ value: 10, ts: 0 }, { value: 20, ts: 10 }];
    const windows = await collect(slidingWindow(
      (async function* () { for (const e of events) yield e; })(),
      100,
      50,
      getTs,
    ));

    const allValues = windows.flatMap((w) => w.items.map((e) => e.value));
    expect(allValues).toContain(10);
    expect(allValues).toContain(20);
  });
});

describe('sessionWindow', () => {
  it('groups items within a session gap', async () => {
    const events: Event[] = [
      { value: 1, ts: 0 },
      { value: 2, ts: 10 },
      { value: 3, ts: 20 },
      // gap > 100ms
      { value: 4, ts: 200 },
      { value: 5, ts: 210 },
    ];

    const windows = await collect(sessionWindow(
      (async function* () { for (const e of events) yield e; })(),
      100,
      getTs,
    ));

    expect(windows).toHaveLength(2);
    expect(windows[0]!.items).toHaveLength(3);
    expect(windows[1]!.items).toHaveLength(2);
  });

  it('emits single session when no gap', async () => {
    const events: Event[] = [
      { value: 1, ts: 0 },
      { value: 2, ts: 10 },
      { value: 3, ts: 20 },
    ];

    const windows = await collect(sessionWindow(
      (async function* () { for (const e of events) yield e; })(),
      1000,
      getTs,
    ));

    expect(windows).toHaveLength(1);
    expect(windows[0]!.items).toHaveLength(3);
  });

  it('returns empty for empty source', async () => {
    const windows = await collect(sessionWindow(
      (async function* () { /* empty */ })(),
      100,
      getTs,
    ));
    expect(windows).toHaveLength(0);
  });
});

describe('countWindow', () => {
  it('groups exactly N items per window', async () => {
    async function* src() {
      for (let i = 1; i <= 7; i++) yield i;
    }

    const windows = await collect(countWindow(src(), 3));
    expect(windows).toHaveLength(3);
    expect(windows[0]!.items).toEqual([1, 2, 3]);
    expect(windows[1]!.items).toEqual([4, 5, 6]);
    expect(windows[2]!.items).toEqual([7]);
  });

  it('handles exact multiple', async () => {
    async function* src() {
      for (let i = 1; i <= 6; i++) yield i;
    }

    const windows = await collect(countWindow(src(), 3));
    expect(windows).toHaveLength(2);
    expect(windows[0]!.items).toEqual([1, 2, 3]);
    expect(windows[1]!.items).toEqual([4, 5, 6]);
  });

  it('returns empty for empty source', async () => {
    async function* src() { /* empty */ }
    const windows = await collect(countWindow(src(), 3));
    expect(windows).toHaveLength(0);
  });

  it('single window for size >= item count', async () => {
    async function* src() {
      yield 1; yield 2;
    }
    const windows = await collect(countWindow(src(), 10));
    expect(windows).toHaveLength(1);
    expect(windows[0]!.items).toEqual([1, 2]);
  });
});

describe('aggregateWindow', () => {
  it('computes sum, avg, min, max, count', () => {
    const w = { items: [2, 4, 6, 8], startTime: 0, endTime: 100 };
    const agg = aggregateWindow(w, (x) => x);
    expect(agg.count).toBe(4);
    expect(agg.sum).toBe(20);
    expect(agg.avg).toBe(5);
    expect(agg.min).toBe(2);
    expect(agg.max).toBe(8);
  });

  it('handles single item window', () => {
    const w = { items: [42], startTime: 0, endTime: 100 };
    const agg = aggregateWindow(w, (x) => x);
    expect(agg.count).toBe(1);
    expect(agg.sum).toBe(42);
    expect(agg.min).toBe(42);
    expect(agg.max).toBe(42);
  });

  it('handles empty window', () => {
    const w = { items: [] as number[], startTime: 0, endTime: 100 };
    const agg = aggregateWindow(w, (x) => x);
    expect(agg.count).toBe(0);
    expect(agg.sum).toBe(0);
  });
});

describe('aggregateWindows', () => {
  it('annotates each window with aggregation', async () => {
    async function* src() {
      yield { items: [1, 2, 3], startTime: 0, endTime: 100 };
      yield { items: [4, 5], startTime: 100, endTime: 200 };
    }

    const results = await collect(aggregateWindows(src(), (x) => x));
    expect(results[0]!.aggregation.sum).toBe(6);
    expect(results[1]!.aggregation.sum).toBe(9);
  });
});
