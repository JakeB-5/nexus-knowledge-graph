import { describe, it, expect } from 'vitest';
import { JSONSerializer } from '../json-serializer.js';
import type { CustomTypeHandler } from '../types.js';

describe('JSONSerializer', () => {
  describe('primitives', () => {
    it('serializes and deserializes null', () => {
      const s = new JSONSerializer();
      expect(s.deserialize(s.serialize(null))).toBe(null);
    });

    it('serializes and deserializes strings', () => {
      const s = new JSONSerializer();
      const result = s.deserialize<string>(s.serialize('hello world'));
      expect(result).toBe('hello world');
    });

    it('serializes and deserializes numbers', () => {
      const s = new JSONSerializer();
      expect(s.deserialize<number>(s.serialize(42))).toBe(42);
      expect(s.deserialize<number>(s.serialize(-3.14))).toBeCloseTo(-3.14);
    });

    it('serializes and deserializes booleans', () => {
      const s = new JSONSerializer();
      expect(s.deserialize<boolean>(s.serialize(true))).toBe(true);
      expect(s.deserialize<boolean>(s.serialize(false))).toBe(false);
    });
  });

  describe('Date handling', () => {
    it('round-trips a Date', () => {
      const s = new JSONSerializer();
      const date = new Date('2024-06-15T12:00:00.000Z');
      const result = s.deserialize<Date>(s.serialize(date));
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(date.getTime());
    });

    it('handles Date inside an object', () => {
      const s = new JSONSerializer();
      const obj = { created: new Date('2023-01-01T00:00:00Z'), name: 'test' };
      const result = s.deserialize<typeof obj>(s.serialize(obj));
      expect(result.created).toBeInstanceOf(Date);
      expect(result.name).toBe('test');
    });
  });

  describe('BigInt support', () => {
    it('round-trips BigInt', () => {
      const s = new JSONSerializer();
      const big = BigInt('9007199254740993');
      const result = s.deserialize<bigint>(s.serialize(big));
      expect(result).toBe(big);
    });

    it('handles BigInt inside nested object', () => {
      const s = new JSONSerializer();
      const obj = { id: BigInt(123), label: 'x' };
      const result = s.deserialize<typeof obj>(s.serialize(obj));
      expect(result.id).toBe(BigInt(123));
    });
  });

  describe('Map support', () => {
    it('round-trips a Map', () => {
      const s = new JSONSerializer();
      const map = new Map<string, number>([['a', 1], ['b', 2]]);
      const result = s.deserialize<Map<string, number>>(s.serialize(map));
      expect(result).toBeInstanceOf(Map);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(2);
    });
  });

  describe('Set support', () => {
    it('round-trips a Set', () => {
      const s = new JSONSerializer();
      const set = new Set([1, 2, 3]);
      const result = s.deserialize<Set<number>>(s.serialize(set));
      expect(result).toBeInstanceOf(Set);
      expect(result.has(1)).toBe(true);
      expect(result.has(3)).toBe(true);
      expect(result.size).toBe(3);
    });
  });

  describe('Uint8Array support', () => {
    it('round-trips Uint8Array', () => {
      const s = new JSONSerializer();
      const buf = new Uint8Array([10, 20, 30, 40]);
      const result = s.deserialize<Uint8Array>(s.serialize(buf));
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([10, 20, 30, 40]);
    });
  });

  describe('circular reference detection', () => {
    it('handles circular references without throwing', () => {
      const s = new JSONSerializer();
      const obj: Record<string, unknown> = { a: 1 };
      obj['self'] = obj;
      // Should not throw
      expect(() => s.serialize(obj)).not.toThrow();
    });

    it('marks circular references in output', () => {
      const s = new JSONSerializer();
      const obj: Record<string, unknown> = { a: 1 };
      obj['self'] = obj;
      const json = s.serialize(obj);
      expect(json).toContain('__circular');
    });
  });

  describe('custom type handlers', () => {
    it('registers and uses a custom type handler', () => {
      class Point {
        constructor(public x: number, public y: number) {}
      }

      const handler: CustomTypeHandler<Point> = {
        typeName: 'Point',
        isType: (v): v is Point => v instanceof Point,
        serialize: (p) => ({ x: p.x, y: p.y }),
        deserialize: (raw) => {
          const r = raw as { x: number; y: number };
          return new Point(r.x, r.y);
        },
      };

      const s = new JSONSerializer();
      s.registerType(handler);

      const p = new Point(3, 4);
      const result = s.deserialize<Point>(s.serialize(p));
      expect(result).toBeInstanceOf(Point);
      expect(result.x).toBe(3);
      expect(result.y).toBe(4);
    });
  });

  describe('pretty-print option', () => {
    it('produces indented JSON when prettyPrint is true', () => {
      const s = new JSONSerializer({ prettyPrint: true });
      const json = s.serialize({ hello: 'world' });
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('produces compact JSON by default', () => {
      const s = new JSONSerializer();
      const json = s.serialize({ hello: 'world' });
      expect(json).not.toContain('\n');
    });
  });

  describe('nested structures', () => {
    it('round-trips a deeply nested object', () => {
      const s = new JSONSerializer();
      const obj = {
        a: { b: { c: { d: [1, 2, new Date('2024-01-01'), BigInt(99)] } } },
      };
      const result = s.deserialize<typeof obj>(s.serialize(obj));
      expect(result.a.b.c.d[2]).toBeInstanceOf(Date);
      expect(result.a.b.c.d[3]).toBe(BigInt(99));
    });
  });

  describe('streaming parser', () => {
    it('parses multiple JSON objects from a stream', async () => {
      const s = new JSONSerializer();
      const chunks = ['{"a":1}', '{"b":2}', '{"c":3}'];

      async function* source() {
        for (const chunk of chunks) yield chunk;
      }

      const results: unknown[] = [];
      for await (const item of s.parseStream(source())) {
        results.push(item);
      }

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ a: 1 });
      expect(results[1]).toEqual({ b: 2 });
      expect(results[2]).toEqual({ c: 3 });
    });

    it('handles chunked JSON delivery', async () => {
      const s = new JSONSerializer();
      const chunks = ['{"foo":', '"bar"}'];

      async function* source() {
        for (const chunk of chunks) yield chunk;
      }

      const results: unknown[] = [];
      for await (const item of s.parseStream(source())) {
        results.push(item);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ foo: 'bar' });
    });
  });
});
