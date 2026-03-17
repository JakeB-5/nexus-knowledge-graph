import { describe, it, expect } from "vitest";
import {
  deepClone,
  deepMerge,
  pick,
  omit,
  mapKeys,
  mapValues,
  flattenObject,
  unflattenObject,
  isEqual,
  diff,
} from "../utils/object.js";

describe("deepClone", () => {
  it("creates a deep copy", () => {
    const obj = { a: { b: 1 } };
    const clone = deepClone(obj);
    clone.a.b = 99;
    expect(obj.a.b).toBe(1);
  });

  it("clones arrays", () => {
    const arr = [1, [2, 3]];
    const clone = deepClone(arr);
    (clone[1] as number[])[0] = 99;
    expect((arr[1] as number[])[0]).toBe(2);
  });
});

describe("deepMerge", () => {
  it("merges top-level keys", () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("recursively merges nested objects", () => {
    const target = { nested: { x: 1, y: 2 } };
    const source = { nested: { y: 99, z: 3 } };
    expect(deepMerge(target, source)).toEqual({ nested: { x: 1, y: 99, z: 3 } });
  });

  it("replaces arrays rather than merging", () => {
    const target = { arr: [1, 2, 3] };
    const source = { arr: [4, 5] };
    expect(deepMerge(target, source)).toEqual({ arr: [4, 5] });
  });

  it("does not mutate target", () => {
    const target = { a: 1 };
    deepMerge(target, { a: 2 });
    expect(target.a).toBe(1);
  });
});

describe("pick", () => {
  it("picks specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("ignores missing keys", () => {
    const obj = { a: 1 };
    expect(pick(obj, ["a"])).toEqual({ a: 1 });
  });

  it("returns empty object for empty keys", () => {
    expect(pick({ a: 1 }, [])).toEqual({});
  });
});

describe("omit", () => {
  it("omits specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("returns full object when omitting nothing", () => {
    const obj = { a: 1, b: 2 };
    expect(omit(obj, [])).toEqual({ a: 1, b: 2 });
  });

  it("does not mutate original", () => {
    const obj = { a: 1, b: 2 };
    omit(obj, ["a"]);
    expect(obj).toEqual({ a: 1, b: 2 });
  });
});

describe("mapKeys", () => {
  it("transforms keys using the function", () => {
    const obj = { a: 1, b: 2 };
    expect(mapKeys(obj, (k) => k.toUpperCase())).toEqual({ A: 1, B: 2 });
  });

  it("passes value to transformer", () => {
    const obj = { x: 10 };
    expect(mapKeys(obj, (k, v) => `${k}${v}`)).toEqual({ x10: 10 });
  });
});

describe("mapValues", () => {
  it("transforms values using the function", () => {
    const obj = { a: 1, b: 2 };
    expect(mapValues(obj, (v) => v * 2)).toEqual({ a: 2, b: 4 });
  });

  it("passes key to transformer", () => {
    const obj = { hello: 1 };
    expect(mapValues(obj, (v, k) => `${k}:${v}`)).toEqual({ hello: "hello:1" });
  });
});

describe("flattenObject", () => {
  it("flattens nested objects with dot separator", () => {
    const obj = { a: { b: { c: 1 } } };
    expect(flattenObject(obj)).toEqual({ "a.b.c": 1 });
  });

  it("uses custom separator", () => {
    const obj = { a: { b: 1 } };
    expect(flattenObject(obj, "_")).toEqual({ a_b: 1 });
  });

  it("handles flat objects", () => {
    const obj = { a: 1, b: 2 };
    expect(flattenObject(obj)).toEqual({ a: 1, b: 2 });
  });

  it("preserves arrays as values", () => {
    const obj = { a: [1, 2, 3] };
    expect(flattenObject(obj)).toEqual({ a: [1, 2, 3] });
  });
});

describe("unflattenObject", () => {
  it("unflattens dot-separated keys", () => {
    const obj = { "a.b.c": 1 };
    expect(unflattenObject(obj)).toEqual({ a: { b: { c: 1 } } });
  });

  it("uses custom separator", () => {
    const obj = { a_b: 1 };
    expect(unflattenObject(obj, "_")).toEqual({ a: { b: 1 } });
  });

  it("handles flat objects", () => {
    const obj = { a: 1, b: 2 };
    expect(unflattenObject(obj)).toEqual({ a: 1, b: 2 });
  });
});

describe("isEqual", () => {
  it("returns true for identical primitives", () => {
    expect(isEqual(1, 1)).toBe(true);
    expect(isEqual("hello", "hello")).toBe(true);
  });

  it("returns false for different primitives", () => {
    expect(isEqual(1, 2)).toBe(false);
    expect(isEqual("a", "b")).toBe(false);
  });

  it("deep compares objects", () => {
    expect(isEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("deep compares arrays", () => {
    expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(isEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("handles null correctly", () => {
    expect(isEqual(null, null)).toBe(true);
    expect(isEqual(null, undefined)).toBe(false);
  });
});

describe("diff", () => {
  it("detects added keys", () => {
    const result = diff({ a: 1 }, { a: 1, b: 2 });
    expect(result.added).toEqual({ b: 2 });
  });

  it("detects removed keys", () => {
    const result = diff({ a: 1, b: 2 }, { a: 1 });
    expect(result.removed).toEqual({ b: 2 });
  });

  it("detects changed values", () => {
    const result = diff({ a: 1, b: 2 }, { a: 99, b: 2 });
    expect(result.changed).toEqual({ a: { from: 1, to: 99 } });
  });

  it("returns empty diff for identical objects", () => {
    const result = diff({ a: 1 }, { a: 1 });
    expect(result.added).toEqual({});
    expect(result.removed).toEqual({});
    expect(result.changed).toEqual({});
  });
});
