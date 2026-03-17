import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateEngine } from '../engine.js';

describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  describe('basic rendering', () => {
    it('renders plain text', () => {
      expect(engine.renderString('Hello, world!')).toBe('Hello, world!');
    });

    it('renders variable interpolation', () => {
      expect(engine.renderString('Hello, {{ name }}!', { name: 'Alice' })).toBe('Hello, Alice!');
    });

    it('renders undefined variable as empty string', () => {
      expect(engine.renderString('{{ missing }}')).toBe('');
    });

    it('renders null variable as empty string', () => {
      expect(engine.renderString('{{ x }}', { x: null })).toBe('');
    });

    it('renders number variables', () => {
      expect(engine.renderString('{{ count }}', { count: 42 })).toBe('42');
    });

    it('renders boolean variables', () => {
      expect(engine.renderString('{{ flag }}', { flag: true })).toBe('true');
    });
  });

  describe('dot notation', () => {
    it('resolves nested properties', () => {
      expect(engine.renderString('{{ user.name }}', { user: { name: 'Bob' } })).toBe('Bob');
    });

    it('resolves deeply nested properties', () => {
      expect(
        engine.renderString('{{ a.b.c }}', { a: { b: { c: 'deep' } } })
      ).toBe('deep');
    });

    it('returns empty for missing nested property', () => {
      expect(engine.renderString('{{ user.missing }}', { user: {} })).toBe('');
    });

    it('returns empty for null parent', () => {
      expect(engine.renderString('{{ user.name }}', { user: null })).toBe('');
    });
  });

  describe('filters', () => {
    it('applies upper filter', () => {
      expect(engine.renderString('{{ name | upper }}', { name: 'alice' })).toBe('ALICE');
    });

    it('applies lower filter', () => {
      expect(engine.renderString('{{ name | lower }}', { name: 'ALICE' })).toBe('alice');
    });

    it('applies capitalize filter', () => {
      expect(engine.renderString('{{ name | capitalize }}', { name: 'hello world' })).toBe('Hello world');
    });

    it('applies truncate filter with length', () => {
      const result = engine.renderString('{{ text | truncate(5) }}', { text: 'Hello World' });
      expect(result).toBe('He...');
    });

    it('chains multiple filters', () => {
      expect(engine.renderString('{{ name | upper | truncate(3) }}', { name: 'alice' })).toBe('ALI');
    });

    it('applies default filter', () => {
      expect(engine.renderString('{{ x | default("fallback") }}')).toBe('fallback');
    });

    it('applies join filter on array', () => {
      expect(
        engine.renderString('{{ items | join(", ") }}', { items: ['a', 'b', 'c'] })
      ).toBe('a, b, c');
    });

    it('applies length filter', () => {
      expect(engine.renderString('{{ items | length }}', { items: [1, 2, 3] })).toBe('3');
    });

    it('throws on unknown filter', () => {
      expect(() => engine.renderString('{{ x | unknownfilter }}', { x: 'test' })).toThrow();
    });
  });

  describe('if blocks', () => {
    it('renders if when condition is true', () => {
      expect(engine.renderString('{% if show %}yes{% endif %}', { show: true })).toBe('yes');
    });

    it('renders empty when condition is false', () => {
      expect(engine.renderString('{% if show %}yes{% endif %}', { show: false })).toBe('');
    });

    it('renders else branch', () => {
      expect(
        engine.renderString('{% if show %}yes{% else %}no{% endif %}', { show: false })
      ).toBe('no');
    });

    it('renders elif branch', () => {
      const tmpl = '{% if a %}A{% elif b %}B{% else %}C{% endif %}';
      expect(engine.renderString(tmpl, { a: false, b: true })).toBe('B');
      expect(engine.renderString(tmpl, { a: false, b: false })).toBe('C');
      expect(engine.renderString(tmpl, { a: true, b: false })).toBe('A');
    });

    it('treats empty array as falsy', () => {
      expect(engine.renderString('{% if items %}yes{% endif %}', { items: [] })).toBe('');
    });

    it('treats non-empty array as truthy', () => {
      expect(engine.renderString('{% if items %}yes{% endif %}', { items: [1] })).toBe('yes');
    });

    it('treats zero as falsy', () => {
      expect(engine.renderString('{% if count %}yes{% endif %}', { count: 0 })).toBe('');
    });

    it('supports nested if blocks', () => {
      expect(
        engine.renderString('{% if a %}{% if b %}both{% endif %}{% endif %}', { a: true, b: true })
      ).toBe('both');
    });
  });

  describe('for loops', () => {
    it('renders loop body for each item', () => {
      expect(
        engine.renderString('{% for x in items %}{{ x }},{% endfor %}', { items: [1, 2, 3] })
      ).toBe('1,2,3,');
    });

    it('renders else body when list is empty', () => {
      expect(
        engine.renderString('{% for x in items %}{{ x }}{% else %}empty{% endfor %}', { items: [] })
      ).toBe('empty');
    });

    it('exposes loop.index (1-based)', () => {
      expect(
        engine.renderString('{% for x in items %}{{ loop.index }}{% endfor %}', { items: ['a', 'b'] })
      ).toBe('12');
    });

    it('exposes loop.index0 (0-based)', () => {
      expect(
        engine.renderString('{% for x in items %}{{ loop.index0 }}{% endfor %}', { items: ['a', 'b'] })
      ).toBe('01');
    });

    it('exposes loop.first and loop.last', () => {
      const tmpl = '{% for x in items %}{% if loop.first %}F{% endif %}{% if loop.last %}L{% endif %}{% endfor %}';
      expect(engine.renderString(tmpl, { items: [1, 2, 3] })).toBe('FL');
    });

    it('exposes loop.length', () => {
      expect(
        engine.renderString('{% for x in items %}{{ loop.length }}{% endfor %}', { items: [1, 2] })
      ).toBe('22');
    });
  });

  describe('set tag', () => {
    it('sets a variable', () => {
      expect(engine.renderString('{% set x = 42 %}{{ x }}')).toBe('42');
    });

    it('sets a string variable', () => {
      expect(engine.renderString('{% set msg = "hello" %}{{ msg }}')).toBe('hello');
    });
  });

  describe('auto-escaping', () => {
    it('escapes HTML in variables by default', () => {
      expect(engine.renderString('{{ html }}', { html: '<script>alert(1)</script>' }))
        .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('does not double-escape', () => {
      const e = new TemplateEngine({ autoEscape: false });
      expect(e.renderString('{{ html }}', { html: '<b>bold</b>' })).toBe('<b>bold</b>');
    });
  });

  describe('named templates', () => {
    it('renders registered template by name', () => {
      engine.registerTemplate('hello', 'Hello, {{ name }}!');
      expect(engine.render('hello', { name: 'World' })).toBe('Hello, World!');
    });

    it('throws on unknown template', () => {
      expect(() => engine.render('nonexistent')).toThrow();
    });
  });

  describe('partials / includes', () => {
    it('renders included partial', () => {
      engine.registerPartial('header', '<h1>{{ title }}</h1>');
      const result = engine.renderString('{% include "header" %}', { title: 'My Page' });
      expect(result).toBe('<h1>My Page</h1>');
    });

    it('throws on missing include', () => {
      expect(() => engine.renderString('{% include "missing" %}')).toThrow();
    });
  });

  describe('template inheritance', () => {
    it('renders child blocks in parent', () => {
      engine.registerTemplate('base', '<html>{% block body %}default{% endblock %}</html>');
      engine.registerTemplate('child', '{% extends "base" %}{% block body %}override{% endblock %}');
      expect(engine.render('child')).toBe('<html>override</html>');
    });

    it('uses default block content when child does not override', () => {
      engine.registerTemplate('base', '<html>{% block body %}default{% endblock %}</html>');
      engine.registerTemplate('child2', '{% extends "base" %}');
      expect(engine.render('child2')).toBe('<html>default</html>');
    });
  });

  describe('macros', () => {
    it('defines and calls macro', () => {
      const tmpl = '{% macro greet(name) %}Hello, {{ name }}!{% endmacro %}{% call greet("Alice") %}';
      expect(engine.renderString(tmpl)).toBe('Hello, Alice!');
    });
  });

  describe('custom filters', () => {
    it('registers and uses custom filter', () => {
      engine.registerFilter('shout', (v) => String(v).toUpperCase() + '!!!');
      expect(engine.renderString('{{ msg | shout }}', { msg: 'hello' })).toBe('HELLO!!!');
    });
  });

  describe('comments', () => {
    it('ignores comments in output', () => {
      expect(engine.renderString('before{# ignored #}after')).toBe('beforeafter');
    });
  });

  describe('raw blocks', () => {
    it('outputs raw content without processing', () => {
      const result = engine.renderString('{% raw %}{{ not_rendered }}{% endraw %}');
      expect(result).toContain('not_rendered');
    });
  });

  describe('compile and reuse', () => {
    it('compiles template and renders with different contexts', () => {
      const compiled = engine.compile('Hello, {{ name }}!');
      expect(compiled.render({ name: 'Alice' })).toBe('Hello, Alice!');
      expect(compiled.render({ name: 'Bob' })).toBe('Hello, Bob!');
    });
  });
});
