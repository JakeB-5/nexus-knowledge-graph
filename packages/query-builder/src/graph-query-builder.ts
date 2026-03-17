// GraphQueryBuilder - knowledge graph query builder
import { ConditionBuilder, compileConditions } from './conditions.js';
import { QueryBuilder } from './builder.js';
import {
  Operator,
  SortDirection,
  type ConditionNode,
  type NodeFilter,
  type EdgeFilter,
  type TraversalOptions,
  type PathOptions,
  type PatternNode,
  type PatternEdge,
  type GraphQueryResult,
  type TraversalDirection,
  type SQLResult,
} from './types.js';

// ─── Node query builder ────────────────────────────────────────────────────────

export class NodeQueryBuilder {
  private nodeType?: string;
  private conditions: ConditionNode[] = [];
  private _limit?: number;
  private _offset?: number;
  private _orderBy?: { field: string; direction: SortDirection };

  constructor(type?: string) {
    this.nodeType = type;
  }

  where(field: string, operator: Operator, value?: unknown): this {
    const cb = new ConditionBuilder();
    cb['add']({ type: 'simple', field, operator, value });
    this.conditions.push(...cb.build());
    return this;
  }

  whereEq(field: string, value: unknown): this {
    return this.where(field, Operator.EQ, value);
  }

  whereIn(field: string, values: unknown[]): this {
    return this.where(field, Operator.IN, values);
  }

  whereNull(field: string): this {
    return this.where(field, Operator.IS_NULL);
  }

  whereNotNull(field: string): this {
    return this.where(field, Operator.IS_NOT_NULL);
  }

  whereLike(field: string, pattern: string): this {
    return this.where(field, Operator.LIKE, pattern);
  }

  whereGroup(fn: (cb: ConditionBuilder) => void): this {
    const cb = new ConditionBuilder();
    fn(cb);
    this.conditions.push({ type: 'group', conditions: cb.build() });
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  offset(n: number): this {
    this._offset = n;
    return this;
  }

  orderBy(field: string, direction: SortDirection = SortDirection.ASC): this {
    this._orderBy = { field, direction };
    return this;
  }

  // Compile to SQL targeting a nodes table
  toSQL(table = 'nodes'): SQLResult {
    const qb = new QueryBuilder().select('*').from(table);

    if (this.nodeType) {
      qb.where('type', Operator.EQ, this.nodeType);
    }

    for (const cond of this.conditions) {
      qb['_conditions'].push(cond);
    }

    if (this._limit !== undefined) qb.limit(this._limit);
    if (this._offset !== undefined) qb.offset(this._offset);
    if (this._orderBy) qb.orderBy(this._orderBy.field, this._orderBy.direction);

    return qb.toSQL();
  }

  toFilter(): NodeFilter {
    return { type: this.nodeType, conditions: this.conditions };
  }
}

// ─── Edge query builder ────────────────────────────────────────────────────────

export class EdgeQueryBuilder {
  private edgeType?: string;
  private _fromId?: string;
  private _toId?: string;
  private conditions: ConditionNode[] = [];
  private _limit?: number;
  private _offset?: number;

  constructor(type?: string) {
    this.edgeType = type;
  }

  from(nodeId: string): this {
    this._fromId = nodeId;
    return this;
  }

  to(nodeId: string): this {
    this._toId = nodeId;
    return this;
  }

  where(field: string, operator: Operator, value?: unknown): this {
    this.conditions.push({ type: 'simple', field, operator, value });
    return this;
  }

  whereEq(field: string, value: unknown): this {
    return this.where(field, Operator.EQ, value);
  }

