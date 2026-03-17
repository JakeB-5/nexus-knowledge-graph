import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../event-bus.js";
import type { Event } from "../types.js";

function makeEvent(type: string, payload: unknown = {}): Omit<Event, "timestamp"> {
  return { type, payload, source: "test" };
}

describe("EventBus – subscribe and publish", () => {
  it("calls handler when event type matches", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("node:created", handler);
    await bus.publish(makeEvent("node:created", { id: "1" }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not call handler for non-matching event type", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("node:created", handler);
    await bus.publish(makeEvent("edge:created"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes the full event to the handler", async () => {
    const bus = new EventBus();
    const received: Event[] = [];
    bus.subscribe("test:event", (e) => { received.push(e); });
    await bus.publish(makeEvent("test:event", { value: 42 }));
    expect(received).toHaveLength(1);
    expect((received[0]?.payload as { value: number }).value).toBe(42);
  });
});

describe("EventBus – wildcard subscriptions", () => {
  it("matches all events with '*' pattern", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("*", handler);
    await bus.publish(makeEvent("node:created"));
    await bus.publish(makeEvent("edge:deleted"));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("matches prefix with 'node:*' pattern", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("node:*", handler);
    await bus.publish(makeEvent("node:created"));
    await bus.publish(makeEvent("node:updated"));
    await bus.publish(makeEvent("edge:created"));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not match different prefix", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("node:*", handler);
    await bus.publish(makeEvent("edge:created"));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("EventBus – once subscriptions", () => {
  it("fires once then auto-unsubscribes", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once("test:event", handler);
    await bus.publish(makeEvent("test:event"));
    await bus.publish(makeEvent("test:event"));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("once returns the subscription", () => {
    const bus = new EventBus();
    const sub = bus.once("test:event", vi.fn());
    expect(sub.once).toBe(true);
    expect(sub.id).toBeTruthy();
  });
});

describe("EventBus – unsubscribe", () => {
  it("stops calling handler after unsubscribe", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const sub = bus.subscribe("test:event", handler);
    bus.unsubscribe(sub.id);
    await bus.publish(makeEvent("test:event"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns true when unsubscribing existing subscription", () => {
    const bus = new EventBus();
    const sub = bus.subscribe("test:event", vi.fn());
    expect(bus.unsubscribe(sub.id)).toBe(true);
  });

  it("returns false when unsubscribing non-existent subscription", () => {
    const bus = new EventBus();
    expect(bus.unsubscribe("nonexistent")).toBe(false);
  });

  it("unsubscribeAll removes all subscriptions", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("test:event", handler);
    bus.subscribe("test:event", handler);
    bus.unsubscribeAll("test:event");
    await bus.publish(makeEvent("test:event"));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("EventBus – async handlers", () => {
  it("awaits async handlers before returning", async () => {
    const bus = new EventBus();
    const results: string[] = [];
    bus.subscribe("test:event", async () => {
      await new Promise((r) => setTimeout(r, 10));
      results.push("done");
    });
    await bus.publish(makeEvent("test:event"));
    expect(results).toEqual(["done"]);
  });
});

describe("EventBus – handler priority", () => {
  it("calls higher priority handlers first", async () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.subscribe("test:event", () => { order.push(1); }, { priority: 1 });
    bus.subscribe("test:event", () => { order.push(10); }, { priority: 10 });
    bus.subscribe("test:event", () => { order.push(5); }, { priority: 5 });
    await bus.publish(makeEvent("test:event"));
    expect(order).toEqual([10, 5, 1]);
  });
});

describe("EventBus – error isolation", () => {
  it("continues calling other handlers when one throws", async () => {
    const bus = new EventBus();
    const secondHandler = vi.fn();
    bus.subscribe("test:event", () => { throw new Error("boom"); }, { priority: 10 });
    bus.subscribe("test:event", secondHandler, { priority: 1 });
    await bus.publish(makeEvent("test:event"));
    expect(secondHandler).toHaveBeenCalledOnce();
  });

  it("increments error metric on handler failure", async () => {
    const bus = new EventBus();
    bus.subscribe("test:event", () => { throw new Error("boom"); });
    await bus.publish(makeEvent("test:event"));
    expect(bus.getMetrics().handlerErrors).toBe(1);
  });
});

describe("EventBus – event history", () => {
  it("records published events in history", async () => {
    const bus = new EventBus();
    await bus.publish(makeEvent("a:b"));
    await bus.publish(makeEvent("c:d"));
    expect(bus.getHistory()).toHaveLength(2);
  });

  it("respects historySize limit", async () => {
    const bus = new EventBus({ historySize: 3 });
    for (let i = 0; i < 5; i++) await bus.publish(makeEvent("test:event"));
    expect(bus.getHistory()).toHaveLength(3);
  });

  it("filters history by type pattern", async () => {
    const bus = new EventBus();
    await bus.publish(makeEvent("node:created"));
    await bus.publish(makeEvent("edge:created"));
    const nodeEvents = bus.getHistory({ type: "node:*" });
    expect(nodeEvents).toHaveLength(1);
    expect(nodeEvents[0]?.type).toBe("node:created");
  });

  it("clearHistory empties the history", async () => {
    const bus = new EventBus();
    await bus.publish(makeEvent("test:event"));
    bus.clearHistory();
    expect(bus.getHistory()).toHaveLength(0);
  });
});

describe("EventBus – metrics", () => {
  it("tracks published events count", async () => {
    const bus = new EventBus();
    bus.subscribe("test:event", vi.fn());
    await bus.publish(makeEvent("test:event"));
    await bus.publish(makeEvent("test:event"));
    const m = bus.getMetrics();
    expect(m.published).toBe(2);
    expect(m.handlerCalls).toBe(2);
  });

  it("resetMetrics resets counters", async () => {
    const bus = new EventBus();
    await bus.publish(makeEvent("test:event"));
    bus.resetMetrics();
    expect(bus.getMetrics().published).toBe(0);
    expect(bus.getMetrics().handlerCalls).toBe(0);
  });
});

describe("EventBus – filter option", () => {
  it("only calls handler when filter returns true", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe(
      "node:created",
      handler,
      { filter: (e) => (e.payload as { important: boolean }).important === true }
    );
    await bus.publish(makeEvent("node:created", { important: false }));
    await bus.publish(makeEvent("node:created", { important: true }));
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("EventBus – waitFor", () => {
  it("resolves when event arrives", async () => {
    const bus = new EventBus();
    const promise = bus.waitFor("test:ready");
    await bus.publish(makeEvent("test:ready", { ok: true }));
    const event = await promise;
    expect((event.payload as { ok: boolean }).ok).toBe(true);
  });

  it("rejects on timeout", async () => {
    const bus = new EventBus();
    await expect(bus.waitFor("never:fires", undefined, 10)).rejects.toThrow("Timeout");
  });
});
