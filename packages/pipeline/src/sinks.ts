// Sink implementations: collect output from an async source.

// ─── Array sink ───────────────────────────────────────────────────────────────

export async function arraySink<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of source) {
    result.push(item);
  }
  return result;
}

// ─── Callback sink ────────────────────────────────────────────────────────────

export async function callbackSink<T>(
  source: AsyncIterable<T>,
  fn: (item: T) => void | Promise<void>,
): Promise<void> {
  for await (const item of source) {
    await fn(item);
  }
}

// ─── Console sink ─────────────────────────────────────────────────────────────

export async function consoleSink<T>(
  source: AsyncIterable<T>,
  label?: string,
): Promise<void> {
  for await (const item of source) {
    if (label) {
      console.log(`[${label}]`, item);
    } else {
      console.log(item);
    }
  }
}

// ─── Null sink ────────────────────────────────────────────────────────────────

export async function nullSink<T>(source: AsyncIterable<T>): Promise<void> {
  // Discard all items
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _item of source) {
    // do nothing
  }
}

// ─── First sink ───────────────────────────────────────────────────────────────

export async function firstSink<T>(source: AsyncIterable<T>): Promise<T | undefined> {
  for await (const item of source) {
    return item;
  }
  return undefined;
}

// ─── Last sink ────────────────────────────────────────────────────────────────

export async function lastSink<T>(source: AsyncIterable<T>): Promise<T | undefined> {
  let last: T | undefined;
  for await (const item of source) {
    last = item;
  }
  return last;
}

// ─── Reduce sink ──────────────────────────────────────────────────────────────

export async function reduceSink<T, TAcc>(
  source: AsyncIterable<T>,
  fn: (acc: TAcc, item: T) => TAcc | Promise<TAcc>,
  initial: TAcc,
): Promise<TAcc> {
  let acc = initial;
  for await (const item of source) {
    acc = await fn(acc, item);
  }
  return acc;
}

// ─── Batch sink ───────────────────────────────────────────────────────────────

export async function batchSink<T>(
  source: AsyncIterable<T>,
  fn: (batch: T[]) => void | Promise<void>,
  size: number,
): Promise<void> {
  let batch: T[] = [];
  for await (const item of source) {
    batch.push(item);
    if (batch.length >= size) {
      await fn(batch);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await fn(batch);
  }
}

// ─── Count sink ───────────────────────────────────────────────────────────────

export async function countSink<T>(source: AsyncIterable<T>): Promise<number> {
  let count = 0;
  for await (const _item of source) {
    count++;
  }
  return count;
}

// ─── Collect into Map sink ────────────────────────────────────────────────────

export async function groupBySink<T, K>(
  source: AsyncIterable<T>,
  keyFn: (item: T) => K,
): Promise<Map<K, T[]>> {
  const map = new Map<K, T[]>();
  for await (const item of source) {
    const key = keyFn(item);
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}