  whereIn(field: string, values: unknown[]): this {
    return this.where(field, Operator.IN, values);
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  offset(n: number): this {
    this._offset = n;
    return this;
  }

  toSQL(table = 'edges'): SQLResult {
    const qb = new QueryBuilder().select('*').from(table);

    if (this.edgeType) qb.where('type', Operator.EQ, this.edgeType);
    if (this._fromId) qb.where('source_id', Operator.EQ, this._fromId);
    if (this._toId) qb.where('target_id', Operator.EQ, this._toId);

    for (const cond of this.conditions) {
      qb['_conditions'].push(cond);
    }

    if (this._limit !== undefined) qb.limit(this._limit);
    if (this._offset !== undefined) qb.offset(this._offset);

    return qb.toSQL();
  }

  toFilter(): EdgeFilter {
    return {
      type: this.edgeType,
      fromId: this._fromId,
      toId: this._toId,
      conditions: this.conditions,
    };
  }
}

// ─── Traversal builder ─────────────────────────────────────────────────────────

export class TraversalBuilder {
  private startId: string;
  private _maxDepth = 3;
  private _direction: TraversalDirection = 'outbound';
  private nodeFilter?: NodeFilter;
  private edgeFilter?: EdgeFilter;
  private _limit?: number;

  constructor(startId: string) {
    this.startId = startId;
  }

  depth(n: number): this {
    this._maxDepth = n;
    return this;
  }

  direction(dir: TraversalDirection): this {
    this._direction = dir;
    return this;
  }

  filterNodes(fn: (nb: NodeQueryBuilder) => void): this {
    const nb = new NodeQueryBuilder();
    fn(nb);
    this.nodeFilter = nb.toFilter();
    return this;
  }

  filterEdges(fn: (eb: EdgeQueryBuilder) => void): this {
    const eb = new EdgeQueryBuilder();
    fn(eb);
    this.edgeFilter = eb.toFilter();
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  // Compile to a recursive CTE SQL query
  toSQL(nodesTable = 'nodes', edgesTable = 'edges'): SQLResult {
    const params: unknown[] = [];

    // Direction filter for edges
    const directionFilter = (() => {
      switch (this._direction) {
        case 'outbound': return `e.source_id = t.id`;
        case 'inbound':  return `e.target_id = t.id`;
        case 'any':      return `(e.source_id = t.id OR e.target_id = t.id)`;
      }
    })();

    const nextNodeCol = this._direction === 'inbound' ? 'e.source_id' : 'e.target_id';

    // Build optional node type filter
    let nodeTypeFilter = '';
    if (this.nodeFilter?.type) {
      params.push(this.nodeFilter.type);
      nodeTypeFilter = ` AND n.type = ?`;
    }

    // Build optional edge type filter
    let edgeTypeFilter = '';
    if (this.edgeFilter?.type) {
      params.push(this.edgeFilter.type);
      edgeTypeFilter = ` AND e.type = ?`;
    }

    params.unshift(this.startId); // start node param goes first

    const limitClause = this._limit ? ` LIMIT ${this._limit}` : '';

    const sql = `
WITH RECURSIVE traversal(id, depth, path) AS (
  SELECT id, 0, ARRAY[id]
  FROM ${nodesTable}
  WHERE id = ?
  UNION ALL
  SELECT ${nextNodeCol}, t.depth + 1, t.path || ${nextNodeCol}
  FROM traversal t
  JOIN ${edgesTable} e ON ${directionFilter}${edgeTypeFilter}
  JOIN ${nodesTable} n ON n.id = ${nextNodeCol}${nodeTypeFilter}
  WHERE t.depth < ${this._maxDepth}
    AND NOT (${nextNodeCol} = ANY(t.path))
)
SELECT DISTINCT id, depth FROM traversal ORDER BY depth${limitClause}`.trim();

    return { sql, params };
  }

  toOptions(): TraversalOptions {
    return {
      startId: this.startId,
      maxDepth: this._maxDepth,
      direction: this._direction,
      nodeFilter: this.nodeFilter,
      edgeFilter: this.edgeFilter,
    };
  }
}

// ─── Path builder ──────────────────────────────────────────────────────────────

export class PathBuilder {
  private fromId: string;
  private toId: string;
  private _maxHops = 5;
  private _direction: TraversalDirection = 'any';

  constructor(fromId: string, toId: string) {
    this.fromId = fromId;
    this.toId = toId;
  }

