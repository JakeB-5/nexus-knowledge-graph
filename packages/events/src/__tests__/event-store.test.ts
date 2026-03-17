import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore } from "../event-store.js";
import type { Event } from "../types.js";

function makeEvent(
  type: string,
  overrides: Partial<Event> = {}
): Omit<Event, "sequence"> {
  return {
    type,
    payload: {},
    source: "test",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("InMemoryEventStore – append", () => {
  it("appends an event and assigns a sequence number", async () => {
    const store = new InMemoryEventStore();
    const event = await store.append(makeEvent("node:created"));
    expect(event.sequence).toBe(1);
  });

  it("increments sequence on each append", async () => {
    const store = new InMemoryEventStore();
    const e1 = await store.append(makeEvent("a"));
    const e2 = await store.append(makeEvent("b"));
    expect(e1.sequence).toBe(1);
    expect(e2.sequence).toBe(2);
  });

  it("preserves payload and metadata", async () => {
    const store = new InMemoryEventStore();
    const event = await store.append(
      makeEvent("node:created", {
        payload: { id: "n1" },
        aggregateId: "n1",
        aggregateType: "Node",
      })
    );
    expect((event.payload as { id: string }).id).toBe("n1");
    expect(event.aggregateId).toBe("n1");
  });
});

describe("InMemoryEventStore – query", () => {
  let store: InMemoryEventStore;

  beforeEach(async () => {
    store = new InMemoryEventStore();
    await store.append(makeEvent("node:created", { source: "svc-a", aggregateId: "n1", aggregateType: "Node" }));
    await store.append(makeEvent("node:updated", { source: "svc-a", aggregateId: "n1", aggregateType: "Node" }));
    await store.append(makeEvent("edge:created", { source: "svc-b", aggregateId: "e1", aggregateType: "Edge" }));
    await store.append(makeEvent("node:deleted", { source: "svc-a", aggregateId: "n1", aggregateType: "Node" }));
  });

  it("returns all events when no filter given", async () => {
    const page = await store.query({});
    expect(page.events).toHaveLength(4);
  });

  it("filters by type", async () => {
    const page = await store.query({ types: ["node:created"] });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]?.type).toBe("node:created");
  });

  it("filters by multiple types", async () => {
    const page = await store.query({ types: ["node:created", "edge:created"] });
    expect(page.events).toHaveLength(2);
  });

  it("filters by source", async () => {
    const page = await store.query({ source: "svc-b" });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]?.type).toBe("edge:created");
  });

  it("filters by aggregateId", async () => {
    const page = await store.query({ aggregateId: "n1" });
    expect(page.events).toHaveLength(3);
  });

  it("filters by aggregateType", async () => {
    const page = await store.query({ aggregateType: "Edge" });
    expect(page.events).toHaveLength(1);
  });

  it("filters by fromSequence", async () => {
    const page = await store.query({ fromSequence: 3 });
    expect(page.events).toHaveLength(2);
  });

  it("filters by toSequence", async () => {
    const page = await store.query({ toSequence: 2 });
    expect(page.events).toHaveLength(2);
  });

  it("respects limit", async () => {
    const page = await store.query({ limit: 2 });
    expect(page.events).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
  });

  it("paginates with cursor", async () => {
    const page1 = await store.query({ limit: 2 });
    expect(page1.hasMore).toBe(true);
    const page2 = await store.query({ limit: 2, cursor: page1.nextCursor });
    expect(page2.events).toHaveLength(2);
    expect(page2.hasMore).toBe(false);
  });
});

describe("InMemoryEventStore – stream", () => {
  it("streams all matching events", async () => {
    const store = new InMemoryEventStore();
    await store.append(makeEvent("a"));
    await store.append(makeEvent("b"));
    await store.append(makeEvent("a"));

    const collected: Event[] = [];
    await store.stream({ types: ["a"] }, (e) => { collected.push(e as Event); });
    expect(collected).toHaveLength(2);
  });

  it("streams in batches via cursor", async () => {
    const store = new InMemoryEventStore();
    for (let i = 0; i < 10; i++) await store.append(makeEvent("test"));

    const collected: Event[] = [];
    await store.stream({ limit: 3 }, (e) => { collected.push(e as Event); });
    expect(collected).toHaveLength(10);
  });
});

