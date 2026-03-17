// Core event system types for @nexus/events

export interface Event<TPayload = unknown> {
  /** Hierarchical event type, e.g. "node:created", "edge:deleted" */
  type: string;
  /** The data carried by this event */
  payload: TPayload;
  /** ISO timestamp when the event was emitted */
  timestamp: string;
  /** Identifier of the entity or service that emitted the event */
  source: string;
  /** Optional free-form metadata (trace IDs, user IDs, etc.) */
  metadata?: Record<string, unknown>;
  /** Monotonically increasing sequence number (set by EventStore) */
  sequence?: number;
  /** Aggregate ID for event-sourced entities */
  aggregateId?: string;
  /** Aggregate type name for event-sourced entities */
  aggregateType?: string;
  /** Aggregate version at time of event */
  aggregateVersion?: number;
}

export type EventHandler<TPayload = unknown> = (
  event: Event<TPayload>
) => void | Promise<void>;

/** Return true to accept the event, false to skip it */
export type EventFilter<TPayload = unknown> = (
  event: Event<TPayload>
) => boolean;

export interface Subscription {
  id: string;
  pattern: string;
  handler: EventHandler;
  priority: number;
  once: boolean;
  filter?: EventFilter;
}

// ─── EventStore interface ─────────────────────────────────────────────────────

export interface EventQuery {
  types?: string[];
  source?: string;
  aggregateId?: string;
  aggregateType?: string;
  fromSequence?: number;
  toSequence?: number;
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  cursor?: string;
}

export interface EventPage<TPayload = unknown> {
  events: Event<TPayload>[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface EventStore {
  append<TPayload>(event: Omit<Event<TPayload>, "sequence">): Promise<Event<TPayload>>;
  query<TPayload>(query: EventQuery): Promise<EventPage<TPayload>>;
  stream<TPayload>(
    query: EventQuery,
    handler: (event: Event<TPayload>) => void | Promise<void>
  ): Promise<void>;
  getLatestSequence(): Promise<number>;
  count(query?: EventQuery): Promise<number>;
}

// ─── Snapshot types ───────────────────────────────────────────────────────────

export interface Snapshot<TState = unknown> {
  aggregateId: string;
  aggregateType: string;
  version: number;
  state: TState;
  timestamp: string;
}

// ─── Aggregate event types (used in event-sourcing) ──────────────────────────

export interface NodeCreatedPayload {
  nodeId: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface NodeUpdatedPayload {
  nodeId: string;
  changes: Record<string, unknown>;
}

export interface NodeDeletedPayload {
  nodeId: string;
}

export interface EdgeCreatedPayload {
  edgeId: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface EdgeDeletedPayload {
  edgeId: string;
}

// ─── Saga types ───────────────────────────────────────────────────────────────

export type SagaStatus =
  | "started"
  | `step_${number}`
  | "compensating"
  | "completed"
  | "failed";

export interface SagaStep<TContext = unknown> {
  name: string;
  execute: (context: TContext) => Promise<TContext>;
  compensate: (context: TContext) => Promise<TContext>;
  timeoutMs?: number;
}

export interface SagaState<TContext = unknown> {
  id: string;
  name: string;
  status: SagaStatus;
  currentStep: number;
  context: TContext;
  error?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}
