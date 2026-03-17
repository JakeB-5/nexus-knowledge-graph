// Source implementations for the pipeline package.

// ─── Array source ─────────────────────────────────────────────────────────────

export async function* arraySource<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

// ─── Iterable source ──────────────────────────────────────────────────────────

export async function* iterableSource<T>(iterable: Iterable<T>): AsyncGenerator<T> {
  for (const item of iterable) yield item;
}

// ─── Generator source ─────────────────────────────────────────────────────────

export async function* generatorSource<T>(
  fn: () => Generator<T> | AsyncGenerator<T>,
): AsyncGenerator<T> {
  yield* fn();
}

// ─── Interval source ──────────────────────────────────────────────────────────

/**
 * Emits values produced by `fn` every `ms` milliseconds.
 * Stops after `count` emissions (default: Infinity).
 */
export async function* intervalSource<T>(
  ms: number,
  fn: (tick: number) => T,
  count = Infinity,
): AsyncGenerator<T> {
  let tick = 0;
  while (tick < count) {
    yield fn(tick);
    tick++;
    if (tick < count) {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }
  }
}

// ─── Merge source ─────────────────────────────────────────────────────────────

/**
 * Merges multiple async sources concurrently. Items are emitted in arrival order.
 */
export async function* mergeSource<T>(
  ...sources: Array<AsyncIterable<T>>
): AsyncGenerator<T> {
  const queue: T[] = [];
  let done = 0;
  const total = sources.length;

  if (total === 0) return;

  let resolve: (() => void) | null = null;
  const wait = () =>
    new Promise<void>((r) => {
      resolve = r;
    });

  const notify = () => {
    if (resolve) {
      const r = resolve;
      resolve = null;
      r();
    }
  };

  // Start all sources concurrently
  const tasks = sources.map(async (source) => {
    for await (const item of source) {
      queue.push(item);
      notify();
    }
    done++;
    notify();
  });

  // Drain queue as items arrive
  while (done < total || queue.length > 0) {
    while (queue.length > 0) {
      yield queue.shift()!;
    }
    if (done < total) {
      await wait();
    }
  }

  await Promise.all(tasks);
}

// ─── Concat source ────────────────────────────────────────────────────────────

/**
 * Concatenates multiple sources sequentially (exhausts each before the next).
 */
export async function* concatSource<T>(
  ...sources: Array<AsyncIterable<T>>
): AsyncGenerator<T> {
  for (const source of sources) {
    yield* source;
  }
}

// ─── Empty source ─────────────────────────────────────────────────────────────

export async function* emptySource<T>(): AsyncGenerator<T> {
  // yields nothing
}

// ─── Range source ─────────────────────────────────────────────────────────────

/**
 * Emits integers from `start` to `end` (exclusive) with optional `step`.
 */
export async function* rangeSource(
  start: number,
  end: number,
  step = 1,
): AsyncGenerator<number> {
  if (step === 0) throw new Error('step must not be zero');
  if (step > 0) {
    for (let i = start; i < end; i += step) yield i;
  } else {
    for (let i = start; i > end; i += step) yield i;
  }
}

// ─── From async iterable ──────────────────────────────────────────────────────

export async function* fromAsyncIterable<T>(
  source: AsyncIterable<T>,
): AsyncGenerator<T> {
  yield* source;
}

// ─── Repeat source ────────────────────────────────────────────────────────────

/**
 * Repeats a value `count` times.
 */
export async function* repeatSource<T>(value: T, count: number): AsyncGenerator<T> {
  for (let i = 0; i < count; i++) yield value;
}
