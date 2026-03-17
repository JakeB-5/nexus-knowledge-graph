import { describe, it, expect } from "vitest";
import {
  chunk,
  groupBy,
  sortBy,
  unique,
  uniqueBy,
  partition,
  flatten,
  zip,
  intersection,
  union,
  difference,
  compact,
  range,
  shuffle,
  sample,
  frequencies,
} from "../utils/collection.js";

describe("chunk", () => {
  it("splits array into chunks of given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("handles array that divides evenly", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("returns empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("throws for size <= 0", () => {
    expect(() => chunk([1, 2], 0)).toThrow();
  });

  it("returns whole array in one chunk when size >= length", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });
});

describe("groupBy", () => {
  it("groups by a string key", () => {
    const items = [
      { type: "a", val: 1 },
      { type: "b", val: 2 },
      { type: "a", val: 3 },
    ];
    const result = groupBy(items, (i) => i.type);
    expect(result["a"]).toHaveLength(2);
    expect(result["b"]).toHaveLength(1);
  });

  it("returns empty object for empty array", () => {
    expect(groupBy([], (i: string) => i)).toEqual({});
  });
});

describe("sortBy", () => {
  it("sorts ascending by default", () => {
    const items = [{ n: 3 }, { n: 1 }, { n: 2 }];
    expect(sortBy(items, (i) => i.n).map((i) => i.n)).toEqual([1, 2, 3]);
  });

  it("sorts descending", () => {
    const items = [{ n: 3 }, { n: 1 }, { n: 2 }];
    expect(sortBy(items, (i) => i.n, "desc").map((i) => i.n)).toEqual([3, 2, 1]);
  });

  it("does not mutate original array", () => {
    const items = [{ n: 2 }, { n: 1 }];
    sortBy(items, (i) => i.n);
    expect(items[0].n).toBe(2);
  });

  it("sorts strings", () => {
    const items = ["banana", "apple", "cherry"];
    expect(sortBy(items, (s) => s)).toEqual(["apple", "banana", "cherry"]);
  });
});

describe("unique", () => {
  it("removes duplicate primitives", () => {
    expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it("handles empty array", () => {
    expect(unique([])).toEqual([]);
  });

  it("handles strings", () => {
    expect(unique(["a", "b", "a"])).toEqual(["a", "b"]);
  });
});

describe("uniqueBy", () => {
  it("deduplicates by key function", () => {
    const items = [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 1, name: "c" }];
    expect(uniqueBy(items, (i) => i.id)).toHaveLength(2);
  });

  it("keeps first occurrence", () => {
    const items = [{ id: 1, name: "first" }, { id: 1, name: "second" }];
    expect(uniqueBy(items, (i) => i.id)[0].name).toBe("first");
  });
});

describe("partition", () => {
  it("splits into [passes, fails]", () => {
    const [evens, odds] = partition([1, 2, 3, 4, 5], (n) => n % 2 === 0);
    expect(evens).toEqual([2, 4]);
    expect(odds).toEqual([1, 3, 5]);
  });

  it("returns empty arrays when all pass or all fail", () => {
    const [all, none] = partition([2, 4], (n) => n % 2 === 0);
    expect(all).toHaveLength(2);
    expect(none).toHaveLength(0);
  });
});

describe("flatten", () => {
  it("flattens one level by default", () => {
    expect(flatten([[1, 2], [3, [4]]])).toEqual([1, 2, 3, [4]]);
  });

  it("flattens multiple levels", () => {
    expect(flatten([[1, [2, [3]]]], 2)).toEqual([1, 2, [3]]);
  });

  it("returns empty for empty input", () => {
    expect(flatten([])).toEqual([]);
  });
});

describe("zip", () => {
  it("zips two arrays together", () => {
    expect(zip([1, 2, 3], ["a", "b", "c"])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
  });

  it("stops at the shortest array", () => {
    expect(zip([1, 2, 3], ["a", "b"])).toEqual([[1, "a"], [2, "b"]]);
  });

  it("handles empty arrays", () => {
    expect(zip([], [1, 2])).toEqual([]);
  });
});

describe("intersection", () => {
  it("returns elements in both arrays", () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  it("returns empty array for no overlap", () => {
    expect(intersection([1, 2], [3, 4])).toEqual([]);
  });
});

describe("union", () => {
  it("combines arrays and removes duplicates", () => {
    expect(union([1, 2, 3], [2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("works with no overlap", () => {
    expect(union([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
  });
});

describe("difference", () => {
  it("returns elements in a but not in b", () => {
    expect(difference([1, 2, 3, 4], [2, 4])).toEqual([1, 3]);
  });

  it("returns full array if no overlap", () => {
    expect(difference([1, 2], [3, 4])).toEqual([1, 2]);
  });

  it("returns empty array if all overlap", () => {
    expect(difference([1, 2], [1, 2])).toEqual([]);
  });
});

describe("compact", () => {
  it("removes null and undefined", () => {
    expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  it("keeps falsy non-null values", () => {
    expect(compact([0, false, "", null, undefined])).toEqual([0, false, ""]);
  });
});

describe("range", () => {
  it("generates ascending range", () => {
    expect(range(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("supports custom step", () => {
    expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
  });

  it("supports descending range", () => {
    expect(range(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
  });

  it("throws for step = 0", () => {
    expect(() => range(0, 5, 0)).toThrow();
  });

  it("returns empty array when start === end", () => {
    expect(range(3, 3)).toEqual([]);
  });
});

describe("shuffle", () => {
  it("returns same length array", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr)).toHaveLength(arr.length);
  });

  it("contains same elements", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr).sort()).toEqual([...arr].sort());
  });

  it("does not mutate original", () => {
    const arr = [1, 2, 3];
    shuffle(arr);
    expect(arr).toEqual([1, 2, 3]);
  });
});

describe("sample", () => {
  it("returns n elements", () => {
    expect(sample([1, 2, 3, 4, 5], 3)).toHaveLength(3);
  });

  it("returns all elements when n >= length", () => {
    expect(sample([1, 2, 3], 10)).toHaveLength(3);
  });

  it("returns empty for empty array", () => {
    expect(sample([], 3)).toEqual([]);
  });
});

describe("frequencies", () => {
  it("counts occurrences", () => {
    const map = frequencies(["a", "b", "a", "c", "a"]);
    expect(map.get("a")).toBe(3);
    expect(map.get("b")).toBe(1);
    expect(map.get("c")).toBe(1);
  });

  it("returns empty map for empty array", () => {
    expect(frequencies([]).size).toBe(0);
  });

  it("works with numbers", () => {
    const map = frequencies([1, 2, 1, 3]);
    expect(map.get(1)).toBe(2);
    expect(map.get(2)).toBe(1);
  });
});
