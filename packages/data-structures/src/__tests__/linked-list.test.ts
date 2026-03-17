import { describe, it, expect } from 'vitest';
import { DoublyLinkedList } from '../linked-list.js';

describe('DoublyLinkedList', () => {
  it('starts empty', () => {
    const list = new DoublyLinkedList<number>();
    expect(list.size).toBe(0);
    expect(list.isEmpty()).toBe(true);
  });

  describe('pushFront / pushBack', () => {
    it('pushFront adds to front', () => {
      const list = new DoublyLinkedList<number>();
      list.pushFront(1);
      list.pushFront(2);
      list.pushFront(3);
      expect(list.toArray()).toEqual([3, 2, 1]);
    });

    it('pushBack adds to back', () => {
      const list = new DoublyLinkedList<number>();
      list.pushBack(1);
      list.pushBack(2);
      list.pushBack(3);
      expect(list.toArray()).toEqual([1, 2, 3]);
    });

    it('updates size', () => {
      const list = new DoublyLinkedList<number>();
      list.pushFront(1);
      list.pushBack(2);
      expect(list.size).toBe(2);
      expect(list.isEmpty()).toBe(false);
    });
  });

  describe('popFront / popBack', () => {
    it('popFront removes and returns front', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3]);
      expect(list.popFront()).toBe(1);
      expect(list.toArray()).toEqual([2, 3]);
    });

    it('popBack removes and returns back', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3]);
      expect(list.popBack()).toBe(3);
      expect(list.toArray()).toEqual([1, 2]);
    });

    it('popFront on empty returns undefined', () => {
      const list = new DoublyLinkedList<number>();
      expect(list.popFront()).toBeUndefined();
    });

    it('popBack on empty returns undefined', () => {
      const list = new DoublyLinkedList<number>();
      expect(list.popBack()).toBeUndefined();
    });

    it('pop single element leaves list empty', () => {
      const list = DoublyLinkedList.fromArray([42]);
      expect(list.popFront()).toBe(42);
      expect(list.isEmpty()).toBe(true);
      expect(list.size).toBe(0);
    });
  });

  describe('get / insertAt / removeAt', () => {
    it('get returns correct element', () => {
      const list = DoublyLinkedList.fromArray([10, 20, 30]);
      expect(list.get(0)).toBe(10);
      expect(list.get(1)).toBe(20);
      expect(list.get(2)).toBe(30);
    });

    it('get returns undefined for out of bounds', () => {
      const list = DoublyLinkedList.fromArray([1, 2]);
      expect(list.get(-1)).toBeUndefined();
      expect(list.get(5)).toBeUndefined();
    });

    it('insertAt middle', () => {
      const list = DoublyLinkedList.fromArray([1, 3]);
      list.insertAt(1, 2);
      expect(list.toArray()).toEqual([1, 2, 3]);
    });

    it('insertAt front', () => {
      const list = DoublyLinkedList.fromArray([2, 3]);
      list.insertAt(0, 1);
      expect(list.toArray()).toEqual([1, 2, 3]);
    });

    it('insertAt back', () => {
      const list = DoublyLinkedList.fromArray([1, 2]);
      list.insertAt(2, 3);
      expect(list.toArray()).toEqual([1, 2, 3]);
    });

    it('insertAt out of bounds throws', () => {
      const list = DoublyLinkedList.fromArray([1]);
      expect(() => list.insertAt(-1, 0)).toThrow();
      expect(() => list.insertAt(5, 0)).toThrow();
    });

    it('removeAt middle', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3]);
      expect(list.removeAt(1)).toBe(2);
      expect(list.toArray()).toEqual([1, 3]);
    });

    it('removeAt returns undefined for invalid index', () => {
      const list = DoublyLinkedList.fromArray([1]);
      expect(list.removeAt(5)).toBeUndefined();
    });
  });

  describe('find / findIndex', () => {
    it('find returns first matching element', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3, 2]);
      expect(list.find((v) => v === 2)).toBe(2);
    });

    it('find returns undefined if not found', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3]);
      expect(list.find((v) => v === 99)).toBeUndefined();
    });

    it('findIndex returns correct index', () => {
      const list = DoublyLinkedList.fromArray([10, 20, 30]);
      expect(list.findIndex((v) => v === 20)).toBe(1);
    });

    it('findIndex returns -1 if not found', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3]);
      expect(list.findIndex((v) => v === 99)).toBe(-1);
    });
  });

  describe('functional methods', () => {
    it('forEach iterates in order', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3]);
      const result: number[] = [];
      list.forEach((v) => result.push(v));
      expect(result).toEqual([1, 2, 3]);
    });

    it('map transforms elements', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3]);
      const mapped = list.map((v) => v * 2);
      expect(mapped.toArray()).toEqual([2, 4, 6]);
    });

    it('filter keeps matching elements', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3, 4, 5]);
      const filtered = list.filter((v) => v % 2 === 0);
      expect(filtered.toArray()).toEqual([2, 4]);
    });
  });

  describe('reverse', () => {
    it('reverses in place', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3, 4, 5]);
      list.reverse();
      expect(list.toArray()).toEqual([5, 4, 3, 2, 1]);
    });

    it('reverse of single element is unchanged', () => {
      const list = DoublyLinkedList.fromArray([42]);
      list.reverse();
      expect(list.toArray()).toEqual([42]);
    });
  });

  describe('iterator', () => {
    it('supports for...of', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3]);
      const result: number[] = [];
      for (const v of list) result.push(v);
      expect(result).toEqual([1, 2, 3]);
    });

    it('spread operator works', () => {
      const list = DoublyLinkedList.fromArray([1, 2, 3]);
      expect([...list]).toEqual([1, 2, 3]);
    });
  });

  describe('fromArray', () => {
    it('builds list from array', () => {
      const list = DoublyLinkedList.fromArray([5, 4, 3]);
      expect(list.toArray()).toEqual([5, 4, 3]);
      expect(list.size).toBe(3);
    });

    it('empty array gives empty list', () => {
      const list = DoublyLinkedList.fromArray<number>([]);
      expect(list.isEmpty()).toBe(true);
    });
  });
});
