import { describe, it, expect } from "vitest";
import { StateMachineBuilder, defineMachine, validate } from "../builder.js";
import { createMachine } from "../state-machine.js";
import type { BaseEvent } from "../types.js";

interface SimpleContext {
  value: number;
}

type SimpleEvent = { type: "GO" } | { type: "BACK" } | { type: "DONE" };
type SimpleBaseEvent = SimpleEvent & BaseEvent;

describe("StateMachineBuilder", () => {
  describe("basic construction", () => {
    it("builds a simple machine definition", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("test");
      builder.withContext({ value: 0 });
      builder.state("idle").build();
      builder.state("running").build();
      builder.state("done").asFinal().build();
      builder.transition("idle", "GO", "running").build();
      builder.transition("running", "DONE", "done").build();
      builder.initial("idle");
      builder.final("done");

      const def = builder.build();
      expect(def.id).toBe("test");
      expect(def.initial).toBe("idle");
      expect(def.states.has("idle")).toBe(true);
      expect(def.states.has("running")).toBe(true);
      expect(def.transitions).toHaveLength(2);
      expect(def.final).toContain("done");
    });

    it("creates machine from definition", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("sm");
      builder.withContext({ value: 0 });
      builder.state("a").build();
      builder.state("b").build();
      builder.transition("a", "GO", "b").build();
      builder.initial("a");
      const def = builder.build();
      const machine = createMachine(def);
      expect(machine.currentState).toBe("a");
      machine.send({ type: "GO" });
      expect(machine.currentState).toBe("b");
    });
  });

  describe("withContext", () => {
    it("sets context on the definition", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("ctx-test");
      builder.withContext({ value: 42 });
      builder.state("a").build();
      builder.initial("a");
      const def = builder.build();
      expect(def.context.value).toBe(42);
    });
  });

  describe("state builder", () => {
    it("state onEntry is registered", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("entry-test");
      const entryFn = (ctx: SimpleContext) => ({ ...ctx, value: 99 });
      builder.withContext({ value: 0 });
      builder.state("start").onEntry(entryFn).build();
      builder.state("end").build();
      builder.transition("start", "GO", "end").build();
      builder.initial("start");
      const def = builder.build();
      const startDef = def.states.get("start");
      expect(startDef?.onEntry).toHaveLength(1);
    });

    it("state onExit is registered", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("exit-test");
      const exitFn = (ctx: SimpleContext) => ({ ...ctx, value: -1 });
      builder.withContext({ value: 0 });
      builder.state("start").onExit(exitFn).build();
      builder.state("end").build();
      builder.transition("start", "GO", "end").build();
      builder.initial("start");
      const def = builder.build();
      const startDef = def.states.get("start");
      expect(startDef?.onExit).toHaveLength(1);
    });

    it("state meta is registered", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("meta-test");
      builder.withContext({ value: 0 });
      builder.state("start").meta({ color: "red", priority: 1 }).build();
      builder.initial("start");
      const def = builder.build();
      const startDef = def.states.get("start");
      expect(startDef?.meta?.color).toBe("red");
    });
  });

  describe("transition builder", () => {
    it("transition guard is registered", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("guard-test");
      builder.withContext({ value: 0 });
      builder.state("a").build();
      builder.state("b").build();
      builder.transition("a", "GO", "b")
        .guard((ctx) => ctx.value > 0)
        .build();
      builder.initial("a");
      const def = builder.build();
      expect(def.transitions[0]!.guards).toHaveLength(1);
    });

    it("transition action is registered", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("action-test");
      builder.withContext({ value: 0 });
      builder.state("a").build();
      builder.state("b").build();
      builder.transition("a", "GO", "b")
        .action((ctx) => ({ ...ctx, value: ctx.value + 1 }))
        .build();
      builder.initial("a");
      const def = builder.build();
      expect(def.transitions[0]!.actions).toHaveLength(1);
    });

    it("transition description is registered", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("desc-test");
      builder.withContext({ value: 0 });
      builder.state("a").build();
      builder.state("b").build();
      builder.transition("a", "GO", "b").description("Go from a to b").build();
      builder.initial("a");
      const def = builder.build();
      expect(def.transitions[0]!.description).toBe("Go from a to b");
    });

    it("guard blocks transition when false", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("guard-block");
      builder.withContext({ value: 0 });
      builder.state("a").build();
      builder.state("b").build();
      builder.transition("a", "GO", "b")
        .guard((ctx) => ctx.value > 10)
        .build();
      builder.initial("a");
      const def = builder.build();
      const machine = createMachine(def);
      machine.send({ type: "GO" });
      expect(machine.currentState).toBe("a");
    });
  });

  describe("defineMachine shorthand", () => {
    it("creates builder via defineMachine", () => {
      const builder = defineMachine<SimpleContext, SimpleBaseEvent>("shorthand");
      expect(builder).toBeInstanceOf(StateMachineBuilder);
    });
  });

  describe("multiple finals", () => {
    it("supports multiple final states", () => {
      const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("multi-final");
      builder.withContext({ value: 0 });
      builder.state("start").build();
      builder.state("success").asFinal().build();
      builder.state("failure").asFinal().build();
      builder.transition("start", "GO", "success").build();
      builder.transition("start", "BACK", "failure").build();
      builder.initial("start");
      builder.final("success");
      builder.final("failure");
      const def = builder.build();
      expect(def.final).toHaveLength(2);
      expect(def.final).toContain("success");
      expect(def.final).toContain("failure");
    });
  });
});

describe("validate", () => {
  it("passes valid definition", () => {
    const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("valid");
    builder.withContext({ value: 0 });
    builder.state("a").build();
    builder.state("b").build();
    builder.transition("a", "GO", "b").build();
    builder.transition("b", "BACK", "a").build();
    builder.initial("a");
    const def = builder.build();
    const result = validate(def);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails with no initial state", () => {
    const def = {
      id: "no-initial",
      initial: "",
      context: { value: 0 },
      states: new Map([["a", { id: "a" }]]),
      transitions: [],
    };
    const result = validate(def);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("initial"))).toBe(true);
  });

  it("fails with undefined initial state", () => {
    const def = {
      id: "bad-initial",
      initial: "nonexistent",
      context: { value: 0 },
      states: new Map([["a", { id: "a" }]]),
      transitions: [],
    };
    const result = validate(def);
    expect(result.valid).toBe(false);
  });

  it("fails with transition to nonexistent state", () => {
    const def = {
      id: "bad-target",
      initial: "a",
      context: { value: 0 },
      states: new Map([["a", { id: "a" }]]),
      transitions: [{ from: "a", event: "GO", to: "nonexistent" }],
    };
    const result = validate(def);
    expect(result.valid).toBe(false);
  });

  it("warns about unreachable states", () => {
    const def = {
      id: "orphan",
      initial: "a",
      context: { value: 0 },
      states: new Map([
        ["a", { id: "a" }],
        ["orphan", { id: "orphan" }],
      ]),
      transitions: [{ from: "a", event: "GO", to: "a" }],
    };
    const result = validate(def);
    expect(result.warnings.some((w) => w.includes("orphan"))).toBe(true);
  });

  it("buildValidated throws on invalid definition", () => {
    const builder = new StateMachineBuilder<SimpleContext, SimpleBaseEvent>("invalid");
    // No initial state set
    builder.withContext({ value: 0 });
    builder.state("a").build();
    expect(() => builder.buildValidated()).toThrow();
  });
});
