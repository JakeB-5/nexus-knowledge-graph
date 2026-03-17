import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sleep,
  retry,
  timeout,
  debounce,
  throttle,
  pMap,
  pSettle,
  createDeferred,
  withLock,
  rateLimit,
} from "../utils/async.js";

describe("sleep", () => {
  it("resolves after given ms", async () => {
    vi.useFakeTimers();
    const promise = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("retry", () => {
  it("returns value on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually resolves", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("fail"));
      return Promise.resolve("success");
    });
    const result = await retry(fn, { attempts: 3, delay: 0 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after max attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(retry(fn, { attempts: 3, delay: 0 })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops retrying when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(
      retry(fn, { attempts: 5, delay: 0, shouldRetry: () => false }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("timeout", () => {
  it("resolves when promise completes in time", async () => {
    const p = Promise.resolve(42);
    await expect(timeout(p, 100)).resolves.toBe(42);
  });

  it("rejects when promise exceeds timeout", async () => {
    vi.useFakeTimers();
    const p = new Promise<never>(() => {});
    const t = timeout(p, 50);
    vi.advanceTimersByTime(60);
    await expect(t).rejects.toThrow("timed out");
    vi.useRealTimers();
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delays function execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("only calls once for multiple rapid calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls function immediately on first call", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ignores subsequent calls within window", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("allows call after window expires", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    vi.advanceTimersByTime(101);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("pMap", () => {
  it("maps over items with async function", async () => {
    const results = await pMap([1, 2, 3], async (n) => n * 2);
    expect(results).toEqual([2, 4, 6]);
  });

  it("respects concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    const fn = async (n: number) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(10);
      active--;
      return n;
    };
    await pMap([1, 2, 3, 4, 5], fn, 2);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("handles empty array", async () => {
    const results = await pMap([], async (n: number) => n);
    expect(results).toEqual([]);
  });

  it("rejects if any promise rejects", async () => {
    await expect(
      pMap([1, 2, 3], async (n) => {
        if (n === 2) throw new Error("fail");
        return n;
      }),
    ).rejects.toThrow("fail");
  });
});

describe("pSettle", () => {
  it("returns fulfilled results", async () => {
    const results = await pSettle([Promise.resolve(1), Promise.resolve(2)]);
    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1]).toEqual({ status: "fulfilled", value: 2 });
  });

  it("returns rejected results without throwing", async () => {
    const results = await pSettle([
      Promise.resolve(1),
      Promise.reject(new Error("oops")),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
  });
});

describe("createDeferred", () => {
  it("resolves externally", async () => {
    const { promise, resolve } = createDeferred<number>();
    resolve(42);
    await expect(promise).resolves.toBe(42);
  });

  it("rejects externally", async () => {
    const { promise, reject } = createDeferred<number>();
    reject(new Error("external reject"));
    await expect(promise).rejects.toThrow("external reject");
  });
});

describe("withLock", () => {
  it("executes function and returns result", async () => {
    const result = await withLock("test-key", async () => 42);
    expect(result).toBe(42);
  });

  it("serializes concurrent calls with same key", async () => {
    const order: number[] = [];
    const tasks = [1, 2, 3].map((n) =>
      withLock("serial-key", async () => {
        order.push(n);
        await sleep(0);
        return n;
      }),
    );
    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("rateLimit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows calls within limit", () => {
    const fn = vi.fn().mockReturnValue("ok");
    const limited = rateLimit(fn, 3, 1000);
    expect(limited()).toBe("ok");
    expect(limited()).toBe("ok");
    expect(limited()).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("blocks calls exceeding limit", () => {
    const fn = vi.fn().mockReturnValue("ok");
    const limited = rateLimit(fn, 2, 1000);
    limited();
    limited();
    const result = limited();
    expect(result).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("allows calls again after window", () => {
    const fn = vi.fn().mockReturnValue("ok");
    const limited = rateLimit(fn, 1, 1000);
    limited();
    vi.advanceTimersByTime(1001);
    const result = limited();
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
