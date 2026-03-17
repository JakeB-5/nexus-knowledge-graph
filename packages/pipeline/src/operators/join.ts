// Join operators: inner join, left outer join, hash join, merge join,
// cross join, and window-based join.

export interface JoinResult<TLeft, TRight> {
  left: TLeft;
  right: TRight;
}

export interface LeftJoinResult<TLeft, TRight> {
  left: TLeft;
  right: TRight | null;
}

type KeyFn<T> = (item: T) => unknown;

// ─── Inner Join (Hash Join) ───────────────────────────────────────────────────
// Loads right side into a hash map, then streams left side matching.

export async function* innerJoin<TLeft, TRight>(
  left: AsyncIterable<TLeft>,
  right: AsyncIterable<TRight>,
  leftKey: KeyFn<TLeft>,
  rightKey: KeyFn<TRight>,
): AsyncGenerator<JoinResult<TLeft, TRight>> {
  // Build hash table from right
  const rightMap = new Map<unknown, TRight[]>();
  for await (const item of right) {
    const key = rightKey(item);
    const bucket = rightMap.get(key) ?? [];
    bucket.push(item);
    rightMap.set(key, bucket);
  }

  // Probe with left
  for await (const leftItem of left) {
    const key = leftKey(leftItem);
    const matches = rightMap.get(key);
    if (matches) {
      for (const rightItem of matches) {
        yield { left: leftItem, right: rightItem };
      }
    }
  }
}

// ─── Left Outer Join ──────────────────────────────────────────────────────────

export async function* leftOuterJoin<TLeft, TRight>(
  left: AsyncIterable<TLeft>,
  right: AsyncIterable<TRight>,
  leftKey: KeyFn<TLeft>,
  rightKey: KeyFn<TRight>,
): AsyncGenerator<LeftJoinResult<TLeft, TRight>> {
  const rightMap = new Map<unknown, TRight[]>();
  for await (const item of right) {
    const key = rightKey(item);
    const bucket = rightMap.get(key) ?? [];
    bucket.push(item);
    rightMap.set(key, bucket);
  }

  for await (const leftItem of left) {
    const key = leftKey(leftItem);
    const matches = rightMap.get(key);
    if (matches && matches.length > 0) {
      for (const rightItem of matches) {
        yield { left: leftItem, right: rightItem };
      }
    } else {
      yield { left: leftItem, right: null };
    }
  }
}

// ─── Hash Join (explicit, same as innerJoin but returns flat tuples) ──────────

export async function hashJoin<TLeft, TRight>(
  left: TLeft[],
  right: TRight[],
  leftKey: KeyFn<TLeft>,
  rightKey: KeyFn<TRight>,
): Promise<JoinResult<TLeft, TRight>[]> {
  const rightMap = new Map<unknown, TRight[]>();
  for (const item of right) {
    const key = rightKey(item);
    const bucket = rightMap.get(key) ?? [];
    bucket.push(item);
    rightMap.set(key, bucket);
  }

  const results: JoinResult<TLeft, TRight>[] = [];
  for (const leftItem of left) {
    const key = leftKey(leftItem);
    const matches = rightMap.get(key);
    if (matches) {
      for (const rightItem of matches) {
        results.push({ left: leftItem, right: rightItem });
      }
    }
  }
  return results;
}

// ─── Merge Join (for pre-sorted sources) ─────────────────────────────────────
// Both left and right must be sorted by the same key in ascending order.

