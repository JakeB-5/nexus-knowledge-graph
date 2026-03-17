// Condition builder with and/or/not combinators
import {
  Operator,
  LogicalOperator,
  type ConditionNode,
  type SimpleCondition,
  type GroupCondition,
  type RawCondition,
} from './types.js';

export class ConditionBuilder {
  private conditions: ConditionNode[] = [];

  // ─── Comparison conditions ────────────────────────────────────────────────

  eq(field: string, value: unknown): this {
    return this.add({ type: 'simple', field, operator: Operator.EQ, value });
  }

  ne(field: string, value: unknown): this {
    return this.add({ type: 'simple', field, operator: Operator.NE, value });
  }

  gt(field: string, value: unknown): this {
    return this.add({ type: 'simple', field, operator: Operator.GT, value });
  }

  gte(field: string, value: unknown): this {
    return this.add({ type: 'simple', field, operator: Operator.GTE, value });
  }

  lt(field: string, value: unknown): this {
    return this.add({ type: 'simple', field, operator: Operator.LT, value });
  }

  lte(field: string, value: unknown): this {
    return this.add({ type: 'simple', field, operator: Operator.LTE, value });
  }

  // ─── String conditions ────────────────────────────────────────────────────

  like(field: string, pattern: string): this {
    return this.add({ type: 'simple', field, operator: Operator.LIKE, value: pattern });
  }

  ilike(field: string, pattern: string): this {
    return this.add({ type: 'simple', field, operator: Operator.ILIKE, value: pattern });
  }

  notLike(field: string, pattern: string): this {
    return this.add({ type: 'simple', field, operator: Operator.NOT_LIKE, value: pattern });
  }

  startsWith(field: string, prefix: string): this {
    return this.add({ type: 'simple', field, operator: Operator.STARTS_WITH, value: prefix });
  }

  endsWith(field: string, suffix: string): this {
    return this.add({ type: 'simple', field, operator: Operator.ENDS_WITH, value: suffix });
  }

  contains(field: string, substring: string): this {
    return this.add({ type: 'simple', field, operator: Operator.CONTAINS, value: substring });
  }

  // ─── Set conditions ───────────────────────────────────────────────────────

  in(field: string, values: unknown[]): this {
    return this.add({ type: 'simple', field, operator: Operator.IN, value: values });
  }

  notIn(field: string, values: unknown[]): this {
    return this.add({ type: 'simple', field, operator: Operator.NOT_IN, value: values });
  }

  between(field: string, min: unknown, max: unknown): this {
    return this.add({ type: 'simple', field, operator: Operator.BETWEEN, value: [min, max] });
  }

  notBetween(field: string, min: unknown, max: unknown): this {
    return this.add({ type: 'simple', field, operator: Operator.NOT_BETWEEN, value: [min, max] });
  }

  // ─── Null conditions ──────────────────────────────────────────────────────

  isNull(field: string): this {
    return this.add({ type: 'simple', field, operator: Operator.IS_NULL });
  }

  isNotNull(field: string): this {
    return this.add({ type: 'simple', field, operator: Operator.IS_NOT_NULL });
  }

  // ─── Subquery conditions ──────────────────────────────────────────────────

  exists(subquerySql: string, params?: unknown[]): this {
    return this.addRaw(`EXISTS (${subquerySql})`, params);
  }

  notExists(subquerySql: string, params?: unknown[]): this {
    return this.addRaw(`NOT EXISTS (${subquerySql})`, params);
  }

  // ─── Raw conditions ───────────────────────────────────────────────────────

  raw(sql: string, params?: unknown[]): this {
    return this.addRaw(sql, params);
  }

  // ─── Logical combinators ──────────────────────────────────────────────────

  and(fn: (builder: ConditionBuilder) => void): this {
    const nested = new ConditionBuilder();
    fn(nested);
    const group: GroupCondition = {
      type: 'group',
      conditions: nested.build(),
      logical: LogicalOperator.AND,
    };
    this.conditions.push(group);
    return this;
  }

  or(fn: (builder: ConditionBuilder) => void): this {
    const nested = new ConditionBuilder();
    fn(nested);
    const group: GroupCondition = {
      type: 'group',
      conditions: nested.build(),
      logical: LogicalOperator.OR,
    };
    // Mark all conditions in the nested group with OR
    for (const cond of group.conditions) {
      if (!cond.logical) {
        cond.logical = LogicalOperator.OR;
      }
    }
    this.conditions.push(group);
    return this;
  }

