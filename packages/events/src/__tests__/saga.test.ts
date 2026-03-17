import { describe, it, expect, vi } from "vitest";
import { Saga, SagaBuilder, createSaga } from "../saga.js";
import type { SagaState } from "../types.js";

interface OrderContext {
  orderId: string;
  reserved: boolean;
  charged: boolean;
  shipped: boolean;
  compensated: string[];
}

function makeOrderContext(): OrderContext {
  return {
    orderId: "order-1",
    reserved: false,
    charged: false,
    shipped: false,
    compensated: [],
  };
}

describe("Saga – successful execution", () => {
  it("executes all steps in sequence", async () => {
    const saga = createSaga<OrderContext>("place-order")
      .step(
        "reserve-inventory",
        async (ctx) => ({ ...ctx, reserved: true }),
        async (ctx) => ({ ...ctx, reserved: false, compensated: [...ctx.compensated, "reserve-inventory"] })
      )
      .step(
        "charge-payment",
        async (ctx) => ({ ...ctx, charged: true }),
        async (ctx) => ({ ...ctx, charged: false, compensated: [...ctx.compensated, "charge-payment"] })
      )
      .step(
        "ship-order",
        async (ctx) => ({ ...ctx, shipped: true }),
        async (ctx) => ({ ...ctx, shipped: false, compensated: [...ctx.compensated, "ship-order"] })
      )
      .build(makeOrderContext());

    const result = await saga.execute();
    expect(result.reserved).toBe(true);
    expect(result.charged).toBe(true);
    expect(result.shipped).toBe(true);
    expect(saga.state.status).toBe("completed");
    expect(saga.state.completedAt).toBeTruthy();
  });
});

describe("Saga – failure and compensation", () => {
  it("compensates previously completed steps in reverse order on failure", async () => {
    const compensated: string[] = [];

    const saga = createSaga<OrderContext>("place-order")
      .step(
        "reserve-inventory",
        async (ctx) => ({ ...ctx, reserved: true }),
        async (ctx) => {
          compensated.push("reserve-inventory");
          return { ...ctx, reserved: false };
        }
      )
      .step(
        "charge-payment",
        async (_ctx) => { throw new Error("Card declined"); },
        async (ctx) => {
          compensated.push("charge-payment");
          return ctx;
        }
      )
      .step(
        "ship-order",
        async (ctx) => ({ ...ctx, shipped: true }),
        async (ctx) => {
          compensated.push("ship-order");
          return ctx;
        }
      )
      .build(makeOrderContext());

    await expect(saga.execute()).rejects.toThrow("Card declined");
    // Only step 0 (reserve) was completed — should be compensated
    expect(compensated).toEqual(["reserve-inventory"]);
    expect(saga.state.status).toBe("failed");
    expect(saga.state.error).toContain("Card declined");
  });

  it("sets status to 'failed' after failure", async () => {
    const saga = createSaga<OrderContext>("failing-saga")
      .step(
        "always-fails",
        async () => { throw new Error("boom"); },
        async (ctx) => ctx
      )
      .build(makeOrderContext());

    await expect(saga.execute()).rejects.toThrow("boom");
    expect(saga.state.status).toBe("failed");
  });
});

describe("Saga – state machine transitions", () => {
  it("transitions through step_N statuses", async () => {
    const statuses: string[] = [];

    const saga = createSaga<OrderContext>("place-order")
      .onStateChange((state) => { statuses.push(state.status); })
      .step(
        "step-a",
        async (ctx) => ctx,
        async (ctx) => ctx
      )
      .step(
        "step-b",
        async (ctx) => ctx,
        async (ctx) => ctx
      )
      .build(makeOrderContext());

    await saga.execute();
    expect(statuses).toContain("step_0");
    expect(statuses).toContain("step_1");
    expect(statuses).toContain("completed");
  });

  it("transitions to 'compensating' on failure", async () => {
    const statuses: string[] = [];
    const saga = createSaga<OrderContext>("failing")
      .onStateChange((state) => { statuses.push(state.status); })
      .step(
        "fail",
        async () => { throw new Error("x"); },
        async (ctx) => ctx
      )
      .build(makeOrderContext());

    await expect(saga.execute()).rejects.toThrow();
    expect(statuses).toContain("compensating");
    expect(statuses).toContain("failed");
  });
});

