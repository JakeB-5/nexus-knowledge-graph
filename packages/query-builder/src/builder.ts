// QueryBuilder - fluent SQL query builder
import { ConditionBuilder, compileConditions } from './conditions.js';
import {
  Operator,
  JoinType,
  SortDirection,
  LogicalOperator,
  type SelectField,
  type FromClause,
  type JoinClause,
  type OrderByClause,
  type HavingClause,
  type SQLResult,
  type AggregateField,
  type AggregateType,
  type ConditionNode,
} from './types.js';

export class QueryBuilder {
  private _select: SelectField[] = [];
  private _from: FromClause | null = null;
  private _joins: JoinClause[] = [];
  private _conditions: ConditionNode[] = [];
  private _orderBy: OrderByClause[] = [];
  private _groupBy: string[] = [];
  private _having: HavingClause[] = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _distinct = false;
  private _aggregates: AggregateField[] = [];

  // ─── SELECT ───────────────────────────────────────────────────────────────

  select(...fields: Array<string | SelectField>): this {
    for (const f of fields) {
      if (typeof f === 'string') {
        this._select.push(f);
      } else {
        this._select.push(f);
      }
    }
    return this;
  }

  addSelect(...fields: Array<string | SelectField>): this {
    return this.select(...fields);
  }

  distinct(): this {
    this._distinct = true;
    return this;
  }

  // ─── FROM ─────────────────────────────────────────────────────────────────

  from(table: string, alias?: string): this {
    this._from = { table, alias };
    return this;
  }

  // ─── JOIN ─────────────────────────────────────────────────────────────────

  join(table: string, on: string, alias?: string): this {
    this._joins.push({ type: JoinType.INNER, table, on, alias });
    return this;
  }

  innerJoin(table: string, on: string, alias?: string): this {
    this._joins.push({ type: JoinType.INNER, table, on, alias });
    return this;
  }

  leftJoin(table: string, on: string, alias?: string): this {
    this._joins.push({ type: JoinType.LEFT, table, on, alias });
    return this;
  }

  rightJoin(table: string, on: string, alias?: string): this {
    this._joins.push({ type: JoinType.RIGHT, table, on, alias });
    return this;
  }

  fullJoin(table: string, on: string, alias?: string): this {
    this._joins.push({ type: JoinType.FULL, table, on, alias });
    return this;
  }

  crossJoin(table: string, alias?: string): this {
    this._joins.push({ type: JoinType.CROSS, table, on: '', alias });
    return this;
  }

  // ─── WHERE ────────────────────────────────────────────────────────────────

  where(field: string, operator: Operator | unknown, value?: unknown): this {
    // Overload: where(field, value) with implicit EQ
    if (value === undefined && !(operator instanceof Object && 'type' in (operator as object))) {
      return this.where(field, Operator.EQ, operator);
    }
    this._conditions.push({
      type: 'simple',
      field,
      operator: operator as Operator,
      value,
      logical: LogicalOperator.AND,
    });
    return this;
  }

  andWhere(field: string, operator: Operator, value?: unknown): this {
    this._conditions.push({
      type: 'simple',
      field,
      operator,
      value,
      logical: LogicalOperator.AND,
    });
    return this;
  }

  orWhere(field: string, operator: Operator, value?: unknown): this {
    this._conditions.push({
      type: 'simple',
      field,
      operator,
      value,
      logical: LogicalOperator.OR,
    });
    return this;
  }

  whereIn(field: string, values: unknown[]): this {
    return this.where(field, Operator.IN, values);
  }

  whereNotIn(field: string, values: unknown[]): this {
    return this.where(field, Operator.NOT_IN, values);
  }

  whereBetween(field: string, min: unknown, max: unknown): this {
    return this.where(field, Operator.BETWEEN, [min, max]);
  }

