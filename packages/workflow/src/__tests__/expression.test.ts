import { describe, it, expect } from 'vitest';
import { ExpressionEvaluator } from '../expression.js';

function makeCtx(vars: Record<string, unknown> = {}, stepResults: Record<string, unknown> = {}) {
  return {
    variables: vars,
    stepResults: new Map(Object.entries(stepResults)),
  };
}

describe('ExpressionEvaluator', () => {
  const ev = new ExpressionEvaluator();

  // -------------------------------------------------------------------------
  // Literals
  // -------------------------------------------------------------------------
  describe('literals', () => {
    it('evaluates integer literals', () => {
      expect(ev.evaluate('42', makeCtx())).toBe(42);
    });

    it('evaluates float literals', () => {
      expect(ev.evaluate('3.14', makeCtx())).toBeCloseTo(3.14);
    });

    it('evaluates string literals (double quotes)', () => {
      expect(ev.evaluate('"hello"', makeCtx())).toBe('hello');
    });

    it('evaluates string literals (single quotes)', () => {
      expect(ev.evaluate("'world'", makeCtx())).toBe('world');
    });

    it('evaluates boolean true', () => {
      expect(ev.evaluate('true', makeCtx())).toBe(true);
    });

    it('evaluates boolean false', () => {
      expect(ev.evaluate('false', makeCtx())).toBe(false);
    });

    it('evaluates null', () => {
      expect(ev.evaluate('null', makeCtx())).toBe(null);
    });
  });

  // -------------------------------------------------------------------------
  // Variable access
  // -------------------------------------------------------------------------
  describe('variable access', () => {
    it('accesses top-level variable via $.name', () => {
      expect(ev.evaluate('$.name', makeCtx({ name: 'Alice' }))).toBe('Alice');
    });

    it('accesses nested variable via $.a.b.c', () => {
      const ctx = makeCtx({ user: { profile: { age: 30 } } });
      expect(ev.evaluate('$.user.profile.age', ctx)).toBe(30);
    });

    it('returns undefined for missing variable', () => {
      expect(ev.evaluate('$.missing', makeCtx())).toBeUndefined();
    });

    it('accesses array element via $.arr.0', () => {
      const ctx = makeCtx({ arr: ['x', 'y', 'z'] });
      expect(ev.evaluate('$.arr.1', ctx)).toBe('y');
    });

    it('accesses step result by step id', () => {
      const ctx = makeCtx({}, { step1: { output: { id: 'node-123' } } });
      expect(ev.evaluate('$.step1.output.id', ctx)).toBe('node-123');
    });

    it('handles null intermediate values gracefully', () => {
      const ctx = makeCtx({ obj: null });
      expect(ev.evaluate('$.obj.nested', ctx)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Arithmetic
  // -------------------------------------------------------------------------
  describe('arithmetic', () => {
    it('adds numbers', () => {
      expect(ev.evaluate('2 + 3', makeCtx())).toBe(5);
    });

    it('subtracts numbers', () => {
      expect(ev.evaluate('10 - 4', makeCtx())).toBe(6);
    });

    it('multiplies numbers', () => {
      expect(ev.evaluate('3 * 4', makeCtx())).toBe(12);
    });

    it('divides numbers', () => {
      expect(ev.evaluate('10 / 4', makeCtx())).toBe(2.5);
    });

    it('concatenates strings with +', () => {
      expect(ev.evaluate('"hello" + " " + "world"', makeCtx())).toBe('hello world');
    });

    it('respects operator precedence', () => {
      expect(ev.evaluate('2 + 3 * 4', makeCtx())).toBe(14);
    });

    it('respects parentheses', () => {
      expect(ev.evaluate('(2 + 3) * 4', makeCtx())).toBe(20);
    });
  });

  // -------------------------------------------------------------------------
  // Comparisons
  // -------------------------------------------------------------------------
  describe('comparisons', () => {
    it('eq: returns true when equal', () => {
      expect(ev.evaluate('5 == 5', makeCtx())).toBe(true);
    });

    it('eq: returns false when not equal', () => {
      expect(ev.evaluate('5 == 6', makeCtx())).toBe(false);
    });

    it('ne: returns true when not equal', () => {
      expect(ev.evaluate('5 != 6', makeCtx())).toBe(true);
    });

    it('gt: returns true when greater', () => {
      expect(ev.evaluate('10 > 5', makeCtx())).toBe(true);
    });

    it('lt: returns true when less', () => {
      expect(ev.evaluate('3 < 7', makeCtx())).toBe(true);
    });

    it('gte: returns true when equal', () => {
      expect(ev.evaluate('5 >= 5', makeCtx())).toBe(true);
    });

    it('lte: returns true when less', () => {
      expect(ev.evaluate('4 <= 5', makeCtx())).toBe(true);
    });

    it('compares variable with literal', () => {
      const ctx = makeCtx({ count: 10 });
      expect(ev.evaluate('$.count > 5', ctx)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Built-in functions
  // -------------------------------------------------------------------------
  describe('built-in functions', () => {
    it('length() returns string length', () => {
      expect(ev.evaluate('length("hello")', makeCtx())).toBe(5);
    });

    it('length() returns array length', () => {
      const ctx = makeCtx({ items: [1, 2, 3] });
      expect(ev.evaluate('length($.items)', ctx)).toBe(3);
    });

    it('upper() uppercases string', () => {
      expect(ev.evaluate('upper("hello")', makeCtx())).toBe('HELLO');
    });

    it('lower() lowercases string', () => {
      expect(ev.evaluate('lower("WORLD")', makeCtx())).toBe('world');
    });

    it('now() returns ISO date string', () => {
      const result = ev.evaluate('now()', makeCtx());
      expect(typeof result).toBe('string');
      expect(new Date(result as string).getTime()).toBeGreaterThan(0);
    });

    it('first() returns first array element', () => {
      const ctx = makeCtx({ arr: [10, 20, 30] });
      expect(ev.evaluate('first($.arr)', ctx)).toBe(10);
    });

    it('last() returns last array element', () => {
      const ctx = makeCtx({ arr: [10, 20, 30] });
      expect(ev.evaluate('last($.arr)', ctx)).toBe(30);
    });

    it('count() returns array length', () => {
      const ctx = makeCtx({ arr: [1, 2, 3, 4] });
      expect(ev.evaluate('count($.arr)', ctx)).toBe(4);
    });

    it('contains() checks string inclusion', () => {
      expect(ev.evaluate('contains("hello world", "world")', makeCtx())).toBe(true);
    });

    it('contains() returns false when not found', () => {
      expect(ev.evaluate('contains("hello", "xyz")', makeCtx())).toBe(false);
    });

    it('matches() tests regex', () => {
      expect(ev.evaluate('matches("test@example.com", "^[\\\\w.]+@[\\\\w]+\\\\.[a-z]+")', makeCtx())).toBe(true);
    });

    it('trim() removes whitespace', () => {
      expect(ev.evaluate('trim("  hello  ")', makeCtx())).toBe('hello');
    });

    it('split() splits string', () => {
      const result = ev.evaluate('split("a,b,c", ",")', makeCtx());
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('join() joins array', () => {
      const ctx = makeCtx({ tags: ['a', 'b', 'c'] });
      expect(ev.evaluate('join($.tags, "-")', ctx)).toBe('a-b-c');
    });

    it('not() negates boolean', () => {
      expect(ev.evaluate('not(true)', makeCtx())).toBe(false);
    });

    it('coalesce() returns first non-null', () => {
      const ctx = makeCtx({ a: null, b: undefined, c: 'found' });
      expect(ev.evaluate('coalesce($.a, $.b, $.c)', ctx)).toBe('found');
    });

    it('min() returns minimum', () => {
      expect(ev.evaluate('min(3, 1, 2)', makeCtx())).toBe(1);
    });

    it('max() returns maximum', () => {
      expect(ev.evaluate('max(3, 1, 4, 1, 5)', makeCtx())).toBe(5);
    });

    it('abs() returns absolute value', () => {
      expect(ev.evaluate('abs(-42)', makeCtx())).toBe(42);
    });

    it('floor() rounds down', () => {
      expect(ev.evaluate('floor(3.9)', makeCtx())).toBe(3);
    });

    it('ceil() rounds up', () => {
      expect(ev.evaluate('ceil(3.1)', makeCtx())).toBe(4);
    });

    it('round() rounds to nearest', () => {
      expect(ev.evaluate('round(3.5)', makeCtx())).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // String interpolation
  // -------------------------------------------------------------------------
  describe('interpolate', () => {
    it('replaces simple variable placeholder', () => {
      const ctx = makeCtx({ name: 'Bob' });
      expect(ev.interpolate('Hello {{$.name}}!', ctx)).toBe('Hello Bob!');
    });

    it('replaces multiple placeholders', () => {
      const ctx = makeCtx({ first: 'John', last: 'Doe' });
      expect(ev.interpolate('{{$.first}} {{$.last}}', ctx)).toBe('John Doe');
    });

    it('replaces function call placeholder', () => {
      const ctx = makeCtx({ tags: ['a', 'b', 'c'] });
      const result = ev.interpolate('Count: {{count($.tags)}}', ctx);
      expect(result).toBe('Count: 3');
    });

    it('leaves template unchanged if no placeholders', () => {
      expect(ev.interpolate('No placeholders here.', makeCtx())).toBe('No placeholders here.');
    });

    it('replaces missing variable with empty string', () => {
      expect(ev.interpolate('Hello {{$.missing}}!', makeCtx())).toBe('Hello !');
    });
  });

  // -------------------------------------------------------------------------
  // resolveValue
  // -------------------------------------------------------------------------
  describe('resolveValue', () => {
    it('resolves $ expression in string', () => {
      const ctx = makeCtx({ id: 'abc' });
      expect(ev.resolveValue('$.id', ctx)).toBe('abc');
    });

    it('interpolates template string', () => {
      const ctx = makeCtx({ name: 'World' });
      expect(ev.resolveValue('Hello {{$.name}}', ctx)).toBe('Hello World');
    });

    it('returns plain string unchanged', () => {
      expect(ev.resolveValue('just a string', makeCtx())).toBe('just a string');
    });

    it('returns number unchanged', () => {
      expect(ev.resolveValue(42, makeCtx())).toBe(42);
    });

    it('resolves values recursively in objects', () => {
      const ctx = makeCtx({ name: 'Alice' });
      const result = ev.resolveValue({ greeting: 'Hello {{$.name}}', count: 1 }, ctx);
      expect(result).toEqual({ greeting: 'Hello Alice', count: 1 });
    });
  });

  // -------------------------------------------------------------------------
  // isTruthy
  // -------------------------------------------------------------------------
  describe('isTruthy', () => {
    it('null is falsy', () => expect(ev.isTruthy(null)).toBe(false));
    it('undefined is falsy', () => expect(ev.isTruthy(undefined)).toBe(false));
    it('false is falsy', () => expect(ev.isTruthy(false)).toBe(false));
    it('0 is falsy', () => expect(ev.isTruthy(0)).toBe(false));
    it('empty string is falsy', () => expect(ev.isTruthy('')).toBe(false));
    it('empty array is falsy', () => expect(ev.isTruthy([])).toBe(false));
    it('true is truthy', () => expect(ev.isTruthy(true)).toBe(true));
    it('1 is truthy', () => expect(ev.isTruthy(1)).toBe(true));
    it('non-empty string is truthy', () => expect(ev.isTruthy('hello')).toBe(true));
    it('non-empty array is truthy', () => expect(ev.isTruthy([1])).toBe(true));
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------
  describe('error cases', () => {
    it('throws on unknown function', () => {
      expect(() => ev.evaluate('unknownFn()', makeCtx())).toThrow();
    });

    it('throws on division by zero', () => {
      expect(() => ev.evaluate('5 / 0', makeCtx())).toThrow();
    });
  });
});