  not(fn: (builder: ConditionBuilder) => void): this {
    const nested = new ConditionBuilder();
    fn(nested);
    const innerSql = compileConditions(nested.build(), []);
    return this.addRaw(`NOT (${innerSql.sql})`, innerSql.params);
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private add(condition: SimpleCondition): this {
    this.conditions.push(condition);
    return this;
  }

  private addRaw(sql: string, params?: unknown[]): this {
    const raw: RawCondition = { type: 'raw', sql, params };
    this.conditions.push(raw);
    return this;
  }

  build(): ConditionNode[] {
    return [...this.conditions];
  }

  isEmpty(): boolean {
    return this.conditions.length === 0;
  }
}

// ─── SQL compiler for conditions ──────────────────────────────────────────────

export function compileConditions(
  conditions: ConditionNode[],
  params: unknown[]
): { sql: string; params: unknown[] } {
  if (conditions.length === 0) return { sql: '', params };

  const parts: string[] = [];

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i]!;
    const logical = i === 0 ? '' : ` ${cond.logical ?? LogicalOperator.AND} `;
    const sql = compileCondition(cond, params);
    parts.push(`${logical}${sql}`);
  }

  return { sql: parts.join(''), params };
}

function compileCondition(cond: ConditionNode, params: unknown[]): string {
  switch (cond.type) {
    case 'simple':
      return compileSimple(cond, params);
    case 'group': {
      const inner = compileConditions(cond.conditions, params);
      return `(${inner.sql})`;
    }
    case 'raw':
      if (cond.params) params.push(...cond.params);
      return cond.sql;
  }
}

function compileSimple(cond: SimpleCondition, params: unknown[]): string {
  const { field, operator, value } = cond;

  switch (operator) {
    case Operator.EQ:
      params.push(value);
      return `${field} = ?`;
    case Operator.NE:
      params.push(value);
      return `${field} != ?`;
    case Operator.GT:
      params.push(value);
      return `${field} > ?`;
    case Operator.GTE:
      params.push(value);
      return `${field} >= ?`;
    case Operator.LT:
      params.push(value);
      return `${field} < ?`;
    case Operator.LTE:
      params.push(value);
      return `${field} <= ?`;
    case Operator.LIKE:
      params.push(value);
      return `${field} LIKE ?`;
    case Operator.ILIKE:
      params.push(value);
      return `${field} ILIKE ?`;
    case Operator.NOT_LIKE:
      params.push(value);
      return `${field} NOT LIKE ?`;
    case Operator.STARTS_WITH:
      params.push(`${value}%`);
      return `${field} LIKE ?`;
    case Operator.ENDS_WITH:
      params.push(`%${value}`);
      return `${field} LIKE ?`;
    case Operator.CONTAINS:
      params.push(`%${value}%`);
      return `${field} LIKE ?`;
    case Operator.IN: {
      const vals = Array.isArray(value) ? value : [value];
      if (vals.length === 0) return '1=0'; // always false
      const placeholders = vals.map(() => '?').join(', ');
      params.push(...vals);
      return `${field} IN (${placeholders})`;
    }
    case Operator.NOT_IN: {
      const vals = Array.isArray(value) ? value : [value];
      if (vals.length === 0) return '1=1'; // always true
      const placeholders = vals.map(() => '?').join(', ');
      params.push(...vals);
      return `${field} NOT IN (${placeholders})`;
    }
    case Operator.BETWEEN: {
      const [min, max] = value as [unknown, unknown];
      params.push(min, max);
      return `${field} BETWEEN ? AND ?`;
    }
    case Operator.NOT_BETWEEN: {
      const [min, max] = value as [unknown, unknown];
      params.push(min, max);
      return `${field} NOT BETWEEN ? AND ?`;
    }
    case Operator.IS_NULL:
      return `${field} IS NULL`;
    case Operator.IS_NOT_NULL:
      return `${field} IS NOT NULL`;
    case Operator.EXISTS:
      return `EXISTS (${value})`;
    case Operator.NOT_EXISTS:
      return `NOT EXISTS (${value})`;
    case Operator.RAW:
      return String(value);
    default:
      return `${field} = ?`;
  }
}

// Factory function
export function where(field: string, operator: Operator, value?: unknown): ConditionBuilder {
  const builder = new ConditionBuilder();
  builder['add']({ type: 'simple', field, operator, value });
  return builder;
}
