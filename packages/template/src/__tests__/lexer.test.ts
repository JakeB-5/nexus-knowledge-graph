import { describe, it, expect } from 'vitest';
import { tokenize, TokenStream } from '../lexer.js';

describe('Lexer', () => {
  describe('text tokens', () => {
    it('tokenizes plain text', () => {
      const tokens = tokenize('hello world');
      expect(tokens[0]).toMatchObject({ type: 'text', value: 'hello world' });
      expect(tokens[1]).toMatchObject({ type: 'eof' });
    });

    it('tokenizes empty string', () => {
      const tokens = tokenize('');
      expect(tokens[0]).toMatchObject({ type: 'eof' });
    });

    it('tracks line numbers in text', () => {
      const tokens = tokenize('line1\nline2');
      expect(tokens[0]).toMatchObject({ type: 'text', value: 'line1\nline2' });
    });
  });

  describe('variable tokens', () => {
    it('tokenizes {{ variable }}', () => {
      const tokens = tokenize('{{ name }}');
      expect(tokens[0]).toMatchObject({ type: 'open_var', value: '{{' });
      expect(tokens[1]).toMatchObject({ type: 'identifier', value: 'name' });
      expect(tokens[2]).toMatchObject({ type: 'close_var', value: '}}' });
    });

    it('tokenizes variable with filter', () => {
      const tokens = tokenize('{{ name | upper }}');
      expect(tokens[0]).toMatchObject({ type: 'open_var' });
      expect(tokens[1]).toMatchObject({ type: 'identifier', value: 'name' });
      expect(tokens[2]).toMatchObject({ type: 'pipe', value: '|' });
      expect(tokens[3]).toMatchObject({ type: 'identifier', value: 'upper' });
      expect(tokens[4]).toMatchObject({ type: 'close_var' });
    });

    it('tokenizes dot notation', () => {
      const tokens = tokenize('{{ user.name }}');
      expect(tokens[1]).toMatchObject({ type: 'identifier', value: 'user' });
      expect(tokens[2]).toMatchObject({ type: 'dot', value: '.' });
      expect(tokens[3]).toMatchObject({ type: 'identifier', value: 'name' });
    });

    it('tokenizes string literals', () => {
      const tokens = tokenize('{{ "hello" }}');
      expect(tokens[1]).toMatchObject({ type: 'string', value: 'hello' });
    });

    it('tokenizes number literals', () => {
      const tokens = tokenize('{{ 42 }}');
      expect(tokens[1]).toMatchObject({ type: 'number', value: '42' });
    });

    it('tokenizes boolean literals', () => {
      const tokens = tokenize('{{ true }}');
      expect(tokens[1]).toMatchObject({ type: 'boolean', value: 'true' });
    });

    it('tokenizes null', () => {
      const tokens = tokenize('{{ null }}');
      expect(tokens[1]).toMatchObject({ type: 'null', value: 'null' });
    });

    it('tokenizes filter with args', () => {
      const tokens = tokenize('{{ text | truncate(50) }}');
      // open_var, identifier, pipe, identifier, lparen, number, rparen, close_var
      expect(tokens[4]).toMatchObject({ type: 'lparen' });
      expect(tokens[5]).toMatchObject({ type: 'number', value: '50' });
      expect(tokens[6]).toMatchObject({ type: 'rparen' });
    });
  });

  describe('block tokens', () => {
    it('tokenizes {% block %}', () => {
      const tokens = tokenize('{% if x %}');
      expect(tokens[0]).toMatchObject({ type: 'open_block', value: '{%' });
      expect(tokens[1]).toMatchObject({ type: 'identifier', value: 'if' });
      expect(tokens[2]).toMatchObject({ type: 'identifier', value: 'x' });
      expect(tokens[3]).toMatchObject({ type: 'close_block', value: '%}' });
    });

    it('tokenizes for loop', () => {
      const tokens = tokenize('{% for item in items %}');
      expect(tokens[1]).toMatchObject({ type: 'identifier', value: 'for' });
      expect(tokens[2]).toMatchObject({ type: 'identifier', value: 'item' });
      expect(tokens[3]).toMatchObject({ type: 'identifier', value: 'in' });
      expect(tokens[4]).toMatchObject({ type: 'identifier', value: 'items' });
    });
  });

  describe('comment tokens', () => {
    it('tokenizes {# comment #}', () => {
      const tokens = tokenize('{# this is a comment #}');
      expect(tokens[0]).toMatchObject({ type: 'open_comment' });
      expect(tokens[1]).toMatchObject({ type: 'close_comment' });
    });

    it('text before and after comment is preserved', () => {
      const tokens = tokenize('before{# comment #}after');
      expect(tokens[0]).toMatchObject({ type: 'text', value: 'before' });
      expect(tokens[3]).toMatchObject({ type: 'text', value: 'after' });
    });
  });

  describe('escape sequences', () => {
    it('handles escaped {{ in text', () => {
      const tokens = tokenize('\\{{ not a variable }}');
      expect(tokens[0]).toMatchObject({ type: 'text', value: '{{ not a variable }}' });
    });
  });

  describe('mixed content', () => {
    it('tokenizes template with text and variable', () => {
      const tokens = tokenize('Hello, {{ name }}!');
      expect(tokens[0]).toMatchObject({ type: 'text', value: 'Hello, ' });
      expect(tokens[1]).toMatchObject({ type: 'open_var' });
      expect(tokens[2]).toMatchObject({ type: 'identifier', value: 'name' });
      expect(tokens[3]).toMatchObject({ type: 'close_var' });
      expect(tokens[4]).toMatchObject({ type: 'text', value: '!' });
    });

    it('tracks line/column numbers', () => {
      const tokens = tokenize('line1\n{{ x }}');
      const openVar = tokens.find((t) => t.type === 'open_var');
      expect(openVar?.line).toBe(2);
    });
  });

  describe('operators', () => {
    it('tokenizes == operator', () => {
      const tokens = tokenize('{% if x == 1 %}');
      const op = tokens.find((t) => t.type === 'operator');
      expect(op?.value).toBe('==');
    });

    it('tokenizes != operator', () => {
      const tokens = tokenize('{% if x != 1 %}');
      const op = tokens.find((t) => t.type === 'operator');
      expect(op?.value).toBe('!=');
    });
  });

  describe('TokenStream', () => {
    it('peek does not consume', () => {
      const tokens = tokenize('{{ x }}');
      const stream = new TokenStream(tokens);
      stream.expect('open_var');
      const peeked = stream.peek();
      const next = stream.next();
      expect(peeked).toBe(next);
    });

    it('expect throws on wrong type', () => {
      const tokens = tokenize('{{ x }}');
      const stream = new TokenStream(tokens);
      expect(() => stream.expect('identifier')).toThrow();
    });

    it('isEof returns true at end', () => {
      const tokens = tokenize('');
      const stream = new TokenStream(tokens);
      expect(stream.isEof()).toBe(true);
    });
  });
});
