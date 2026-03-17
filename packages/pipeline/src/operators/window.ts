// Window operators: TumblingWindow, SlidingWindow, SessionWindow, CountWindow,
// and per-window aggregation (sum, avg, count, min, max).

export interface WindowResult<T> {
  items: T[];
  startTime: number;
  endTime: number;
}

export interface WindowAggregation {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

type TimestampFn<T> = (item: T) => number;

function defaultTimestamp(): number {
  return Date.now();
}

// ─── Tumbling Window ──────────────────────────────────────────────────────────
// Non-overlapping fixed-size time windows. Each item belongs to exactly one window.

export async function* tumblingWindow<T>(
  source: AsyncIterable<T>,
  sizeMs: number,
  getTimestamp: TimestampFn<T> = defaultTimestamp,
): AsyncGenerator<WindowResult<T>> {
  let windowStart: number | null = null;
  let buffer: T[] = [];

  for await (const item of source) {
    const ts = getTimestamp(item);

    if (windowStart === null) {
      windowStart = ts;
    }

    if (ts >= windowStart + sizeMs) {
      // Emit current window
      if (buffer.length > 0) {
        yield { items: buffer, startTime: windowStart, endTime: windowStart + sizeMs };
      }
      // Advance window
      const windowsSkipped = Math.floor((ts - windowStart) / sizeMs);
      windowStart = windowStart + windowsSkipped * sizeMs;
      buffer = [];
    }

    buffer.push(item);
  }

  // Emit final window
  if (buffer.length > 0 && windowStart !== null) {
    yield { items: buffer, startTime: windowStart, endTime: windowStart + sizeMs };
  }
}

// ─── Sliding Window ───────────────────────────────────────────────────────────
// Overlapping windows. Each item may appear in multiple windows.
// Emits a window every `slideMs` ms, covering the last `sizeMs` ms.

export async function* slidingWindow<T>(
  source: AsyncIterable<T>,
  sizeMs: number,
  slideMs: number,
  getTimestamp: TimestampFn<T> = defaultTimestamp,
): AsyncGenerator<WindowResult<T>> {
  const items: Array<{ item: T; ts: number }> = [];
  let nextWindowEnd: number | null = null;

  for await (const item of source) {
    const ts = getTimestamp(item);
    items.push({ item, ts });

    if (nextWindowEnd === null) {
      nextWindowEnd = ts + slideMs;
    }

    // Emit all windows that have ended
    while (ts >= nextWindowEnd) {
      const windowEnd = nextWindowEnd;
      const windowStart = windowEnd - sizeMs;
      const windowItems = items
        .filter((e) => e.ts >= windowStart && e.ts < windowEnd)
        .map((e) => e.item);

      if (windowItems.length > 0) {
        yield { items: windowItems, startTime: windowStart, endTime: windowEnd };
      }

      // Purge items older than the oldest active window
      const oldestWindowStart = windowEnd - sizeMs;
      while (items.length > 0 && items[0]!.ts < oldestWindowStart - sizeMs) {
        items.shift();
      }

      nextWindowEnd += slideMs;
    }
  }

  // Emit any remaining items as a final window
  if (items.length > 0) {
    const lastTs = items[items.length - 1]!.ts;
    const windowEnd = nextWindowEnd ?? lastTs + sizeMs;
    const windowStart = windowEnd - sizeMs;
    yield {
      items: items.filter((e) => e.ts >= windowStart).map((e) => e.item),
      startTime: windowStart,
      endTime: windowEnd,
    };
  }
}

// ─── Session Window ───────────────────────────────────────────────────────────
// Gap-based windows. A new window starts after a period of inactivity >= gapMs.

export async function* sessionWindow<T>(
  source: AsyncIterable<T>,
  gapMs: number,
  getTimestamp: TimestampFn<T> = defaultTimestamp,
): AsyncGenerator<WindowResult<T>> {
  let buffer: T[] = [];
  let lastTs: number | null = null;
  let windowStart: number | null = null;

  for await (const item of source) {
    const ts = getTimestamp(item);

    if (lastTs !== null && ts - lastTs >= gapMs) {
      // Gap detected: emit current session
      if (buffer.length > 0 && windowStart !== null) {
        yield { items: buffer, startTime: windowStart, endTime: lastTs };
        buffer = [];
        windowStart = null;
      }
    }

    if (windowStart === null) windowStart = ts;
    buffer.push(item);
    lastTs = ts;
  }

  // Emit final session
  if (buffer.length > 0 && windowStart !== null && lastTs !== null) {
    yield { items: buffer, startTime: windowStart, endTime: lastTs };
  }
}

// ─── Count Window ─────────────────────────────────────────────────────────────
// Groups exactly `size` items per window (non-overlapping).

export async function* countWindow<T>(
  source: AsyncIterable<T>,
  size: number,
): AsyncGenerator<WindowResult<T>> {
  let buffer: T[] = [];
  const startTime = Date.now();

  for await (const item of source) {
    buffer.push(item);
    if (buffer.length >= size) {
      const endTime = Date.now();
      yield { items: buffer, startTime, endTime };
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    yield { items: buffer, startTime, endTime: Date.now() };
  }
}

// ─── Window Aggregation ───────────────────────────────────────────────────────

export function aggregateWindow<T>(
  window: WindowResult<T>,
  valueFn: (item: T) => number,
): WindowAggregation {
  const values = window.items.map(valueFn);

  if (values.length === 0) {
    return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = sum / values.length;

  return { count: values.length, sum, avg, min, max };
}

// Aggregate a stream of windows
export async function* aggregateWindows<T>(
  windows: AsyncIterable<WindowResult<T>>,
  valueFn: (item: T) => number,
): AsyncGenerator<WindowResult<T> & { aggregation: WindowAggregation }> {
  for await (const w of windows) {
    yield { ...w, aggregation: aggregateWindow(w, valueFn) };
  }
}