  maxHops(n: number): this {
    this._maxHops = n;
    return this;
  }

  direction(dir: TraversalDirection): this {
    this._direction = dir;
    return this;
  }

  toSQL(nodesTable = 'nodes', edgesTable = 'edges'): SQLResult {
    const params: unknown[] = [this.fromId, this.toId];

    const nextNodeExpr = this._direction === 'inbound' ? 'e.source_id' : 'e.target_id';
    const dirFilter = this._direction === 'inbound'
      ? 'e.target_id = p.current_id'
      : this._direction === 'outbound'
        ? 'e.source_id = p.current_id'
        : '(e.source_id = p.current_id OR e.target_id = p.current_id)';

    // When direction is 'any', next node is whichever end is not the current
    const nextExpr = this._direction === 'any'
      ? `CASE WHEN e.source_id = p.current_id THEN e.target_id ELSE e.source_id END`
      : nextNodeExpr;

    const sql = `
WITH RECURSIVE paths(current_id, path, hops) AS (
  SELECT id, ARRAY[id], 0
  FROM ${nodesTable}
  WHERE id = ?
  UNION ALL
  SELECT ${nextExpr}, p.path || ${nextExpr}, p.hops + 1
  FROM paths p
  JOIN ${edgesTable} e ON ${dirFilter}
  WHERE p.hops < ${this._maxHops}
    AND NOT (${nextExpr} = ANY(p.path))
)
SELECT path, hops
FROM paths
WHERE current_id = ?
ORDER BY hops
LIMIT 1`.trim();

    return { sql, params };
  }

  toOptions(): PathOptions {
    return {
      fromId: this.fromId,
      toId: this.toId,
      maxHops: this._maxHops,
      direction: this._direction,
    };
  }
}

// ─── Neighbors builder ─────────────────────────────────────────────────────────

export class NeighborsBuilder {
  private nodeId: string;
  private _ofType?: string;
  private _direction: TraversalDirection = 'any';
  private _limit?: number;
  private _edgeType?: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
  }

  ofType(type: string): this {
    this._ofType = type;
    return this;
  }

  direction(dir: TraversalDirection): this {
    this._direction = dir;
    return this;
  }

  viaEdgeType(type: string): this {
    this._edgeType = type;
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  toSQL(nodesTable = 'nodes', edgesTable = 'edges'): SQLResult {
    const params: unknown[] = [this.nodeId];

    const edgeCondition = (() => {
      switch (this._direction) {
        case 'outbound': return `e.source_id = ?`;
        case 'inbound':  return `e.target_id = ?`;
        case 'any':      return `(e.source_id = ? OR e.target_id = ?)`;
      }
    })();

    // For 'any', need to push nodeId twice
    if (this._direction === 'any') params.push(this.nodeId);

    const neighborExpr = this._direction === 'inbound'
      ? 'e.source_id'
      : this._direction === 'outbound'
        ? 'e.target_id'
        : `CASE WHEN e.source_id = ? THEN e.target_id ELSE e.source_id END`;

    if (this._direction === 'any') params.push(this.nodeId);

    let sql = `SELECT DISTINCT n.* FROM ${nodesTable} n JOIN ${edgesTable} e ON n.id = ${neighborExpr} WHERE ${edgeCondition}`;

    if (this._ofType) {
      params.push(this._ofType);
      sql += ` AND n.type = ?`;
    }

    if (this._edgeType) {
      params.push(this._edgeType);
      sql += ` AND e.type = ?`;
    }

    if (this._limit) {
      sql += ` LIMIT ${this._limit}`;
    }

    return { sql, params };
  }
}

// ─── Pattern builder ───────────────────────────────────────────────────────────

export class PatternBuilder {
  private patternNodes: PatternNode[] = [];
  private patternEdges: PatternEdge[] = [];
  private _limit?: number;

  addNode(alias: string, type?: string, conditions?: ConditionNode[]): this {
    this.patternNodes.push({ alias, type, conditions });
    return this;
  }

