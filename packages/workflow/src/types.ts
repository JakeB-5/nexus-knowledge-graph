// Workflow type definitions for the Nexus workflow engine

export enum StepType {
  Action = 'action',
  Condition = 'condition',
  Loop = 'loop',
  Parallel = 'parallel',
  Delay = 'delay',
  Webhook = 'webhook',
}

export enum WorkflowStatus {
  Pending = 'pending',
  Running = 'running',
  Paused = 'paused',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
  TimedOut = 'timed_out',
}

export enum TriggerType {
  Manual = 'manual',
  Schedule = 'schedule',
  Event = 'event',
  Webhook = 'webhook',
}

// Condition expression types
export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'matches';
export type LogicalOperator = 'and' | 'or' | 'not';

export interface SimpleCondition {
  type: 'simple';
  left: string; // expression or literal
  operator: ComparisonOperator;
  right: string | number | boolean | null;
}

export interface LogicalCondition {
  type: 'logical';
  operator: LogicalOperator;
  conditions: ConditionExpression[];
}

export type ConditionExpression = SimpleCondition | LogicalCondition;

// Step configuration types
export interface ActionStepConfig {
  action: string; // built-in or custom action name
  inputs?: Record<string, unknown>;
  outputMapping?: Record<string, string>; // output key -> context variable path
}

export interface ConditionStepConfig {
  condition: ConditionExpression;
  thenSteps?: string[]; // step ids to execute if true
  elseSteps?: string[]; // step ids to execute if false
}

export interface LoopStepConfig {
  mode: 'for-each' | 'while';
  items?: string; // expression yielding array (for-each mode)
  itemVariable?: string; // variable name for current item
  condition?: ConditionExpression; // termination condition (while mode)
  steps: WorkflowStep[]; // sub-steps to execute each iteration
  maxIterations?: number;
  accumulator?: string; // variable to collect results
}

export interface ParallelStepConfig {
  steps: WorkflowStep[];
  waitStrategy: 'all' | 'first';
  concurrencyLimit?: number;
  errorStrategy: 'fail-fast' | 'collect-all';
}

export interface DelayStepConfig {
  ms?: number; // fixed delay
  variable?: string; // expression yielding delay ms
}

export interface WebhookStepConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export type StepConfig =
  | ActionStepConfig
  | ConditionStepConfig
  | LoopStepConfig
  | ParallelStepConfig
  | DelayStepConfig
  | WebhookStepConfig;

// Retry policy
export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
}

// Workflow step definition
export interface WorkflowStep {
  id: string;
  name?: string;
  type: StepType;
  config: StepConfig;
  next?: string; // next step id; undefined means end of workflow
  condition?: ConditionExpression; // guard condition to skip this step
  retry?: RetryPolicy;
  timeoutMs?: number;
  onError?: 'fail' | 'continue' | 'fallback';
  fallbackStepId?: string;
}

// Trigger definition
export interface ScheduleConfig {
  cron: string; // cron expression e.g. "0 9 * * 1-5"
  timezone?: string;
}

export interface EventTriggerConfig {
  eventType: string; // e.g. "node.created", "edge.deleted"
  filter?: ConditionExpression;
}

export interface WebhookTriggerConfig {
  path?: string; // custom path suffix
  secret?: string; // HMAC validation secret
  method?: 'GET' | 'POST';
}

export interface TriggerCondition {
  expression: ConditionExpression;
}

export interface Trigger {
  id: string;
  type: TriggerType;
  config: ScheduleConfig | EventTriggerConfig | WebhookTriggerConfig | Record<string, unknown>;
  condition?: TriggerCondition;
  deduplicationKey?: string; // expression to compute deduplication key
  deduplicationWindowMs?: number;
}

// Workflow definition (static blueprint)
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  triggers: Trigger[];
  steps: WorkflowStep[];
  firstStepId: string;
  variables?: Record<string, unknown>; // default variable values
  timeoutMs?: number; // overall workflow timeout
  tags?: string[];
}

// Step execution result
export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'skipped' | 'timed_out';
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt: Date;
  attempt: number;
}

// Execution context (mutable runtime state)
export interface ExecutionContext {
  workflowId: string;
  instanceId: string;
  variables: Record<string, unknown>;
  stepResults: Map<string, StepResult>;
  currentStepId?: string;
  triggerPayload?: unknown;
}

// Workflow instance (runtime)
export interface WorkflowInstance {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: WorkflowStatus;
  context: ExecutionContext;
  history: StepResult[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  pausedAt?: Date;
  resumeData?: unknown;
  error?: WorkflowErrorDetail;
}

// Error types
export interface WorkflowErrorDetail {
  code: WorkflowErrorCode;
  message: string;
  stepId?: string;
  cause?: string;
  timestamp: Date;
}

export enum WorkflowErrorCode {
  StepFailed = 'STEP_FAILED',
  StepTimedOut = 'STEP_TIMED_OUT',
  WorkflowTimedOut = 'WORKFLOW_TIMED_OUT',
  MaxRetriesExceeded = 'MAX_RETRIES_EXCEEDED',
  ConditionError = 'CONDITION_ERROR',
  ExpressionError = 'EXPRESSION_ERROR',
  ActionNotFound = 'ACTION_NOT_FOUND',
  WorkflowNotFound = 'WORKFLOW_NOT_FOUND',
  InvalidStepConfig = 'INVALID_STEP_CONFIG',
  MaxIterationsExceeded = 'MAX_ITERATIONS_EXCEEDED',
  ConcurrencyError = 'CONCURRENCY_ERROR',
}

export class WorkflowError extends Error {
  readonly code: WorkflowErrorCode;
  readonly stepId?: string;

  constructor(code: WorkflowErrorCode, message: string, stepId?: string) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
    this.stepId = stepId;
  }
}
