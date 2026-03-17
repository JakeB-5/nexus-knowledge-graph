import { describe, it, expect } from 'vitest';
import {
  innerJoin,
  leftOuterJoin,
  hashJoin,
  mergeJoin,
  crossJoin,
  windowJoin,
} from '../operators/join.js';

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of gen) result.push(item);
  return result;
}

async function* fromArray<T>(arr: T[]): AsyncGenerator<T> {
  for (const item of arr) yield item;
}

interface User {
  id: number;
  name: string;
}

interface Order {
  userId: number;
  item: string;
}

describe('innerJoin', () => {
  const users: User[] = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Carol' },
  ];

  const orders: Order[] = [
    { userId: 1, item: 'Widget' },
    { userId: 2, item: 'Gadget' },
    { userId: 1, item: 'Doohickey' },
  ];

  it('joins matching items', async () => {
    const result = await collect(
      innerJoin(fromArray(users), fromArray(orders), (u) => u.id, (o) => o.userId),
    );
    expect(result).toHaveLength(3);
    const aliceOrders = result.filter((r) => r.left.name === 'Alice');
    expect(aliceOrders).toHaveLength(2);
  });

  it('excludes non-matching left items', async () => {
    const result = await collect(
      innerJoin(fromArray(users), fromArray(orders), (u) => u.id, (o) => o.userId),
    );
    // Carol (id=3) has no orders
    const carolResults = result.filter((r) => r.left.name === 'Carol');
    expect(carolResults).toHaveLength(0);
  });

  it('returns empty when no matches', async () => {
    const result = await collect(
      innerJoin(
        fromArray([{ id: 99, name: 'X' }]),
        fromArray(orders),
        (u) => u.id,
        (o) => o.userId,
      ),
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty when right is empty', async () => {
    const result = await collect(
      innerJoin(fromArray(users), fromArray([]), (u) => u.id, (o: Order) => o.userId),
    );
    expect(result).toHaveLength(0);
  });
});

describe('leftOuterJoin', () => {
  const users: User[] = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Carol' },
  ];

  const orders: Order[] = [
    { userId: 1, item: 'Widget' },
    { userId: 2, item: 'Gadget' },
  ];

  it('includes all left items', async () => {
    const result = await collect(
      leftOuterJoin(fromArray(users), fromArray(orders), (u) => u.id, (o) => o.userId),
    );
    const names = result.map((r) => r.left.name);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
    expect(names).toContain('Carol');
  });

  it('null right for non-matching left', async () => {
    const result = await collect(
      leftOuterJoin(fromArray(users), fromArray(orders), (u) => u.id, (o) => o.userId),
    );
    const carolResult = result.find((r) => r.left.name === 'Carol');
    expect(carolResult).toBeDefined();
    expect(carolResult!.right).toBe(null);
  });

  it('matches right for matching left', async () => {
    const result = await collect(
      leftOuterJoin(fromArray(users), fromArray(orders), (u) => u.id, (o) => o.userId),
    );
    const aliceResult = result.find((r) => r.left.name === 'Alice');
    expect(aliceResult?.right?.item).toBe('Widget');
  });
});

describe('hashJoin', () => {
  it('joins two arrays by key', async () => {
    const left = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const right = [{ ref: 1, val: 'a' }, { ref: 2, val: 'b' }, { ref: 1, val: 'c' }];
    const result = await hashJoin(left, right, (l) => l.id, (r) => r.ref);
    expect(result).toHaveLength(3);
    const id1 = result.filter((r) => r.left.id === 1);
    expect(id1).toHaveLength(2);
  });

  it('returns empty for no matches', async () => {
    const result = await hashJoin(
      [{ id: 99 }],
      [{ ref: 1, val: 'x' }],
      (l) => l.id,
      (r) => r.ref,
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty for empty inputs', async () => {
    const result = await hashJoin([], [], (x: { id: number }) => x.id, (x: { id: number }) => x.id);
    expect(result).toHaveLength(0);
  });
});

describe('mergeJoin', () => {
  it('joins pre-sorted arrays', async () => {
    const left = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const right = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 4, v: 'c' }];

    const result = await collect(
      mergeJoin(fromArray(left), fromArray(right), (l) => l.id, (r) => r.id),
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.right.v).toBe('a');
    expect(result[1]!.right.v).toBe('b');
  });

  it('handles many-to-many matches', async () => {
    const left = [{ id: 1 }, { id: 1 }];
    const right = [{ id: 1, v: 'x' }, { id: 1, v: 'y' }];

    const result = await collect(
      mergeJoin(fromArray(left), fromArray(right), (l) => l.id, (r) => r.id),
    );

    expect(result).toHaveLength(4);
  });

  it('returns empty for no overlap', async () => {
    const left = [{ id: 1 }, { id: 2 }];
    const right = [{ id: 5 }, { id: 6 }];

    const result = await collect(
      mergeJoin(fromArray(left), fromArray(right), (l) => l.id, (r) => r.id),
    );

    expect(result).toHaveLength(0);
  });
});

describe('crossJoin', () => {
  it('produces all combinations', async () => {
    const left = [1, 2, 3];
    const right = ['a', 'b'];

    const result = await collect(crossJoin(fromArray(left), right));
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ left: 1, right: 'a' });
    expect(result[1]).toEqual({ left: 1, right: 'b' });
    expect(result[2]).toEqual({ left: 2, right: 'a' });
  });

  it('returns empty when right is empty', async () => {
    const result = await collect(crossJoin(fromArray([1, 2]), []));
    expect(result).toHaveLength(0);
  });

  it('returns empty when left is empty', async () => {
    const result = await collect(crossJoin(fromArray<number>([]), [1, 2]));
    expect(result).toHaveLength(0);
  });
});

describe('windowJoin', () => {
  it('joins events within time window', async () => {
    const leftEvents = [
      { item: { id: 1, name: 'A' }, timestamp: 100 },
      { item: { id: 2, name: 'B' }, timestamp: 200 },
    ];
    const rightEvents = [
      { item: { ref: 1, value: 'x' }, timestamp: 110 },  // within 50ms of left[0]
      { item: { ref: 1, value: 'y' }, timestamp: 300 },  // >50ms from left[0]
      { item: { ref: 2, value: 'z' }, timestamp: 210 },  // within 50ms of left[1]
    ];

    const result = await collect(
      windowJoin(
        fromArray(leftEvents),
        fromArray(rightEvents),
        (l) => l.id,
        (r) => r.ref,
        50,
      ),
    );

    expect(result).toHaveLength(2);
    const joined1 = result.find((r) => r.left.name === 'A');
    expect(joined1?.right.value).toBe('x');
    const joined2 = result.find((r) => r.left.name === 'B');
    expect(joined2?.right.value).toBe('z');
  });

  it('excludes events outside window', async () => {
    const leftEvents = [{ item: { id: 1 }, timestamp: 0 }];
    const rightEvents = [{ item: { id: 1, val: 'far' }, timestamp: 10000 }];

    const result = await collect(
      windowJoin(fromArray(leftEvents), fromArray(rightEvents), (l) => l.id, (r) => r.id, 100),
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty when no key matches', async () => {
    const leftEvents = [{ item: { id: 1 }, timestamp: 100 }];
    const rightEvents = [{ item: { id: 99 }, timestamp: 100 }];

    const result = await collect(
      windowJoin(fromArray(leftEvents), fromArray(rightEvents), (l) => l.id, (r) => r.id, 1000),
    );
    expect(result).toHaveLength(0);
  });
});
