/**
 * Core types for the state machine package.
 */

// --- Primitive Types ---

export type StateId = string;
export type EventType = string;

// --- Guard Function ---

/** A guard is a predicate that must return true for a transition to be taken */
export type Guard<TContext = unknown, TEvent extends BaseEvent = BaseEvent> = (
  context: TContext,
  event: TEvent
) => boolean;

// --- Action Function ---

/** An action is a side effect executed during a transition or state entry/exit */
export type Action<TContext = unknown, TEvent extends BaseEvent = BaseEvent> = (
  context: TContext,
  event: TEvent
) => TContext | void | Promise<TContext | void>;

// --- Base Event ---

export interface BaseEvent {
  type: EventType;
  [key: string]: unknown;
}

// --- Transition Definition ---

export interface TransitionDefinition<
  TContext = unknown,
  TEvent extends BaseEvent = BaseEvent
> {
  from: StateId;
  event: EventType;
  to: StateId;
  guards?: Array<Guard<TContext, TEvent>>;
  actions?: Array<Action<TContext, TEvent>>;
  description?: string;
}

// --- State Definition ---

export interface StateDefinition<
  TContext = unknown,
  TEvent extends BaseEvent = BaseEvent
> {
  id: StateId;
  type?: "normal" | "initial" | "final" | "parallel" | "history";
  onEntry?: Array<Action<TContext, TEvent>>;
  onExit?: Array<Action<TContext, TEvent>>;
  /** Nested child state machine definition (hierarchical states) */
  children?: StateMachineDefinition<TContext, TEvent>;
  /** Parallel sub-state IDs (for parallel states) */
  parallel?: StateId[];
  meta?: Record<string, unknown>;
}

// --- State Machine Definition ---

export interface StateMachineDefinition<
  TContext = unknown,
  TEvent extends BaseEvent = BaseEvent
> {
  id: string;
  initial: StateId;
  states: Map<StateId, StateDefinition<TContext, TEvent>>;
  transitions: TransitionDefinition<TContext, TEvent>[];
  context: TContext;
  final?: StateId[];
}

// --- Transition History Entry ---

export interface TransitionRecord<TEvent extends BaseEvent = BaseEvent> {
  from: StateId;
  to: StateId;
  event: TEvent;
  timestamp: number;
  duration?: number;
}

// --- State Machine Instance ---

export interface StateMachineInstance<
  TContext = unknown,
  TEvent extends BaseEvent = BaseEvent
> {
  readonly id: string;
  readonly currentState: StateId;
  readonly context: TContext;
  readonly history: TransitionRecord<TEvent>[];
  readonly isFinished: boolean;

  send(event: TEvent): void;
  canTransition(eventType: EventType): boolean;
  getPossibleEvents(): EventType[];
  serialize(): SerializedMachineState<TContext>;
}

// --- Serialized State ---

export interface SerializedMachineState<TContext = unknown> {
  id: string;
  currentState: StateId;
  context: TContext;
  history: TransitionRecord[];
  timestamp: number;
}

// --- Interpreter Options ---

export interface InterpreterOptions {
  /** Maximum history entries to keep (0 = unlimited) */
  maxHistory?: number;
  /** Enable async action support */
  async?: boolean;
  /** Log transitions */
  debug?: boolean;
}

// --- Event Listener Types ---

export type TransitionListener<
  TContext = unknown,
  TEvent extends BaseEvent = BaseEvent
> = (record: TransitionRecord<TEvent>, context: TContext) => void;

export type StateChangeListener<TContext = unknown> = (
  newState: StateId,
  oldState: StateId,
  context: TContext
) => void;

export type ErrorListener = (error: Error, state: StateId) => void;

// --- Validation Result ---

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