describe("InMemoryEventStore – aggregate", () => {
  it("rebuilds state from events", async () => {
    const store = new InMemoryEventStore();
    await store.append(makeEvent("count:inc", { aggregateId: "counter", payload: { delta: 1 } }));
    await store.append(makeEvent("count:inc", { aggregateId: "counter", payload: { delta: 2 } }));
    await store.append(makeEvent("count:inc", { aggregateId: "counter", payload: { delta: 3 } }));

    interface CounterState { total: number }
    const state = await store.aggregate<CounterState>(
      "counter",
      (s, e) => ({ total: s.total + (e.payload as { delta: number }).delta }),
      { total: 0 }
    );
    expect(state.total).toBe(6);
  });
});

describe("InMemoryEventStore – snapshots", () => {
  it("saves and retrieves a snapshot", async () => {
    const store = new InMemoryEventStore();
    store.saveSnapshot({
      aggregateId: "n1",
      aggregateType: "Node",
      version: 5,
      state: { count: 5 },
      timestamp: new Date().toISOString(),
    });
    const snap = store.getSnapshot("n1");
    expect(snap?.version).toBe(5);
    expect((snap?.state as { count: number }).count).toBe(5);
  });

  it("uses snapshot as starting point for aggregate", async () => {
    const store = new InMemoryEventStore();
    // Append events 1–3
    for (let i = 1; i <= 3; i++) {
      await store.append(makeEvent("count:inc", {
        aggregateId: "counter",
        payload: { delta: i },
        aggregateVersion: i,
      }));
    }
    // Save snapshot at version 3
    store.saveSnapshot({
      aggregateId: "counter",
      aggregateType: "Counter",
      version: 3,
      state: { total: 6 },
      timestamp: new Date().toISOString(),
    });
    // Append more events
    await store.append(makeEvent("count:inc", {
      aggregateId: "counter",
      payload: { delta: 10 },
      aggregateVersion: 4,
    }));

    interface CounterState { total: number }
    const state = await store.aggregate<CounterState>(
      "counter",
      (s, e) => ({ total: s.total + (e.payload as { delta: number }).delta }),
      { total: 0 }
    );
    expect(state.total).toBe(16); // 6 (from snapshot) + 10
  });
});

describe("InMemoryEventStore – replay", () => {
  it("replays events through a reducer", async () => {
    const store = new InMemoryEventStore();
    await store.append(makeEvent("item:added", { payload: { name: "apple" } }));
    await store.append(makeEvent("item:added", { payload: { name: "banana" } }));
    await store.append(makeEvent("item:removed", { payload: { name: "apple" } }));

    const state = await store.replay(
      { types: ["item:added", "item:removed"] },
      (s: string[], e) => {
        if (e.type === "item:added") return [...s, (e.payload as { name: string }).name];
        if (e.type === "item:removed") return s.filter((x) => x !== (e.payload as { name: string }).name);
        return s;
      },
      [] as string[]
    );
    expect(state).toEqual(["banana"]);
  });
});

describe("InMemoryEventStore – compaction", () => {
  it("removes events older than snapshot version", async () => {
    const store = new InMemoryEventStore();
    for (let i = 1; i <= 5; i++) {
      await store.append(makeEvent("ev", {
        aggregateId: "agg1",
        aggregateVersion: i,
      }));
    }
    store.saveSnapshot({
      aggregateId: "agg1",
      aggregateType: "T",
      version: 3,
      state: {},
      timestamp: new Date().toISOString(),
    });
    const removed = await store.compact();
    expect(removed).toBe(3); // versions 1, 2, 3 removed
    const page = await store.query({ aggregateId: "agg1" });
    expect(page.events).toHaveLength(2); // versions 4, 5 remain
  });
});

describe("InMemoryEventStore – count", () => {
  it("counts all events", async () => {
    const store = new InMemoryEventStore();
    await store.append(makeEvent("a"));
    await store.append(makeEvent("b"));
    expect(await store.count()).toBe(2);
  });

  it("counts filtered events", async () => {
    const store = new InMemoryEventStore();
    await store.append(makeEvent("a"));
    await store.append(makeEvent("b"));
    expect(await store.count({ types: ["a"] })).toBe(1);
  });
});