  addEdge(alias: string, fromAlias: string, toAlias: string, type?: string, direction?: TraversalDirection): this {
    this.patternEdges.push({ alias, fromAlias, toAlias, type, direction });
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  toSQL(nodesTable = 'nodes', edgesTable = 'edges'): SQLResult {
    const params: unknown[] = [];
    const parts: string[] = [];
    const selectParts: string[] = [];
    const whereParts: string[] = [];

    // FROM clause for all nodes
    const fromParts = this.patternNodes.map((n) => `${nodesTable} AS ${n.alias}`);

    // JOIN clause for all edges
    for (const edge of this.patternEdges) {
      fromParts.push(`${edgesTable} AS ${edge.alias}`);

      const dir = edge.direction ?? 'outbound';
      if (dir === 'outbound') {
        whereParts.push(`${edge.alias}.source_id = ${edge.fromAlias}.id`);
        whereParts.push(`${edge.alias}.target_id = ${edge.toAlias}.id`);
      } else if (dir === 'inbound') {
        whereParts.push(`${edge.alias}.target_id = ${edge.fromAlias}.id`);
        whereParts.push(`${edge.alias}.source_id = ${edge.toAlias}.id`);
      } else {
        whereParts.push(`(${edge.alias}.source_id = ${edge.fromAlias}.id OR ${edge.alias}.target_id = ${edge.fromAlias}.id)`);
        whereParts.push(`(${edge.alias}.source_id = ${edge.toAlias}.id OR ${edge.alias}.target_id = ${edge.toAlias}.id)`);
      }

      if (edge.type) {
        params.push(edge.type);
        whereParts.push(`${edge.alias}.type = ?`);
      }
    }

    // Node type / condition filters
    for (const node of this.patternNodes) {
      selectParts.push(`${node.alias}.id AS ${node.alias}_id`, `${node.alias}.type AS ${node.alias}_type`);
      if (node.type) {
        params.push(node.type);
        whereParts.push(`${node.alias}.type = ?`);
      }
      if (node.conditions && node.conditions.length > 0) {
        const { sql: condSql } = compileConditions(
          node.conditions.map((c) => ({
            ...c,
            ...(c.type === 'simple' ? { field: `${node.alias}.${c.field}` } : {}),
          })),
          params
        );
        if (condSql) whereParts.push(condSql);
      }
    }

    parts.push(`SELECT ${selectParts.length > 0 ? selectParts.join(', ') : '*'}`);
    parts.push(`FROM ${fromParts.join(', ')}`);
    if (whereParts.length > 0) {
      parts.push(`WHERE ${whereParts.join(' AND ')}`);
    }
    if (this._limit) {
      parts.push(`LIMIT ${this._limit}`);
    }

    return { sql: parts.join(' '), params };
  }
}

// ─── Main GraphQueryBuilder ────────────────────────────────────────────────────

export class GraphQueryBuilder {
  // Query nodes
  nodes(type?: string): NodeQueryBuilder {
    return new NodeQueryBuilder(type);
  }

  // Query edges
  edges(type?: string): EdgeQueryBuilder {
    return new EdgeQueryBuilder(type);
  }

  // Traverse from a start node
  traverse(startId: string): TraversalBuilder {
    return new TraversalBuilder(startId);
  }

  // Find shortest path between two nodes
  path(fromId: string, toId: string): PathBuilder {
    return new PathBuilder(fromId, toId);
  }

  // Get neighbors of a node
  neighbors(nodeId: string): NeighborsBuilder {
    return new NeighborsBuilder(nodeId);
  }

  // Match a subgraph pattern
  pattern(): PatternBuilder {
    return new PatternBuilder();
  }

  // Build a raw GraphQueryResult descriptor
  buildDescriptor(type: GraphQueryResult['type']): GraphQueryResult {
    return { type };
  }
}

// Factory
export function graphQuery(): GraphQueryBuilder {
  return new GraphQueryBuilder();
}
