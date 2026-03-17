import { describe, it, expect } from 'vitest';
import { builtinFilters } from '../filters.js';

const f = builtinFilters;

describe('Built-in Filters', () => {
  describe('String filters', () => {
    it('upper converts to uppercase', () => {
      expect(f['upper']!('hello')).toBe('HELLO');
    });

    it('lower converts to lowercase', () => {
      expect(f['lower']!('HELLO')).toBe('hello');
    });

    it('capitalize uppercases first char', () => {
      expect(f['capitalize']!('hello world')).toBe('Hello world');
    });

    it('title capitalizes each word', () => {
      expect(f['title']!('hello world')).toBe('Hello World');
    });

    it('trim removes whitespace', () => {
      expect(f['trim']!('  hello  ')).toBe('hello');
    });

    it('truncate cuts at length with suffix', () => {
      expect(f['truncate']!('Hello World', 8)).toBe('Hello...');
    });

    it('truncate with custom suffix', () => {
      expect(f['truncate']!('Hello World', 7, '…')).toBe('Hello W…');
    });

    it('truncate leaves short strings untouched', () => {
      expect(f['truncate']!('Hi', 10)).toBe('Hi');
    });

    it('slugify creates URL-safe slug', () => {
      expect(f['slugify']!('Hello World!')).toBe('hello-world');
      expect(f['slugify']!('  Multiple   Spaces  ')).toBe('multiple-spaces');
    });

    it('reverse reverses a string', () => {
      expect(f['reverse']!('abc')).toBe('cba');
    });

    it('replace replaces substrings', () => {
      expect(f['replace']!('hello world', 'world', 'earth')).toBe('hello earth');
    });

    it('wordcount counts words', () => {
      expect(f['wordcount']!('one two three')).toBe(3);
    });
  });

  describe('Number filters', () => {
    it('round rounds to nearest', () => {
      expect(f['round']!(3.7)).toBe(4);
      expect(f['round']!(3.2)).toBe(3);
    });

    it('round with precision', () => {
      expect(f['round']!(3.14159, 2)).toBe(3.14);
    });

    it('floor rounds down', () => {
      expect(f['floor']!(3.9)).toBe(3);
    });

    it('ceil rounds up', () => {
      expect(f['ceil']!(3.1)).toBe(4);
    });

    it('abs returns absolute value', () => {
      expect(f['abs']!(-5)).toBe(5);
      expect(f['abs']!(5)).toBe(5);
    });

    it('format formats with thousands separator', () => {
      const result = f['format']!(1234567.89, 2);
      expect(String(result)).toContain('1,234,567');
    });
  });

  describe('Date filters', () => {
    const date = new Date('2024-01-15T10:30:00Z');

    it('date formats a Date object', () => {
      const result = f['date']!(date, 'YYYY-MM-DD');
      expect(result).toMatch(/2024-01-1[45]/); // timezone may shift by 1
    });

    it('iso returns ISO string', () => {
      const result = f['iso']!(date);
      expect(String(result)).toContain('2024-01-15');
    });

    it('relative returns "just now" for recent', () => {
      const result = f['relative']!(new Date());
      expect(result).toBe('just now');
    });

    it('relative returns time ago', () => {
      const old = new Date(Date.now() - 2 * 60 * 1000); // 2 mins ago
      expect(f['relative']!(old)).toBe('2m ago');
    });
  });

  describe('Array filters', () => {
    const arr = [3, 1, 2];

    it('sort sorts an array', () => {
      expect(f['sort']!([...arr])).toEqual([1, 2, 3]);
    });

    it('reverse reverses an array', () => {
      expect(f['reverse']!([1, 2, 3])).toEqual([3, 2, 1]);
    });

    it('first returns first element', () => {
      expect(f['first']!([1, 2, 3])).toBe(1);
    });

    it('last returns last element', () => {
      expect(f['last']!([1, 2, 3])).toBe(3);
    });

    it('join joins with separator', () => {
      expect(f['join']!([1, 2, 3], '-')).toBe('1-2-3');
    });

    it('length returns array length', () => {
      expect(f['length']!([1, 2, 3])).toBe(3);
    });

    it('slice slices array', () => {
      expect(f['slice']!([1, 2, 3, 4], 1, 3)).toEqual([2, 3]);
    });

    it('unique deduplicates', () => {
      expect(f['unique']!([1, 2, 2, 3, 3])).toEqual([1, 2, 3]);
    });

    it('map maps over attribute', () => {
      const users = [{ name: 'Alice' }, { name: 'Bob' }];
      expect(f['map']!(users, 'name')).toEqual(['Alice', 'Bob']);
    });

    it('filter filters by attribute', () => {
      const items = [{ active: true }, { active: false }, { active: true }];
      const result = f['filter']!(items, 'active') as unknown[];
      expect(result).toHaveLength(2);
    });
  });

  describe('Object filters', () => {
    const obj = { a: 1, b: 2, c: 3 };

    it('keys returns object keys', () => {
      expect(f['keys']!(obj)).toEqual(['a', 'b', 'c']);
    });

    it('values returns object values', () => {
      expect(f['values']!(obj)).toEqual([1, 2, 3]);
    });

    it('entries returns key-value pairs', () => {
      expect(f['entries']!(obj)).toEqual([['a', 1], ['b', 2], ['c', 3]]);
    });

    it('json serializes to JSON', () => {
      expect(f['json']!({ x: 1 }, 0)).toBe('{"x":1}');
    });
  });

  describe('HTML filters', () => {
    it('escape escapes HTML entities', () => {
      expect(f['escape']!('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;'
      );
    });

    it('escape escapes quotes', () => {
      expect(f['escape']!('"hello"')).toBe('&quot;hello&quot;');
    });

    it('unescape unescapes HTML entities', () => {
      expect(f['unescape']!('&lt;b&gt;')).toBe('<b>');
    });

    it('striptags removes HTML tags', () => {
      expect(f['striptags']!('<b>bold</b> text')).toBe('bold text');
    });

    it('nl2br converts newlines to <br>', () => {
      expect(f['nl2br']!('line1\nline2')).toBe('line1<br>\nline2');
    });

    it('urlize converts URLs to links', () => {
      const result = f['urlize']!('visit https://example.com now');
      expect(String(result)).toContain('<a href="https://example.com">');
    });
  });

  describe('Utility filters', () => {
    it('default returns fallback for undefined', () => {
      expect(f['default']!(undefined, 'fallback')).toBe('fallback');
    });

    it('default returns fallback for null', () => {
      expect(f['default']!(null, 'fallback')).toBe('fallback');
    });

    it('default returns fallback for empty string', () => {
      expect(f['default']!('', 'fallback')).toBe('fallback');
    });

    it('default returns value when set', () => {
      expect(f['default']!('hello', 'fallback')).toBe('hello');
    });

    it('length works on strings', () => {
      expect(f['length']!('hello')).toBe(5);
    });

    it('length works on objects', () => {
      expect(f['length']!({ a: 1, b: 2 })).toBe(2);
    });
  });
});
