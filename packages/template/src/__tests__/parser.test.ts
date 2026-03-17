import { describe, it, expect } from 'vitest';
import { parse } from '../parser.js';

describe('Parser', () => {
  describe('text nodes', () => {
    it('parses plain text', () => {
      const ast = parse('hello world');
      expect(ast).toHaveLength(1);
      expect(ast[0]).toMatchObject({ type: 'text', value: 'hello world' });
    });

    it('parses empty string', () => {
      const ast = parse('');
      expect(ast).toHaveLength(0);
    });
  });

  describe('variable nodes', () => {
    it('parses simple variable', () => {
      const ast = parse('{{ name }}');
      expect(ast[0]).toMatchObject({
        type: 'variable',
        expression: { type: 'identifier', name: 'name' },
        filters: [],
      });
    });

    it('parses dot notation', () => {
      const ast = parse('{{ user.name }}');
      expect(ast[0]).toMatchObject({
        type: 'variable',
        expression: {
          type: 'member',
          property: 'name',
          object: { type: 'identifier', name: 'user' },
        },
      });
    });

    it('parses deeply nested dot notation', () => {
      const ast = parse('{{ a.b.c }}');
      const node = ast[0];
      expect(node?.type).toBe('variable');
      if (node?.type === 'variable') {
        expect(node.expression).toMatchObject({
          type: 'member',
          property: 'c',
          object: {
            type: 'member',
            property: 'b',
            object: { type: 'identifier', name: 'a' },
          },
        });
      }
    });

    it('parses variable with filter', () => {
      const ast = parse('{{ name | upper }}');
      expect(ast[0]).toMatchObject({
        type: 'variable',
        filters: [{ name: 'upper', args: [] }],
      });
    });

    it('parses multiple filters', () => {
      const ast = parse('{{ name | lower | capitalize }}');
      expect(ast[0]).toMatchObject({
        type: 'variable',
        filters: [
          { name: 'lower', args: [] },
          { name: 'capitalize', args: [] },
        ],
      });
    });

    it('parses filter with arguments', () => {
      const ast = parse('{{ text | truncate(100) }}');
      const node = ast[0];
      expect(node?.type).toBe('variable');
      if (node?.type === 'variable') {
        expect(node.filters[0]).toMatchObject({
          name: 'truncate',
          args: [{ type: 'literal', value: 100 }],
        });
      }
    });

    it('parses string literal variable', () => {
      const ast = parse('{{ "hello" }}');
      expect(ast[0]).toMatchObject({
        type: 'variable',
        expression: { type: 'literal', value: 'hello' },
      });
    });
  });

  describe('if blocks', () => {
    it('parses simple if', () => {
      const ast = parse('{% if x %}yes{% endif %}');
      expect(ast[0]).toMatchObject({
        type: 'if',
        condition: { type: 'identifier', name: 'x' },
        alternate: null,
      });
    });

    it('parses if/else', () => {
      const ast = parse('{% if x %}yes{% else %}no{% endif %}');
      expect(ast[0]).toMatchObject({
        type: 'if',
        alternate: [{ type: 'text', value: 'no' }],
      });
    });

    it('parses if/elif/else', () => {
      const ast = parse('{% if a %}A{% elif b %}B{% else %}C{% endif %}');
      const node = ast[0];
      expect(node?.type).toBe('if');
      if (node?.type === 'if') {
        expect(node.elseifs).toHaveLength(1);
        expect(node.elseifs[0]?.condition).toMatchObject({ type: 'identifier', name: 'b' });
        expect(node.alternate).toMatchObject([{ type: 'text', value: 'C' }]);
      }
    });

    it('parses nested if', () => {
      const ast = parse('{% if x %}{% if y %}inner{% endif %}{% endif %}');
      const outer = ast[0];
      expect(outer?.type).toBe('if');
      if (outer?.type === 'if') {
        expect(outer.consequent[0]?.type).toBe('if');
      }
    });
  });

  describe('for loops', () => {
    it('parses basic for loop', () => {
      const ast = parse('{% for item in items %}{{ item }}{% endfor %}');
      expect(ast[0]).toMatchObject({
        type: 'for',
        variable: 'item',
        iterable: { type: 'identifier', name: 'items' },
      });
    });

    it('parses for/else', () => {
      const ast = parse('{% for item in items %}{{ item }}{% else %}empty{% endfor %}');
      const node = ast[0];
      expect(node?.type).toBe('for');
      if (node?.type === 'for') {
        expect(node.elseBody).toMatchObject([{ type: 'text', value: 'empty' }]);
      }
    });
  });

  describe('block tags', () => {
    it('parses block tag', () => {
      const ast = parse('{% block content %}hello{% endblock %}');
      expect(ast[0]).toMatchObject({
        type: 'block',
        name: 'content',
        body: [{ type: 'text', value: 'hello' }],
      });
    });
  });

  describe('extends', () => {
    it('parses extends tag', () => {
      const ast = parse('{% extends "base" %}');
      expect(ast[0]).toMatchObject({ type: 'extends', template: 'base' });
    });
  });

  describe('include', () => {
    it('parses include tag', () => {
      const ast = parse('{% include "partial" %}');
      expect(ast[0]).toMatchObject({ type: 'include', template: 'partial' });
    });
  });

  describe('set', () => {
    it('parses set tag', () => {
      const ast = parse('{% set x = 42 %}');
      expect(ast[0]).toMatchObject({
        type: 'set',
        variable: 'x',
        value: { type: 'literal', value: 42 },
      });
    });
  });

  describe('macro', () => {
    it('parses macro definition', () => {
      const ast = parse('{% macro greet(name) %}Hello {{ name }}{% endmacro %}');
      expect(ast[0]).toMatchObject({
        type: 'macro',
        name: 'greet',
        params: ['name'],
      });
    });
  });

  describe('call', () => {
    it('parses call tag', () => {
      const ast = parse('{% call greet("Alice") %}');
      expect(ast[0]).toMatchObject({
        type: 'call',
        macro: 'greet',
        args: [{ type: 'literal', value: 'Alice' }],
      });
    });
  });

  describe('comments', () => {
    it('ignores comments', () => {
      const ast = parse('before{# this is ignored #}after');
      expect(ast).toHaveLength(2);
      expect(ast[0]).toMatchObject({ type: 'text', value: 'before' });
      expect(ast[1]).toMatchObject({ type: 'text', value: 'after' });
    });
  });

  describe('error handling', () => {
    it('throws ParseError on unclosed block', () => {
      expect(() => parse('{% if x %}')).toThrow();
    });

    it('throws ParseError on unknown block tag', () => {
      expect(() => parse('{% unknowntag %}')).toThrow();
    });
  });

  describe('line tracking', () => {
    it('tracks line numbers on nodes', () => {
      const ast = parse('\n{{ x }}');
      const varNode = ast.find((n) => n.type === 'variable');
      expect(varNode?.line).toBe(2);
    });
  });
});
