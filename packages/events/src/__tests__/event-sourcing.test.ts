import { describe, it, expect } from "vitest";
import { NodeAggregate, EdgeAggregate, AggregateRepository } from "../event-sourcing.js";
import { InMemoryEventStore } from "../event-store.js";

describe("NodeAggregate – create", () => {
  it("creates a node and updates state", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", { name: "Alice" });
    expect(node.state.type).toBe("Person");
    expect(node.state.properties["name"]).toBe("Alice");
    expect(node.state.deleted).toBe(false);
    expect(node.version).toBe(1);
  });

  it("emits a node:created event", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", { name: "Alice" }, "api");
    const events = node.pendingEvents;
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("node:created");
    expect(events[0]?.source).toBe("api");
    expect(events[0]?.aggregateId).toBe("n1");
    expect(events[0]?.aggregateType).toBe("Node");
    expect(events[0]?.aggregateVersion).toBe(1);
  });

  it("throws when creating an already-existing node", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", {});
    expect(() => node.create("Person", {})).toThrow("already exists");
  });
});

describe("NodeAggregate – update", () => {
  it("updates node properties", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", { name: "Alice" });
    node.update({ name: "Bob", age: 30 });
    expect(node.state.properties["name"]).toBe("Bob");
    expect(node.state.properties["age"]).toBe(30);
    expect(node.version).toBe(2);
  });

  it("emits a node:updated event", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", {});
    node.update({ name: "Bob" });
    const events = node.pendingEvents;
    expect(events[1]?.type).toBe("node:updated");
  });

  it("merges existing properties with changes", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", { name: "Alice", age: 25 });
    node.update({ age: 26 });
    expect(node.state.properties["name"]).toBe("Alice");
    expect(node.state.properties["age"]).toBe(26);
  });
});

describe("NodeAggregate – delete", () => {
  it("marks node as deleted", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", {});
    node.delete();
    expect(node.state.deleted).toBe(true);
  });

  it("throws when updating a deleted node", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", {});
    node.delete();
    expect(() => node.update({ name: "Bob" })).toThrow("deleted");
  });

  it("throws when deleting already deleted node", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", {});
    node.delete();
    expect(() => node.delete()).toThrow("already deleted");
  });
});

describe("NodeAggregate – replayEvents", () => {
  it("rebuilds state from a sequence of events", () => {
    const original = new NodeAggregate("n1");
    original.create("Person", { name: "Alice" });
    original.update({ age: 30 });
    const events = original.pendingEvents;

    const replica = new NodeAggregate("n1");
    replica.replayEvents(events);

    expect(replica.state.type).toBe("Person");
    expect(replica.state.properties["name"]).toBe("Alice");
    expect(replica.state.properties["age"]).toBe(30);
    expect(replica.version).toBe(2);
  });
});

describe("NodeAggregate – snapshot", () => {
  it("creates a snapshot of current state", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", { name: "Alice" });
    const snap = node.createSnapshot();
    expect(snap.aggregateId).toBe("n1");
    expect(snap.version).toBe(1);
    expect((snap.state as { type: string }).type).toBe("Person");
  });

  it("restores state from snapshot and replays newer events", () => {
    const node = new NodeAggregate("n1");
    node.create("Person", { name: "Alice" });
    const snap = node.createSnapshot();
    node.clearPendingEvents();

    node.update({ age: 30 });
    const newerEvents = node.pendingEvents;

    const restored = new NodeAggregate("n1");
    restored.restoreFromSnapshot(snap, newerEvents);

    expect(restored.state.properties["name"]).toBe("Alice");
    expect(restored.state.properties["age"]).toBe(30);
    expect(restored.version).toBe(2);
  });
});

describe("EdgeAggregate – create and delete", () => {
  it("creates an edge", () => {
    const edge = new EdgeAggregate("e1");
    edge.create("n1", "n2", "knows", { weight: 1 });
    expect(edge.state.source).toBe("n1");
    expect(edge.state.target).toBe("n2");
    expect(edge.state.type).toBe("knows");
    expect(edge.state.properties["weight"]).toBe(1);
    expect(edge.state.deleted).toBe(false);
  });

  it("emits edge:created event", () => {
    const edge = new EdgeAggregate("e1");
    edge.create("n1", "n2", "knows");
    expect(edge.pendingEvents[0]?.type).toBe("edge:created");
    expect(edge.pendingEvents[0]?.aggregateType).toBe("Edge");
  });

  it("deletes an edge", () => {
    const edge = new EdgeAggregate("e1");
    edge.create("n1", "n2", "knows");
    edge.delete();
    expect(edge.state.deleted).toBe(true);
    expect(edge.pendingEvents[1]?.type).toBe("edge:deleted");
  });

  it("throws when deleting already deleted edge", () => {
    const edge = new EdgeAggregate("e1");
    edge.create("n1", "n2", "knows");
    edge.delete();
    expect(() => edge.delete()).toThrow("already deleted");
  });

  it("throws when creating an already existing edge", () => {
    const edge = new EdgeAggregate("e1");
    edge.create("n1", "n2", "knows");
    expect(() => edge.create("n1", "n2", "knows")).toThrow("already exists");
  });
});

describe("AggregateRepository – load and save", () => {
  it("saves events to store and reloads aggregate", async () => {
    const store = new InMemoryEventStore();
    const repo = new AggregateRepository(store, (id) => new NodeAggregate(id));

    const node = new NodeAggregate("n1");
    node.create("Person", { name: "Alice" });
    node.update({ age: 25 });
    await repo.save(node);

    // Pending events cleared after save
    expect(node.pendingEvents).toHaveLength(0);

    // Reload from store
    const loaded = await repo.load("n1");
    expect(loaded.state.type).toBe("Person");
    expect(loaded.state.properties["name"]).toBe("Alice");
    expect(loaded.state.properties["age"]).toBe(25);
    expect(loaded.version).toBe(2);
  });

  it("loads fresh aggregate when no events exist", async () => {
    const store = new InMemoryEventStore();
    const repo = new AggregateRepository(store, (id) => new NodeAggregate(id));
    const loaded = await repo.load("nonexistent");
    expect(loaded.state.deleted).toBe(false);
    expect(loaded.version).toBe(0);
  });

  it("uses snapshot when available", async () => {
    const store = new InMemoryEventStore();

    // Seed 3 events manually
    const node = new NodeAggregate("n1");
    node.create("Person", { name: "Alice" });
    node.update({ age: 25 });
    node.update({ city: "Seoul" });
    for (const e of node.pendingEvents) await store.append(e);
    node.clearPendingEvents();

    // Save snapshot at version 3
    store.saveSnapshot({
      aggregateId: "n1",
      aggregateType: "Node",
      version: 3,
      state: node.state,
      timestamp: new Date().toISOString(),
    });

    // Append one more event after snapshot
    const node2 = new NodeAggregate("n1");
    node2.replayEvents(await (await store.query({ aggregateId: "n1" })).events);
    node2.update({ country: "KR" });
    for (const e of node2.pendingEvents) await store.append(e);

    const repo = new AggregateRepository(store, (id) => new NodeAggregate(id));
    const loaded = await repo.load("n1");
    expect(loaded.state.properties["city"]).toBe("Seoul");
    expect(loaded.state.properties["country"]).toBe("KR");
  });
});
