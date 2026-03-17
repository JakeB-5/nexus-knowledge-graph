import { describe, it, expect } from 'vitest';
import { QueryBuilder, query } from '../builder.js';
import { Operator, SortDirection, JoinType } from '../types.js';

describe('QueryBuilder', () => {
  describe('basic SELECT', () => {
    it('selects all fields by default', () => {
      const { sql } = query().from('users').toSQL();
      expect(sql).toBe('SELECT * FROM users');
    });

    it('selects specific fields', () => {
      const { sql } = query().select('id', 'name', 'email').from('users').toSQL();
      expect(sql).toBe('SELECT id, name, email FROM users');
    });

    it('selects with alias', () => {
      const { sql } = query()
        .select({ field: 'user_name', alias: 'name' })
        .from('users')
        .toSQL();
      expect(sql).toContain('user_name AS name');
    });

    it('selects with raw expression', () => {
      const { sql } = query()
        .select({ raw: 'COUNT(*) AS total' })
        .from('users')
        .toSQL();
      expect(sql).toContain('COUNT(*) AS total');
    });

    it('DISTINCT select', () => {
      const { sql } = query().select('type').distinct().from('nodes').toSQL();
      expect(sql).toContain('SELECT DISTINCT type');
    });
  });

  describe('FROM clause', () => {
    it('from table', () => {
      const { sql } = query().from('users').toSQL();
      expect(sql).toContain('FROM users');
    });

    it('from table with alias', () => {
      const { sql } = query().from('users', 'u').toSQL();
      expect(sql).toContain('FROM users AS u');
    });
  });

  describe('WHERE conditions', () => {
    it('simple where eq', () => {
      const { sql, params } = query().from('users').where('id', Operator.EQ, 1).toSQL();
      expect(sql).toContain('WHERE id = ?');
      expect(params).toEqual([1]);
    });

    it('where ne', () => {
      const { sql, params } = query().from('users').where('status', Operator.NE, 'inactive').toSQL();
      expect(sql).toContain('status != ?');
      expect(params).toContain('inactive');
    });

    it('where gt / gte / lt / lte', () => {
      const { sql, params } = query()
        .from('nodes')
        .where('weight', Operator.GT, 5)
        .where('weight', Operator.LTE, 100)
        .toSQL();
      expect(sql).toContain('weight > ?');
      expect(sql).toContain('weight <= ?');
      expect(params).toEqual([5, 100]);
    });

    it('andWhere chains with AND', () => {
      const { sql } = query()
        .from('users')
        .where('active', Operator.EQ, true)
        .andWhere('role', Operator.EQ, 'admin')
        .toSQL();
      expect(sql).toContain('AND role = ?');
    });

    it('orWhere chains with OR', () => {
      const { sql } = query()
        .from('users')
        .where('role', Operator.EQ, 'admin')
        .orWhere('role', Operator.EQ, 'moderator')
        .toSQL();
      expect(sql).toContain('OR role = ?');
    });

    it('whereIn', () => {
      const { sql, params } = query()
        .from('nodes')
        .whereIn('type', ['concept', 'entity', 'person'])
        .toSQL();
      expect(sql).toContain('IN (?, ?, ?)');
      expect(params).toEqual(['concept', 'entity', 'person']);
    });

    it('whereNotIn', () => {
      const { sql } = query().from('nodes').whereNotIn('type', ['deleted']).toSQL();
      expect(sql).toContain('NOT IN');
    });

    it('whereBetween', () => {
      const { sql, params } = query()
        .from('nodes')
        .whereBetween('weight', 1, 10)
        .toSQL();
      expect(sql).toContain('BETWEEN ? AND ?');
      expect(params).toEqual([1, 10]);
    });

    it('whereNull', () => {
      const { sql } = query().from('nodes').whereNull('deleted_at').toSQL();
      expect(sql).toContain('deleted_at IS NULL');
    });

    it('whereNotNull', () => {
      const { sql } = query().from('nodes').whereNotNull('published_at').toSQL();
      expect(sql).toContain('published_at IS NOT NULL');
    });

    it('whereLike', () => {
      const { sql, params } = query().from('nodes').whereLike('name', '%graph%').toSQL();
      expect(sql).toContain('LIKE ?');
      expect(params).toContain('%graph%');
    });

    it('whereRaw', () => {
      const { sql, params } = query()
        .from('nodes')
        .whereRaw('LOWER(name) = ?', ['test'])
        .toSQL();
      expect(sql).toContain('LOWER(name) = ?');
      expect(params).toContain('test');
    });

    it('grouped where conditions', () => {
      const { sql } = query()
        .from('nodes')
        .where('active', Operator.EQ, true)
        .whereGroup((cb) => {
          cb.eq('type', 'concept').eq('type', 'entity');
        })
        .toSQL();
      expect(sql).toContain('(');
      expect(sql).toContain('type = ?');
    });

    it('whereIn with empty array produces always-false', () => {
      const { sql } = query().from('nodes').whereIn('id', []).toSQL();
      expect(sql).toContain('1=0');
    });
  });

  describe('JOINs', () => {
    it('inner join', () => {
      const { sql } = query()
        .from('nodes', 'n')
        .join('edges', 'e.source_id = n.id', 'e')
        .toSQL();
      expect(sql).toContain('INNER JOIN edges AS e ON e.source_id = n.id');
    });

    it('left join', () => {
      const { sql } = query()
        .from('nodes', 'n')
        .leftJoin('tags', 'tags.node_id = n.id')
        .toSQL();
      expect(sql).toContain('LEFT JOIN tags ON tags.node_id = n.id');
    });

    it('right join', () => {
      const { sql } = query()
        .from('nodes', 'n')
        .rightJoin('categories', 'categories.id = n.category_id')
        .toSQL();
      expect(sql).toContain('RIGHT JOIN');
    });

    it('full outer join', () => {
      const { sql } = query()
        .from('a')
        .fullJoin('b', 'a.id = b.a_id')
        .toSQL();
      expect(sql).toContain('FULL OUTER JOIN');
    });

    it('multiple joins', () => {
      const { sql } = query()
        .from('nodes', 'n')
        .leftJoin('tags', 'tags.node_id = n.id')
        .leftJoin('categories', 'categories.id = n.category_id')
        .toSQL();
      expect(sql).toContain('LEFT JOIN tags');
      expect(sql).toContain('LEFT JOIN categories');
    });
  });

  describe('ORDER BY', () => {
    it('order by asc', () => {
      const { sql } = query().from('nodes').orderBy('name', SortDirection.ASC).toSQL();
      expect(sql).toContain('ORDER BY name ASC');
    });

    it('order by desc', () => {
      const { sql } = query().from('nodes').orderByDesc('created_at').toSQL();
      expect(sql).toContain('ORDER BY created_at DESC');
    });

    it('multiple order by', () => {
      const { sql } = query()
        .from('nodes')
        .orderBy('type', SortDirection.ASC)
        .orderBy('name', SortDirection.DESC)
        .toSQL();
      expect(sql).toContain('ORDER BY type ASC, name DESC');
    });
  });

  describe('GROUP BY / HAVING', () => {
    it('group by', () => {
      const { sql } = query().from('nodes').groupBy('type').toSQL();
      expect(sql).toContain('GROUP BY type');
    });

    it('group by multiple fields', () => {
      const { sql } = query().from('nodes').groupBy('type', 'status').toSQL();
      expect(sql).toContain('GROUP BY type, status');
    });

    it('having', () => {
      const { sql, params } = query()
        .from('nodes')
        .groupBy('type')
        .count()
        .having('COUNT(*) > ?', [5])
        .toSQL();
      expect(sql).toContain('HAVING COUNT(*) > ?');
      expect(params).toContain(5);
    });
  });

  describe('LIMIT / OFFSET', () => {
    it('limit', () => {
      const { sql } = query().from('nodes').limit(10).toSQL();
      expect(sql).toContain('LIMIT 10');
    });

    it('offset', () => {
      const { sql } = query().from('nodes').offset(20).toSQL();
      expect(sql).toContain('OFFSET 20');
    });

    it('page helper', () => {
      const { sql } = query().from('nodes').page(3, 10).toSQL();
      expect(sql).toContain('LIMIT 10');
      expect(sql).toContain('OFFSET 20');
    });
  });

  describe('aggregates', () => {
    it('count', () => {
      const { sql } = query().from('nodes').count().toSQL();
      expect(sql).toContain('COUNT(*) AS count');
    });

    it('sum', () => {
      const { sql } = query().from('nodes').sum('weight', 'total_weight').toSQL();
      expect(sql).toContain('SUM(weight) AS total_weight');
    });

    it('avg', () => {
      const { sql } = query().from('nodes').avg('score').toSQL();
      expect(sql).toContain('AVG(score)');
    });

    it('min and max', () => {
      const { sql } = query().from('nodes').min('weight').max('weight').toSQL();
      expect(sql).toContain('MIN(weight)');
      expect(sql).toContain('MAX(weight)');
    });
  });

  describe('subqueries', () => {
    it('subquery in WHERE', () => {
      const sub = query().select('id').from('admins');
      const { sql, params: _params } = query()
        .from('users')
        .whereSubquery('id', Operator.IN, sub)
        .toSQL();
      expect(sql).toContain('IN (SELECT id FROM admins)');
    });

    it('subquery as FROM', () => {
      const sub = query().select('id', 'name').from('users').where('active', Operator.EQ, true);
      const { sql } = query().select('*').fromSubquery(sub, 'active_users').toSQL();
      expect(sql).toContain('FROM (SELECT id, name FROM users');
      expect(sql).toContain(') AS active_users');
    });
  });

  describe('clone', () => {
    it('clone creates independent copy', () => {
      const original = query().select('*').from('nodes').limit(10);
      const cloned = original.clone().limit(20);
      expect(original.toSQL().sql).toContain('LIMIT 10');
      expect(cloned.toSQL().sql).toContain('LIMIT 20');
    });
  });

  describe('parameter binding', () => {
    it('collects all params in order', () => {
      const { params } = query()
        .from('nodes')
        .where('type', Operator.EQ, 'concept')
        .whereIn('status', ['active', 'pending'])
        .whereBetween('weight', 1, 5)
        .toSQL();
      expect(params).toEqual(['concept', 'active', 'pending', 1, 5]);
    });
  });

  describe('complex queries', () => {
    it('builds a complex analytics query', () => {
      const { sql, params } = query()
        .select('n.type', { raw: 'COUNT(*) AS node_count' }, { raw: 'AVG(n.weight) AS avg_weight' })
        .from('nodes', 'n')
        .leftJoin('tags', 'tags.node_id = n.id')
        .whereNotNull('n.published_at')
        .whereIn('n.type', ['concept', 'entity'])
        .groupBy('n.type')
        .having('COUNT(*) > ?', [10])
        .orderBy('node_count', SortDirection.DESC)
        .limit(5)
        .toSQL();

      expect(sql).toContain('SELECT');
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('WHERE');
      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('HAVING');
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('LIMIT 5');
      expect(params.length).toBeGreaterThan(0);
    });
  });
});
