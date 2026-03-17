import { describe, it, expect, vi } from "vitest";
import { StateMachine, createMachine } from "../state-machine.js";
import type { StateMachineDefinition, BaseEvent } from "../types.js";

interface TrafficContext {
  count: number;
}

type TrafficEvent =
  | { type: "NEXT" }
  | { type: "RESET" };

type TrafficBaseEvent = TrafficEvent & BaseEvent;

function makeTrafficLight(): StateMachineDefinition<TrafficContext, TrafficBaseEvent> {
  return {
    id: "traffic-light",
    initial: "red",
    context: { count: 0 },
    final: [],
    states: new Map([
      ["red", { id: "red", type: "initial" }],
      ["green", { id: "green" }],
      ["yellow", { id: "yellow" }],
    ]),
    transitions: [
      { from: "red", event: "NEXT", to: "green" },
      { from: "green", event: "NEXT", to: "yellow" },
      { from: "yellow", event: "NEXT", to: "red" },
      { from: "red", event: "RESET", to: "red" },
      { from: "green", event: "RESET", to: "red" },
      { from: "yellow", event: "RESET", to: "red" },
    ],
  };
}

describe("StateMachine", () => {
  describe("basic transitions", () => {
    it("starts in initial state", () => {
      const m = createMachine(makeTrafficLight());
      expect(m.currentState).toBe("red");
    });

    it("transitions on event", () => {
      const m = createMachine(makeTrafficLight());
      m.send({ type: "NEXT" });
      expect(m.currentState).toBe("green");
    });

    it("chains transitions", () => {
      const m = createMachine(makeTrafficLight());
      m.send({ type: "NEXT" });
      m.send({ type: "NEXT" });
      expect(m.currentState).toBe("yellow");
    });

    it("cycles through all states", () => {
      const m = createMachine(makeTrafficLight());
      m.send({ type: "NEXT" });
      m.send({ type: "NEXT" });
      m.send({ type: "NEXT" });
      expect(m.currentState).toBe("red");
    });

    it("reset from any state goes to red", () => {
      const m = createMachine(makeTrafficLight());
      m.send({ type: "NEXT" });
      m.send({ type: "NEXT" });
      m.send({ type: "RESET" });
      expect(m.currentState).toBe("red");
    });

    it("ignores unknown event", () => {
      const m = createMachine(makeTrafficLight());
      m.send({ type: "UNKNOWN" } as TrafficBaseEvent);
      expect(m.currentState).toBe("red");
    });
  });

  describe("context updates", () => {
    it("actions can update context", () => {
      const def: StateMachineDefinition<TrafficContext, TrafficBaseEvent> = {
        ...makeTrafficLight(),
        transitions: [
          {
            from: "red",
            event: "NEXT",
            to: "green",
            actions: [(ctx) => ({ ...ctx, count: ctx.count + 1 })],
          },
          { from: "green", event: "NEXT", to: "yellow" },
          { from: "yellow", event: "NEXT", to: "red" },
        ],
      };
      const m = createMachine(def);
      m.send({ type: "NEXT" });
      expect(m.context.count).toBe(1);
    });

    it("entry actions run on state entry", () => {
      const def: StateMachineDefinition<TrafficContext, TrafficBaseEvent> = {
        ...makeTrafficLight(),
        states: new Map([
          ["red", { id: "red", type: "initial" }],
          ["green", {
            id: "green",
            onEntry: [(ctx, _evt) => ({ ...ctx, count: ctx.count + 10 })],
          }],
          ["yellow", { id: "yellow" }],
        ]),
        transitions: makeTrafficLight().transitions,
      };
      const m = createMachine(def);
      m.send({ type: "NEXT" });
      expect(m.context.count).toBe(10);
    });

    it("exit actions run on state exit", () => {
      const def: StateMachineDefinition<TrafficContext, TrafficBaseEvent> = {
        ...makeTrafficLight(),
        states: new Map([
          ["red", {
            id: "red",
            type: "initial",
            onExit: [(ctx, _evt) => ({ ...ctx, count: ctx.count + 5 })],
          }],
          ["green", { id: "green" }],
          ["yellow", { id: "yellow" }],
        ]),
        transitions: makeTrafficLight().transitions,
      };
      const m = createMachine(def);
      m.send({ type: "NEXT" });
      expect(m.context.count).toBe(5);
    });
  });

  describe("guards", () => {
    it("blocks transition when guard returns false", () => {
      const def: StateMachineDefinition<TrafficContext, TrafficBaseEvent> = {
        ...makeTrafficLight(),
        transitions: [
          {
            from: "red",
            event: "NEXT",
            to: "green",
            guards: [() => false],
          },
          { from: "green", event: "NEXT", to: "yellow" },
          { from: "yellow", event: "NEXT", to: "red" },
        ],
      };
      const m = createMachine(def);
      m.send({ type: "NEXT" });
      expect(m.currentState).toBe("red");
    });

    it("allows transition when guard returns true", () => {
      const def: StateMachineDefinition<TrafficContext, TrafficBaseEvent> = {
        ...makeTrafficLight(),
        transitions: [
          {
            from: "red",
            event: "NEXT",
            to: "green",
            guards: [(ctx) => ctx.count >= 0],
          },
          { from: "green", event: "NEXT", to: "yellow" },
          { from: "yellow", event: "NEXT", to: "red" },
        ],
      };
      const m = createMachine(def);
      m.send({ type: "NEXT" });
      expect(m.currentState).toBe("green");
    });

    it("uses first matching transition when guard passes", () => {
      const def: StateMachineDefinition<TrafficContext, TrafficBaseEvent> = {
        ...makeTrafficLight(),
        transitions: [
          { from: "red", event: "NEXT", to: "green", guards: [() => false] },
          { from: "red", event: "NEXT", to: "yellow", guards: [() => true] },
        ],
      };
      const m = createMachine(def);
      m.send({ type: "NEXT" });
      expect(m.currentState).toBe("yellow");
    });
  });

  describe("history", () => {
    it("records transitions in history", () => {
      const m = createMachine(makeTrafficLight());
      m.send({ type: "NEXT" });
      m.send({ type: "NEXT" });
      const history = m.history;
      expect(history).toHaveLength(2);
      expect(history[0]!.from).toBe("red");
      expect(history[0]!.to).toBe("green");
      expect(history[1]!.from).toBe("green");
      expect(history[1]!.to).toBe("yellow");
    });

    it("history entry has timestamp", () => {
      const m = createMachine(makeTrafficLight());
      m.send({ type: "NEXT" });
      expect(typeof m.history[0]!.timestamp).toBe("number");
    });

    it("maxHistory limits history length", () => {
      const m = createMachine(makeTrafficLight(), { maxHistory: 2 });
      m.send({ type: "NEXT" });
      m.send({ type: "NEXT" });
      m.send({ type: "NEXT" });
      expect(m.history.length).toBeLessThanOrEqual(2);
    });
  });

  describe("final states", () => {
    it("isFinished is false for non-final state", () => {
      const m = createMachine(makeTrafficLight());
      expect(m.isFinished).toBe(false);
    });

    it("isFinished is true for final state", () => {
      const def: StateMachineDefinition<TrafficContext, TrafficBaseEvent> = {
        ...makeTrafficLight(),
        final: ["green"],
      };
      const m = createMachine(def);
      m.send({ type: "NEXT" });
      expect(m.isFinished).toBe(true);
    });

    it("does not process events when finished", () => {
      const def: StateMachineDefinition<TrafficContext, TrafficBaseEvent> = {
        ...makeTrafficLight(),
        final: ["green"],
      };
      const m = createMachine(def);
      m.send({ type: "NEXT" });
      m.send({ type: "NEXT" });
      expect(m.currentState).toBe("green");
    });
  });

  describe("canTransition / getPossibleEvents", () => {
    it("canTransition returns true for valid event", () => {
      const m = createMachine(makeTrafficLight());
      expect(m.canTransition("NEXT")).toBe(true);
    });

    it("canTransition returns false for invalid event", () => {
      const m = createMachine(makeTrafficLight());
      expect(m.canTransition("INVALID")).toBe(false);
    });

    it("getPossibleEvents returns available events", () => {
      const m = createMachine(makeTrafficLight());
      const events = m.getPossibleEvents();
      expect(events).toContain("NEXT");
      expect(events).toContain("RESET");
    });
  });

  describe("serialization", () => {
    it("serializes current state", () => {
      const m = createMachine(makeTrafficLight());
      m.send({ type: "NEXT" });
      const s = m.serialize();
      expect(s.currentState).toBe("green");
      expect(s.id).toBe("traffic-light");
      expect(typeof s.timestamp).toBe("number");
    });

    it("deserializes state", () => {
      const def = makeTrafficLight();
      const m = createMachine(def);
      m.send({ type: "NEXT" });
      const s = m.serialize();
      const m2 = StateMachine.deserialize(def, s);
      expect(m2.currentState).toBe("green");
    });
  });
});