describe("Saga – timeout per step", () => {
  it("fails when a step exceeds its timeout", async () => {
    const saga = createSaga<OrderContext>("slow-saga")
      .step(
        "slow-step",
        async (ctx) => {
          await new Promise((r) => setTimeout(r, 200));
          return ctx;
        },
        async (ctx) => ctx,
        50 // 50ms timeout
      )
      .build(makeOrderContext());

    await expect(saga.execute()).rejects.toThrow("timed out");
  });

  it("succeeds when step completes within timeout", async () => {
    const saga = createSaga<OrderContext>("fast-saga")
      .step(
        "fast-step",
        async (ctx) => {
          await new Promise((r) => setTimeout(r, 10));
          return { ...ctx, reserved: true };
        },
        async (ctx) => ctx,
        200
      )
      .build(makeOrderContext());

    const result = await saga.execute();
    expect(result.reserved).toBe(true);
  });
});

describe("Saga – onStateChange callback", () => {
  it("calls onStateChange for each state transition", async () => {
    const changes: Array<SagaState<OrderContext>> = [];

    const saga = createSaga<OrderContext>("tracked")
      .onStateChange((state) => { changes.push({ ...state } as SagaState<OrderContext>); })
      .step(
        "do-something",
        async (ctx) => ctx,
        async (ctx) => ctx
      )
      .build(makeOrderContext());

    await saga.execute();
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[changes.length - 1]?.status).toBe("completed");
  });

  it("includes updated context in each state change", async () => {
    const contexts: OrderContext[] = [];

    const saga = createSaga<OrderContext>("ctx-track")
      .onStateChange((state) => { contexts.push({ ...(state.context as OrderContext) }); })
      .step(
        "reserve",
        async (ctx) => ({ ...ctx, reserved: true }),
        async (ctx) => ctx
      )
      .build(makeOrderContext());

    await saga.execute();
    const lastCtx = contexts[contexts.length - 1];
    expect(lastCtx?.reserved).toBe(true);
  });
});

describe("Saga – throws when already completed", () => {
  it("cannot re-execute a completed saga", async () => {
    const saga = createSaga<OrderContext>("once")
      .step("s", async (ctx) => ctx, async (ctx) => ctx)
      .build(makeOrderContext());

    await saga.execute();
    await expect(saga.execute()).rejects.toThrow('already finished');
  });

  it("cannot re-execute a failed saga", async () => {
    const saga = createSaga<OrderContext>("fail-once")
      .step("s", async () => { throw new Error("x"); }, async (ctx) => ctx)
      .build(makeOrderContext());

    await expect(saga.execute()).rejects.toThrow();
    await expect(saga.execute()).rejects.toThrow('already finished');
  });
});

describe("Saga – serialization", () => {
  it("serializes and deserializes state", async () => {
    const saga = createSaga<OrderContext>("serial")
      .step("s", async (ctx) => ({ ...ctx, reserved: true }), async (ctx) => ctx)
      .build(makeOrderContext());

    await saga.execute();
    const serialized = saga.serializeState();
    const parsed = Saga.deserializeState<OrderContext>(serialized);
    expect(parsed.status).toBe("completed");
    expect(parsed.context.reserved).toBe(true);
  });
});

describe("Saga – context passed between steps", () => {
  it("each step receives the context from the previous step", async () => {
    interface Counter { count: number }

    const saga = createSaga<Counter>("accumulate")
      .step("add-1", async (ctx) => ({ count: ctx.count + 1 }), async (ctx) => ctx)
      .step("add-2", async (ctx) => ({ count: ctx.count + 2 }), async (ctx) => ctx)
      .step("add-3", async (ctx) => ({ count: ctx.count + 3 }), async (ctx) => ctx)
      .build({ count: 0 });

    const result = await saga.execute();
    expect(result.count).toBe(6);
  });
});

describe("SagaBuilder", () => {
  it("builds a saga with steps", async () => {
    const builder = new SagaBuilder<{ done: boolean }>("test")
      .step(
        "finish",
        async (ctx) => ({ ...ctx, done: true }),
        async (ctx) => ctx
      );

    const saga = builder.build({ done: false });
    const result = await saga.execute();
    expect(result.done).toBe(true);
  });

  it("onStateChange is wired through builder", async () => {
    const handler = vi.fn();
    const saga = new SagaBuilder<{ x: number }>("test")
      .onStateChange(handler)
      .step("s", async (ctx) => ctx, async (ctx) => ctx)
      .build({ x: 1 });

    await saga.execute();
    expect(handler).toHaveBeenCalled();
  });
});
