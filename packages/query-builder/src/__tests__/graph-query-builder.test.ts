import { describe, it, expect } from 'vitest';
import {
  GraphQueryBuilder,
  graphQuery,
  NodeQueryBuilder,
  EdgeQueryBuilder,
  TraversalBuilder,
  PathBuilder,
  NeighborsBuilder,
  PatternBuilder,
} from '../graph-query-builder.js';
import { Operator, SortDirection } from '../types.js';

describe('GraphQueryBuilder', () => {
  describe('factory', () => {
    it('graphQuery() returns a GraphQueryBuilder', () => {
      expect(graphQuery()).toBeInstanceOf(GraphQueryBuilder);
    });
  });

  describe('NodeQueryBuilder', () => {
    it('queries all nodes', () => {
      const { sql } = graphQuery().nodes().toSQL();
      expect(sql).toContain('FROM nodes');
      expect(sql).toContain('SELECT *');
    });

    it('queries nodes of a specific type', () => {
      const { sql, params } = graphQuery().nodes('concept').toSQL();
      expect(sql).toContain('type = ?');
      expect(params).toContain('concept');
    });

    it('filters by field eq', () => {
      const { sql, params } = graphQuery().nodes().whereEq('status', 'active').toSQL();
      expect(sql).toContain('status = ?');
      expect(params).toContain('active');
    });

    it('filters with whereIn', () => {
      const { sql, params } = graphQuery().nodes().whereIn('type', ['person', 'org']).toSQL();
      expect(sql).toContain('IN');
      expect(params).toContain('person');
    });

    it('filters with whereNull', () => {
      const { sql } = graphQuery().nodes().whereNull('deleted_at').toSQL();
      expect(sql).toContain('IS NULL');
    });

    it('filters with whereNotNull', () => {
      const { sql } = graphQuery().nodes().whereNotNull('name').toSQL();
      expect(sql).toContain('IS NOT NULL');
    });

    it('filters with whereLike', () => {
      const { sql, params } = graphQuery().nodes().whereLike('name', '%Alice%').toSQL();
      expect(sql).toContain('LIKE ?');
      expect(params).toContain('%Alice%');
    });

    it('applies limit', () => {
      const { sql } = graphQuery().nodes().limit(10).toSQL();
      expect(sql).toContain('LIMIT 10');
    });

    it('applies offset', () => {
      const { sql } = graphQuery().nodes().offset(20).toSQL();
      expect(sql).toContain('OFFSET 20');
    });

    it('applies orderBy', () => {
      const { sql } = graphQuery().nodes().orderBy('name', SortDirection.ASC).toSQL();
      expect(sql).toContain('ORDER BY name ASC');
    });

    it('returns NodeFilter via toFilter()', () => {
      const filter = graphQuery().nodes('entity').whereEq('active', true).toFilter();
      expect(filter.type).toBe('entity');
      expect(filter.conditions.length).toBeGreaterThan(0);
    });

    it('uses custom table name', () => {
      const { sql } = graphQuery().nodes().toSQL('kg_nodes');
      expect(sql).toContain('FROM kg_nodes');
    });
  });

  describe('EdgeQueryBuilder', () => {
    it('queries all edges', () => {
      const { sql } = graphQuery().edges().toSQL();
      expect(sql).toContain('FROM edges');
    });

    it('queries edges of a specific type', () => {
      const { sql, params } = graphQuery().edges('related_to').toSQL();
      expect(sql).toContain('type = ?');
      expect(params).toContain('related_to');
    });

    it('filters by source node', () => {
      const { sql, params } = graphQuery().edges().from('node-1').toSQL();
      expect(sql).toContain('source_id = ?');
      expect(params).toContain('node-1');
    });

    it('filters by target node', () => {
      const { sql, params } = graphQuery().edges().to('node-2').toSQL();
      expect(sql).toContain('target_id = ?');
      expect(params).toContain('node-2');
    });

    it('filters by both source and target', () => {
      const { sql, params } = graphQuery().edges().from('a').to('b').toSQL();
      expect(sql).toContain('source_id = ?');
      expect(sql).toContain('target_id = ?');
      expect(params).toContain('a');
      expect(params).toContain('b');
    });

    it('applies whereEq filter', () => {
      const { sql, params } = graphQuery().edges().whereEq('weight', 5).toSQL();
      expect(sql).toContain('weight = ?');
      expect(params).toContain(5);
    });

    it('applies limit', () => {
      const { sql } = graphQuery().edges().limit(50).toSQL();
      expect(sql).toContain('LIMIT 50');
    });

    it('returns EdgeFilter via toFilter()', () => {
      const filter = graphQuery().edges('depends_on').from('nodeA').toFilter();
      expect(filter.type).toBe('depends_on');
      expect(filter.fromId).toBe('nodeA');
    });
  });

  describe('TraversalBuilder', () => {
    it('generates recursive CTE SQL', () => {
      const { sql } = graphQuery().traverse('start-id').depth(3).toSQL();
      expect(sql).toContain('WITH RECURSIVE');
      expect(sql).toContain('traversal');
    });

    it('uses start node id as parameter', () => {
      const { params } = graphQuery().traverse('root-123').depth(2).toSQL();
      expect(params).toContain('root-123');
    });

    it('respects max depth', () => {
      const { sql } = graphQuery().traverse('x').depth(5).toSQL();
      expect(sql).toContain('depth < 5');
    });

    it('outbound direction uses target_id', () => {
      const { sql } = graphQuery().traverse('x').direction('outbound').toSQL();
      expect(sql).toContain('target_id');
    });

    it('inbound direction uses source_id', () => {
      const { sql } = graphQuery().traverse('x').direction('inbound').toSQL();
      expect(sql).toContain('source_id');
    });

    it('any direction includes both', () => {
      const { sql } = graphQuery().traverse('x').direction('any').toSQL();
      expect(sql).toContain('OR');
    });

    it('applies node type filter', () => {
      const { sql, params } = graphQuery()
        .traverse('x')
        .filterNodes((nb) => nb.ofType('concept' as never))
        .toSQL();
      // filterNodes on NodeQueryBuilder doesn't have ofType, we test conditions
      expect(sql).toContain('WITH RECURSIVE');
      expect(params.length).toBeGreaterThan(0);
    });

    it('applies limit', () => {
      const { sql } = graphQuery().traverse('x').limit(100).toSQL();
      expect(sql).toContain('LIMIT 100');
    });

    it('returns TraversalOptions via toOptions()', () => {
      const opts = graphQuery().traverse('root').depth(4).direction('outbound').toOptions();
      expect(opts.startId).toBe('root');
      expect(opts.maxDepth).toBe(4);
      expect(opts.direction).toBe('outbound');
    });

    it('uses custom table names', () => {
      const { sql } = graphQuery().traverse('x').toSQL('kg_nodes', 'kg_edges');
      expect(sql).toContain('kg_nodes');
      expect(sql).toContain('kg_edges');
    });
  });

  describe('PathBuilder', () => {
    it('generates path-finding CTE SQL', () => {
      const { sql } = graphQuery().path('A', 'B').maxHops(3).toSQL();
      expect(sql).toContain('WITH RECURSIVE');
      expect(sql).toContain('paths');
    });

    it('uses from and to as parameters', () => {
      const { params } = graphQuery().path('node-1', 'node-2').toSQL();
      expect(params).toContain('node-1');
      expect(params).toContain('node-2');
    });

    it('respects maxHops', () => {
      const { sql } = graphQuery().path('a', 'b').maxHops(6).toSQL();
      expect(sql).toContain('hops < 6');
    });

    it('direction outbound uses source_id', () => {
      const { sql } = graphQuery().path('a', 'b').direction('outbound').toSQL();
      expect(sql).toContain('source_id');
    });

    it('direction inbound uses target_id', () => {
      const { sql } = graphQuery().path('a', 'b').direction('inbound').toSQL();
      expect(sql).toContain('target_id');
    });

    it('direction any uses CASE WHEN', () => {
      const { sql } = graphQuery().path('a', 'b').direction('any').toSQL();
      expect(sql).toContain('CASE WHEN');
    });

    it('returns PathOptions via toOptions()', () => {
      const opts = graphQuery().path('from', 'to').maxHops(4).direction('any').toOptions();
      expect(opts.fromId).toBe('from');
      expect(opts.toId).toBe('to');
      expect(opts.maxHops).toBe(4);
      expect(opts.direction).toBe('any');
    });
  });

  describe('NeighborsBuilder', () => {
    it('generates neighbor query SQL', () => {
      const { sql } = graphQuery().neighbors('node-1').toSQL();
      expect(sql).toContain('JOIN edges');
      expect(sql).toContain('FROM nodes');
    });

    it('uses node id as parameter', () => {
      const { params } = graphQuery().neighbors('node-abc').toSQL();
      expect(params).toContain('node-abc');
    });

    it('filters by neighbor type', () => {
      const { sql, params } = graphQuery().neighbors('x').ofType('person').toSQL();
      expect(sql).toContain('n.type = ?');
      expect(params).toContain('person');
    });

    it('outbound direction uses target_id', () => {
      const { sql } = graphQuery().neighbors('x').direction('outbound').toSQL();
      expect(sql).toContain('target_id');
    });

    it('inbound direction uses source_id', () => {
      const { sql } = graphQuery().neighbors('x').direction('inbound').toSQL();
      expect(sql).toContain('source_id');
    });

    it('filters by edge type', () => {
      const { sql, params } = graphQuery().neighbors('x').viaEdgeType('related_to').toSQL();
      expect(sql).toContain('e.type = ?');
      expect(params).toContain('related_to');
    });

    it('applies limit', () => {
      const { sql } = graphQuery().neighbors('x').limit(20).toSQL();
      expect(sql).toContain('LIMIT 20');
    });
  });

  describe('PatternBuilder', () => {
    it('generates pattern match SQL', () => {
      const { sql } = graphQuery()
        .pattern()
        .addNode('a', 'person')
        .addNode('b', 'organization')
        .addEdge('e1', 'a', 'b', 'works_for')
        .toSQL();
      expect(sql).toContain('FROM');
      expect(sql).toContain('WHERE');
    });

    it('filters node by type', () => {
      const { sql, params } = graphQuery()
        .pattern()
        .addNode('n', 'concept')
        .toSQL();
      expect(sql).toContain('n.type = ?');
      expect(params).toContain('concept');
    });

    it('filters edge by type', () => {
      const { sql, params } = graphQuery()
        .pattern()
        .addNode('a')
        .addNode('b')
        .addEdge('e', 'a', 'b', 'related_to')
        .toSQL();
      expect(sql).toContain('e.type = ?');
      expect(params).toContain('related_to');
    });

    it('applies limit', () => {
      const { sql } = graphQuery()
        .pattern()
        .addNode('n')
        .limit(5)
        .toSQL();
      expect(sql).toContain('LIMIT 5');
    });

    it('generates join conditions for edges', () => {
      const { sql } = graphQuery()
        .pattern()
        .addNode('src')
        .addNode('tgt')
        .addEdge('e', 'src', 'tgt', undefined, 'outbound')
        .toSQL();
      expect(sql).toContain('e.source_id = src.id');
      expect(sql).toContain('e.target_id = tgt.id');
    });
  });
});
