import { describe, it, expect } from 'vitest';
import { ConditionBuilder, compileConditions, where } from '../conditions.js';
import { Operator } from '../types.js';

describe('ConditionBuilder', () => {
  describe('comparison conditions', () => {
    it('eq generates = ?', () => {
      const cb = new ConditionBuilder().eq('name', 'Alice');
      const { sql, params } = compileConditions(cb.build(), []);
      expect(sql).toBe('name = ?');
      expect(params).toEqual(['Alice']);
    });

    it('ne generates != ?', () => {
      const { sql } = compileConditions(new ConditionBuilder().ne('status', 'deleted').build(), []);
      expect(sql).toContain('!=');
    });

    it('gt generates > ?', () => {
      const { sql, params } = compileConditions(new ConditionBuilder().gt('age', 18).build(), []);
      expect(sql).toBe('age > ?');
      expect(params).toEqual([18]);
    });

    it('gte generates >= ?', () => {
      const { sql } = compileConditions(new ConditionBuilder().gte('score', 90).build(), []);
      expect(sql).toContain('>=');
    });

    it('lt generates < ?', () => {
      const { sql } = compileConditions(new ConditionBuilder().lt('price', 100).build(), []);
      expect(sql).toContain('<');
    });

    it('lte generates <= ?', () => {
      const { sql } = compileConditions(new ConditionBuilder().lte('rank', 5).build(), []);
      expect(sql).toContain('<=');
    });
  });

  describe('string conditions', () => {
    it('like generates LIKE ?', () => {
      const { sql, params } = compileConditions(new ConditionBuilder().like('name', '%graph%').build(), []);
      expect(sql).toContain('LIKE ?');
      expect(params).toContain('%graph%');
    });

    it('ilike generates ILIKE ?', () => {
      const { sql } = compileConditions(new ConditionBuilder().ilike('name', '%test%').build(), []);
      expect(sql).toContain('ILIKE ?');
    });

    it('startsWith adds % suffix to value', () => {
      const { sql, params } = compileConditions(new ConditionBuilder().startsWith('name', 'Neo').build(), []);
      expect(sql).toContain('LIKE ?');
      expect(params).toContain('Neo%');
    });

    it('endsWith adds % prefix to value', () => {
      const { sql, params } = compileConditions(new ConditionBuilder().endsWith('name', 'graph').build(), []);
      expect(params).toContain('%graph');
    });

    it('contains wraps value in %', () => {
      const { sql, params } = compileConditions(new ConditionBuilder().contains('name', 'nexus').build(), []);
      expect(params).toContain('%nexus%');
    });
  });

  describe('set conditions', () => {
    it('in generates IN (?, ?, ?)', () => {
      const { sql, params } = compileConditions(
        new ConditionBuilder().in('type', ['a', 'b', 'c']).build(), []
      );
      expect(sql).toContain('IN (?, ?, ?)');
      expect(params).toEqual(['a', 'b', 'c']);
    });

    it('notIn generates NOT IN', () => {
      const { sql } = compileConditions(new ConditionBuilder().notIn('type', ['deleted']).build(), []);
      expect(sql).toContain('NOT IN');
    });

    it('in with empty array generates 1=0', () => {
      const { sql } = compileConditions(new ConditionBuilder().in('id', []).build(), []);
      expect(sql).toBe('1=0');
    });

    it('notIn with empty array generates 1=1', () => {
      const { sql } = compileConditions(new ConditionBuilder().notIn('id', []).build(), []);
      expect(sql).toBe('1=1');
    });

    it('between generates BETWEEN ? AND ?', () => {
      const { sql, params } = compileConditions(
        new ConditionBuilder().between('age', 18, 65).build(), []
      );
      expect(sql).toContain('BETWEEN ? AND ?');
      expect(params).toEqual([18, 65]);
    });

    it('notBetween generates NOT BETWEEN', () => {
      const { sql } = compileConditions(new ConditionBuilder().notBetween('score', 0, 50).build(), []);
      expect(sql).toContain('NOT BETWEEN');
    });
  });

  describe('null conditions', () => {
    it('isNull generates IS NULL', () => {
      const { sql } = compileConditions(new ConditionBuilder().isNull('deleted_at').build(), []);
      expect(sql).toBe('deleted_at IS NULL');
    });

    it('isNotNull generates IS NOT NULL', () => {
      const { sql } = compileConditions(new ConditionBuilder().isNotNull('email').build(), []);
      expect(sql).toBe('email IS NOT NULL');
    });
  });

  describe('logical combinators', () => {
    it('multiple conditions join with AND by default', () => {
      const { sql } = compileConditions(
        new ConditionBuilder().eq('a', 1).eq('b', 2).build(), []
      );
      expect(sql).toContain('AND');
    });

    it('and() creates grouped AND condition', () => {
      const cb = new ConditionBuilder();
      cb.eq('x', 1).and((b) => b.eq('y', 2).eq('z', 3));
      const { sql } = compileConditions(cb.build(), []);
      expect(sql).toContain('(');
      expect(sql).toContain(')');
    });

    it('or() creates grouped OR condition', () => {
      const cb = new ConditionBuilder();
      cb.or((b) => b.eq('type', 'admin').eq('type', 'moderator'));
      const { sql } = compileConditions(cb.build(), []);
      expect(sql).toContain('(');
    });

    it('not() wraps condition in NOT (...)', () => {
      const cb = new ConditionBuilder();
      cb.not((b) => b.eq('status', 'deleted'));
      const { sql } = compileConditions(cb.build(), []);
      expect(sql).toContain('NOT (');
    });
  });

  describe('raw conditions', () => {
    it('raw generates custom SQL', () => {
      const { sql, params } = compileConditions(
        new ConditionBuilder().raw('LOWER(name) = ?', ['test']).build(), []
      );
      expect(sql).toContain('LOWER(name) = ?');
      expect(params).toContain('test');
    });

    it('exists generates EXISTS (...)', () => {
      const { sql } = compileConditions(
        new ConditionBuilder().exists('SELECT 1 FROM admins WHERE id = user_id').build(), []
      );
      expect(sql).toContain('EXISTS (');
    });

    it('notExists generates NOT EXISTS (...)', () => {
      const { sql } = compileConditions(
        new ConditionBuilder().notExists('SELECT 1 FROM bans WHERE user_id = id').build(), []
      );
      expect(sql).toContain('NOT EXISTS (');
    });
  });

  describe('isEmpty', () => {
    it('returns true for empty builder', () => {
      expect(new ConditionBuilder().isEmpty()).toBe(true);
    });

    it('returns false after adding condition', () => {
      expect(new ConditionBuilder().eq('x', 1).isEmpty()).toBe(false);
    });
  });

  describe('where factory', () => {
    it('creates a ConditionBuilder with initial condition', () => {
      const cb = where('name', Operator.EQ, 'Alice');
      const { sql } = compileConditions(cb.build(), []);
      expect(sql).toContain('name = ?');
    });
  });

  describe('compileConditions', () => {
    it('returns empty sql for empty conditions', () => {
      const { sql } = compileConditions([], []);
      expect(sql).toBe('');
    });

    it('first condition has no leading AND/OR', () => {
      const cb = new ConditionBuilder().eq('id', 1);
      const { sql } = compileConditions(cb.build(), []);
      expect(sql.trimStart()).not.toMatch(/^(AND|OR)/);
    });
  });
});
