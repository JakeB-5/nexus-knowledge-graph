import { describe, it, expect, beforeEach } from "vitest";
import { PriorityQueue } from "../priority-queue.js";

interface TestItem {
  id: string;
  priority: number;
  insertionOrder: number;
  label?: string;
}

describe("PriorityQueue", () => {
  let pq: PriorityQueue<TestItem>;

  beforeEach(() => {
    pq = new PriorityQueue<TestItem>();
  });

  describe("basic operations", () => {
    it("should start empty", () => {
      expect(pq.isEmpty).toBe(true);
      expect(pq.size).toBe(0);
    });

    it("should insert an item", () => {
      pq.insert({ id: "a", priority: 5, insertionOrder: 0 });
      expect(pq.size).toBe(1);
      expect(pq.isEmpty).toBe(false);
    });

    it("should peek at the highest priority item", () => {
      pq.insert({ id: "a", priority: 5, insertionOrder: 0 });
      pq.insert({ id: "b", priority: 10, insertionOrder: 1 });
      expect(pq.peek()?.id).toBe("b");
      expect(pq.size).toBe(2); // peek does not remove
    });

    it("should extract the highest priority item", () => {
      pq.insert({ id: "a", priority: 5, insertionOrder: 0 });
      pq.insert({ id: "b", priority: 10, insertionOrder: 1 });
      pq.insert({ id: "c", priority: 3, insertionOrder: 2 });

      expect(pq.extractMax()?.id).toBe("b");
      expect(pq.extractMax()?.id).toBe("a");
      expect(pq.extractMax()?.id).toBe("c");
      expect(pq.extractMax()).toBeUndefined();
    });

    it("should return undefined when extracting from empty queue", () => {
      expect(pq.extractMax()).toBeUndefined();
    });
  });

  describe("priority ordering", () => {
    it("should maintain max-heap property", () => {
      const priorities = [3, 1, 4, 1, 5, 9, 2, 6];
      priorities.forEach((p, i) => {
        pq.insert({ id: `item${i}`, priority: p, insertionOrder: i });
      });

      const extracted: number[] = [];
      while (!pq.isEmpty) {
        const item = pq.extractMax();
        if (item) extracted.push(item.priority);
      }

      // Should be in descending order
      for (let i = 1; i < extracted.length; i++) {
        expect(extracted[i]!).toBeLessThanOrEqual(extracted[i - 1]!);
      }
    });

    it("should break ties by insertion order (FIFO)", () => {
      // Items with same priority should come out in insertion order
      pq.insert({ id: "first", priority: 5, insertionOrder: 0 });
      pq.insert({ id: "second", priority: 5, insertionOrder: 1 });
      pq.insert({ id: "third", priority: 5, insertionOrder: 2 });

      expect(pq.extractMax()?.id).toBe("first");
      expect(pq.extractMax()?.id).toBe("second");
      expect(pq.extractMax()?.id).toBe("third");
    });
  });

  describe("update priority", () => {
    it("should update priority of existing item", () => {
      pq.insert({ id: "a", priority: 1, insertionOrder: 0 });
      pq.insert({ id: "b", priority: 5, insertionOrder: 1 });

      pq.updatePriority("a", 10); // bump a above b

      expect(pq.peek()?.id).toBe("a");
    });

    it("should return false for nonexistent id", () => {
      expect(pq.updatePriority("nonexistent", 10)).toBe(false);
    });

    it("should handle priority reduction", () => {
      pq.insert({ id: "a", priority: 10, insertionOrder: 0 });
      pq.insert({ id: "b", priority: 5, insertionOrder: 1 });

      pq.updatePriority("a", 1); // reduce a below b

      expect(pq.extractMax()?.id).toBe("b");
    });
  });

  describe("remove by id", () => {
    it("should remove an item by id", () => {
      pq.insert({ id: "a", priority: 5, insertionOrder: 0 });
      pq.insert({ id: "b", priority: 10, insertionOrder: 1 });

      const removed = pq.removeById("b");
      expect(removed?.id).toBe("b");
      expect(pq.size).toBe(1);
      expect(pq.peek()?.id).toBe("a");
    });

    it("should return undefined for nonexistent id", () => {
      expect(pq.removeById("nope")).toBeUndefined();
    });

    it("should maintain heap after removing middle item", () => {
      pq.insert({ id: "a", priority: 1, insertionOrder: 0 });
      pq.insert({ id: "b", priority: 5, insertionOrder: 1 });
      pq.insert({ id: "c", priority: 3, insertionOrder: 2 });
      pq.insert({ id: "d", priority: 8, insertionOrder: 3 });

      pq.removeById("b");

      const order = [];
      while (!pq.isEmpty) {
        order.push(pq.extractMax()?.id);
      }
      expect(order).toEqual(["d", "c", "a"]);
    });
  });

  describe("has and getById", () => {
    it("should check existence by id", () => {
      pq.insert({ id: "a", priority: 5, insertionOrder: 0 });
      expect(pq.has("a")).toBe(true);
      expect(pq.has("b")).toBe(false);
    });

    it("should get item by id", () => {
      pq.insert({ id: "a", priority: 5, insertionOrder: 0, label: "hello" });
      expect(pq.getById("a")?.label).toBe("hello");
      expect(pq.getById("missing")).toBeUndefined();
    });
  });

  describe("toSortedArray", () => {
    it("should return items sorted by priority without modifying heap", () => {
      pq.insert({ id: "a", priority: 3, insertionOrder: 0 });
      pq.insert({ id: "b", priority: 1, insertionOrder: 1 });
      pq.insert({ id: "c", priority: 5, insertionOrder: 2 });

      const sorted = pq.toSortedArray();
      expect(sorted[0]?.id).toBe("c");
      expect(sorted[1]?.id).toBe("a");
      expect(sorted[2]?.id).toBe("b");

      expect(pq.size).toBe(3); // unchanged
    });
  });

  describe("duplicate id handling", () => {
    it("should replace existing item when same id inserted", () => {
      pq.insert({ id: "a", priority: 3, insertionOrder: 0 });
      pq.insert({ id: "a", priority: 10, insertionOrder: 1 });

      expect(pq.size).toBe(1);
      expect(pq.peek()?.priority).toBe(10);
    });
  });

  describe("clear", () => {
    it("should clear all items", () => {
      pq.insert({ id: "a", priority: 1, insertionOrder: 0 });
      pq.insert({ id: "b", priority: 2, insertionOrder: 1 });
      pq.clear();
      expect(pq.isEmpty).toBe(true);
      expect(pq.size).toBe(0);
    });
  });

  describe("large dataset", () => {
    it("should handle 1000 items correctly", () => {
      const n = 1000;
      for (let i = 0; i < n; i++) {
        pq.insert({ id: `item${i}`, priority: Math.floor(Math.random() * 100), insertionOrder: i });
      }

      expect(pq.size).toBe(n);

      let prev = Infinity;
      while (!pq.isEmpty) {
        const item = pq.extractMax()!;
        expect(item.priority).toBeLessThanOrEqual(prev);
        prev = item.priority;
      }
    });
  });
});
