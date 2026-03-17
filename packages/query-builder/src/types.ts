// Query builder type definitions

export enum Operator {
  EQ = 'eq',
  NE = 'ne',
  GT = 'gt',
  GTE = 'gte',
  LT = 'lt',
  LTE = 'lte',
  LIKE = 'like',
  ILIKE = 'ilike',
  NOT_LIKE = 'not_like',
  IN = 'in',
  NOT_IN = 'not_in',
  BETWEEN = 'between',
  NOT_BETWEEN = 'not_between',
  IS_NULL = 'is_null',
  IS_NOT_NULL = 'is_not_null',
  EXISTS = 'exists',
  NOT_EXISTS = 'not_exists',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  CONTAINS = 'contains',
  RAW = 'raw',
}

export enum JoinType {
  INNER = 'INNER JOIN',
  LEFT = 'LEFT JOIN',
  RIGHT = 'RIGHT JOIN',
  FULL = 'FULL OUTER JOIN',
  CROSS = 'CROSS JOIN',
}

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum LogicalOperator {
  AND = 'AND',
  OR = 'OR',
}

// ─── Condition nodes ──────────────────────────────────────────────────────────

export type SimpleCondition = {
  type: 'simple';
  field: string;
  operator: Operator;
  value?: unknown;
  logical?: LogicalOperator;
};

export type GroupCondition = {
  type: 'group';
  conditions: ConditionNode[];
  logical?: LogicalOperator;
};

export type RawCondition = {
  type: 'raw';
  sql: string;
  params?: unknown[];
  logical?: LogicalOperator;
};

export type ConditionNode = SimpleCondition | GroupCondition | RawCondition;

// ─── Query nodes ──────────────────────────────────────────────────────────────

export type SelectField =
  | string
  | { field: string; alias: string }
  | { raw: string; params?: unknown[] };

export type FromClause = {
  table: string;
  alias?: string;
};

export type JoinClause = {
  type: JoinType;
  table: string;
  alias?: string;
  on: string;
};

export type OrderByClause = {
  field: string;
  direction: SortDirection;
};

export type GroupByClause = {
  fields: string[];
};

export type HavingClause = {
  condition: string;
  params?: unknown[];
};

export type AggregateType = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

export type AggregateField = {
  fn: AggregateType;
  field: string;
  alias?: string;
};

// The compiled SQL result
export type SQLResult = {
  sql: string;
  params: unknown[];
};

// ─── Graph query types ────────────────────────────────────────────────────────

export type TraversalDirection = 'outbound' | 'inbound' | 'any';

export type NodeFilter = {
  type?: string;
  conditions: ConditionNode[];
};

export type EdgeFilter = {
  type?: string;
  fromId?: string;
  toId?: string;
  conditions: ConditionNode[];
};

export type TraversalOptions = {
  startId: string;
  maxDepth: number;
  direction: TraversalDirection;
  nodeFilter?: NodeFilter;
  edgeFilter?: EdgeFilter;
};

export type PathOptions = {
  fromId: string;
  toId: string;
  maxHops: number;
  direction: TraversalDirection;
};

export type PatternNode = {
  alias: string;
  type?: string;
  conditions?: ConditionNode[];
};

export type PatternEdge = {
  alias: string;
  type?: string;
  fromAlias: string;
  toAlias: string;
  direction?: TraversalDirection;
};

export type GraphQueryResult = {
  type: 'nodes' | 'edges' | 'traversal' | 'path' | 'neighbors' | 'pattern';
  nodeFilter?: NodeFilter;
  edgeFilter?: EdgeFilter;
  traversal?: TraversalOptions;
  path?: PathOptions;
  pattern?: { nodes: PatternNode[]; edges: PatternEdge[] };
  limit?: number;
  offset?: number;
};