  whereNotBetween(field: string, min: unknown, max: unknown): this {
    return this.where(field, Operator.NOT_BETWEEN, [min, max]);
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

  whereRaw(sql: string, params?: unknown[]): this {
    this._conditions.push({ type: 'raw', sql, params, logical: LogicalOperator.AND });
    return this;
  }

  orWhereRaw(sql: string, params?: unknown[]): this {
    this._conditions.push({ type: 'raw', sql, params, logical: LogicalOperator.OR });
    return this;
  }

  whereGroup(fn: (builder: ConditionBuilder) => void, logical = LogicalOperator.AND): this {
    const cb = new ConditionBuilder();
    fn(cb);
    this._conditions.push({ type: 'group', conditions: cb.build(), logical });
    return this;
  }

  orWhereGroup(fn: (builder: ConditionBuilder) => void): this {
    return this.whereGroup(fn, LogicalOperator.OR);
  }

  // ─── ORDER BY ─────────────────────────────────────────────────────────────

  orderBy(field: string, direction: SortDirection = SortDirection.ASC): this {
    this._orderBy.push({ field, direction });
    return this;
  }

  orderByAsc(field: string): this {
    return this.orderBy(field, SortDirection.ASC);
  }

  orderByDesc(field: string): this {
    return this.orderBy(field, SortDirection.DESC);
  }

  // ─── GROUP BY ─────────────────────────────────────────────────────────────

  groupBy(...fields: string[]): this {
    this._groupBy.push(...fields);
    return this;
  }

  // ─── HAVING ──────────────────────────────────────────────────────────────

  having(condition: string, params?: unknown[]): this {
    this._having.push({ condition, params });
    return this;
  }

  // ─── LIMIT / OFFSET ───────────────────────────────────────────────────────

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  offset(n: number): this {
    this._offset = n;
    return this;
  }

  page(page: number, pageSize: number): this {
    this._limit = pageSize;
    this._offset = (page - 1) * pageSize;
    return this;
  }

  // ─── Aggregate helpers ────────────────────────────────────────────────────

  count(field = '*', alias = 'count'): this {
    this._aggregates.push({ fn: 'COUNT', field, alias });
    return this;
  }

  sum(field: string, alias?: string): this {
    this._aggregates.push({ fn: 'SUM', field, alias: alias ?? `sum_${field}` });
    return this;
  }

  avg(field: string, alias?: string): this {
    this._aggregates.push({ fn: 'AVG', field, alias: alias ?? `avg_${field}` });
    return this;
  }

  min(field: string, alias?: string): this {
    this._aggregates.push({ fn: 'MIN', field, alias: alias ?? `min_${field}` });
    return this;
  }

  max(field: string, alias?: string): this {
    this._aggregates.push({ fn: 'MAX', field, alias: alias ?? `max_${field}` });
    return this;
  }

  // ─── Subqueries ───────────────────────────────────────────────────────────

  fromSubquery(subquery: QueryBuilder, alias: string): this {
    const { sql, params: _params } = subquery.toSQL();
    this._from = { table: `(${sql})`, alias };
    return this;
  }

  whereSubquery(
    field: string,
    operator: Operator,
    subquery: QueryBuilder
  ): this {
    const { sql, params } = subquery.toSQL();
    this._conditions.push({
      type: 'raw',
      sql: `${field} ${operatorToSQL(operator)} (${sql})`,
      params,
      logical: LogicalOperator.AND,
    });
    return this;
  }

  // ─── Compile ──────────────────────────────────────────────────────────────

  toSQL(): SQLResult {
    const params: unknown[] = [];
    const parts: string[] = [];

    // SELECT
    const selectDistinct = this._distinct ? 'SELECT DISTINCT' : 'SELECT';
    const selectFields = this.buildSelectFields();
    parts.push(`${selectDistinct} ${selectFields}`);

    // FROM
    if (this._from) {
      const alias = this._from.alias ? ` AS ${this._from.alias}` : '';
      parts.push(`FROM ${this._from.table}${alias}`);
    }

    // JOINs
    for (const join of this._joins) {
      const alias = join.alias ? ` AS ${join.alias}` : '';
      if (join.type === JoinType.CROSS) {
        parts.push(`${join.type} ${join.table}${alias}`);
      } else {
        parts.push(`${join.type} ${join.table}${alias} ON ${join.on}`);
      }
    }

    // WHERE
    if (this._conditions.length > 0) {
      const { sql: whereSql } = compileConditions(this._conditions, params);
      parts.push(`WHERE ${whereSql}`);
    }

    // GROUP BY
    if (this._groupBy.length > 0) {
      parts.push(`GROUP BY ${this._groupBy.join(', ')}`);
    }

    // HAVING
    if (this._having.length > 0) {
      const havingParts = this._having.map((h) => {
        if (h.params) params.push(...h.params);
        return h.condition;
      });
      parts.push(`HAVING ${havingParts.join(' AND ')}`);
    }

    // ORDER BY
    if (this._orderBy.length > 0) {
      const orderParts = this._orderBy.map((o) => `${o.field} ${o.direction}`);
      parts.push(`ORDER BY ${orderParts.join(', ')}`);
    }

    // LIMIT
    if (this._limit !== null) {
      parts.push(`LIMIT ${this._limit}`);
    }

    // OFFSET
    if (this._offset !== null) {
      parts.push(`OFFSET ${this._offset}`);
    }

    return { sql: parts.join(' '), params };
  }

  private buildSelectFields(): string {
    const fields: string[] = [];

    // Regular select fields
    for (const f of this._select) {
      if (typeof f === 'string') {
        fields.push(f);
      } else if ('raw' in f) {
        fields.push(f.raw);
      } else if ('alias' in f) {
        fields.push(`${f.field} AS ${f.alias}`);
      }
    }

    // Aggregate fields
    for (const agg of this._aggregates) {
      const expr = `${agg.fn}(${agg.field})`;
      fields.push(agg.alias ? `${expr} AS ${agg.alias}` : expr);
    }

    if (fields.length === 0) return '*';
    return fields.join(', ');
  }

  // ─── Clone ────────────────────────────────────────────────────────────────

  clone(): QueryBuilder {
    const q = new QueryBuilder();
    q._select = [...this._select];
    q._from = this._from ? { ...this._from } : null;
    q._joins = [...this._joins];
    q._conditions = [...this._conditions];
    q._orderBy = [...this._orderBy];
    q._groupBy = [...this._groupBy];
    q._having = [...this._having];
    q._limit = this._limit;
    q._offset = this._offset;
    q._distinct = this._distinct;
    q._aggregates = [...this._aggregates];
    return q;
  }
}

function operatorToSQL(op: Operator): string {
  switch (op) {
    case Operator.EQ: return '=';
    case Operator.NE: return '!=';
    case Operator.GT: return '>';
    case Operator.GTE: return '>=';
    case Operator.LT: return '<';
    case Operator.LTE: return '<=';
    case Operator.IN: return 'IN';
    case Operator.NOT_IN: return 'NOT IN';
    default: return '=';
  }
}

// Type-safe aggregate builder
export function aggregate(fn: AggregateType, field: string, alias?: string): AggregateField {
  return { fn, field, alias };
}

// Factory function
export function query(): QueryBuilder {
  return new QueryBuilder();
}