export async function* mergeJoin<TLeft, TRight>(
  left: AsyncIterable<TLeft>,
  right: AsyncIterable<TRight>,
  leftKey: KeyFn<TLeft>,
  rightKey: KeyFn<TRight>,
  compare: (a: unknown, b: unknown) => number = defaultCompare,
): AsyncGenerator<JoinResult<TLeft, TRight>> {
  const leftIter = left[Symbol.asyncIterator]();
  const rightIter = right[Symbol.asyncIterator]();

  let leftResult = await leftIter.next();
  let rightResult = await rightIter.next();

  // Buffer for right items with the same key (for many-to-many)
  let rightBuffer: TRight[] = [];
  const NO_KEY = Object.create(null) as object;
  let rightBufferKey: unknown = NO_KEY;

  // Loop continues while left has items; right may be exhausted but buffer may still be valid
  while (!leftResult.done) {
    const lKey = leftKey(leftResult.value);

    if (!rightResult.done) {
      const rKey = rightKey(rightResult.value);
      const cmp = compare(lKey, rKey);

      if (cmp === 0) {
        // Collect all right items with this key into buffer (if not already buffered)
        if (rightBufferKey === NO_KEY || compare(rightBufferKey, rKey) !== 0) {
          rightBuffer = [rightResult.value];
          rightBufferKey = rKey;
          rightResult = await rightIter.next();
          while (!rightResult.done && compare(rightKey(rightResult.value), rKey) === 0) {
            rightBuffer.push(rightResult.value);
            rightResult = await rightIter.next();
          }
        }
        // Emit all combinations for this left item
        for (const rightItem of rightBuffer) {
          yield { left: leftResult.value, right: rightItem };
        }
        leftResult = await leftIter.next();
      } else if (cmp < 0) {
        leftResult = await leftIter.next();
      } else {
        rightResult = await rightIter.next();
      }
    } else {
      // Right exhausted — check if buffered key matches current left key
      if (rightBuffer.length > 0 && rightBufferKey !== NO_KEY && compare(rightBufferKey, lKey) === 0) {
        for (const rightItem of rightBuffer) {
          yield { left: leftResult.value, right: rightItem };
        }
      }
      leftResult = await leftIter.next();
    }
  }
}

function defaultCompare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : 1;
  return String(a) < String(b) ? -1 : 1;
}

// ─── Cross Join ───────────────────────────────────────────────────────────────
// Every combination of left × right.

export async function* crossJoin<TLeft, TRight>(
  left: AsyncIterable<TLeft>,
  right: TRight[], // right must be materialised for cross join
): AsyncGenerator<JoinResult<TLeft, TRight>> {
  for await (const leftItem of left) {
    for (const rightItem of right) {
      yield { left: leftItem, right: rightItem };
    }
  }
}

// ─── Window-based Join ────────────────────────────────────────────────────────
// Joins events from two streams if their timestamps fall within `windowMs` of each other.

export interface TimestampedItem<T> {
  item: T;
  timestamp: number;
}

export async function* windowJoin<TLeft, TRight>(
  left: AsyncIterable<TimestampedItem<TLeft>>,
  right: AsyncIterable<TimestampedItem<TRight>>,
  leftKey: KeyFn<TLeft>,
  rightKey: KeyFn<TRight>,
  windowMs: number,
): AsyncGenerator<JoinResult<TLeft, TRight>> {
  // Materialise both streams with timestamps
  const leftItems: TimestampedItem<TLeft>[] = [];
  const rightItems: TimestampedItem<TRight>[] = [];

  // Collect left
  for await (const item of left) leftItems.push(item);
  // Collect right
  for await (const item of right) rightItems.push(item);

  // Hash right by key
  const rightByKey = new Map<unknown, TimestampedItem<TRight>[]>();
  for (const r of rightItems) {
    const key = rightKey(r.item);
    const bucket = rightByKey.get(key) ?? [];
    bucket.push(r);
    rightByKey.set(key, bucket);
  }

  // Match left items to right items within window
  for (const l of leftItems) {
    const key = leftKey(l.item);
    const candidates = rightByKey.get(key);
    if (!candidates) continue;
    for (const r of candidates) {
      if (Math.abs(l.timestamp - r.timestamp) <= windowMs) {
        yield { left: l.item, right: r.item };
      }
    }
  }
}
