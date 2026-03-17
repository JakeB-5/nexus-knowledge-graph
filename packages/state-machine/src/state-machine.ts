/**
 * StateMachine: core execution engine.
 */
import type {
  StateId,
  EventType,
  BaseEvent,
  StateMachineDefinition,
  StateMachineInstance,
  TransitionRecord,
  SerializedMachineState,
  InterpreterOptions,
  TransitionDefinition,
} from "./types.js";

export class StateMachine<
  TContext = unknown,
  TEvent extends BaseEvent = BaseEvent
> implements StateMachineInstance<TContext, TEvent> {
  private _currentState: StateId;
  private _context: TContext;
  private _history: TransitionRecord<TEvent>[];
  private readonly _definition: StateMachineDefinition<TContext, TEvent>;
  private readonly _options: Required<InterpreterOptions>;
  private _eventQueue: TEvent[];
  private _processing: boolean;
  private _parallelStates: Map<StateId, StateMachine<TContext, TEvent>>;
  private _childMachine: StateMachine<TContext, TEvent> | null;
  private _stateEnteredAt: number;

  constructor(
    definition: StateMachineDefinition<TContext, TEvent>,
    options: InterpreterOptions = {}
  ) {
    this._definition = definition;
    this._currentState = definition.initial;
    this._context = { ...definition.context } as TContext;
    this._history = [];
    this._eventQueue = [];
    this._processing = false;
    this._parallelStates = new Map();
    this._childMachine = null;
    this._stateEnteredAt = Date.now();
    this._options = {
      maxHistory: options.maxHistory ?? 0,
      async: options.async ?? false,
      debug: options.debug ?? false,
    };

    this._initializeState(definition.initial);
  }

  get id(): string {
    return this._definition.id;
  }

  get currentState(): StateId {
    return this._currentState;
  }

  get context(): TContext {
    return this._context;
  }

  get history(): TransitionRecord<TEvent>[] {
    return [...this._history];
  }

  get isFinished(): boolean {
    return this._definition.final?.includes(this._currentState) ?? false;
  }

  /** Send an event to the machine */
  send(event: TEvent): void {
    this._eventQueue.push(event);
    if (!this._processing) {
      this._processQueue();
    }
  }

  /** Check if a given event type can trigger a transition from the current state */
  canTransition(eventType: EventType): boolean {
    return this._findTransition(eventType, {} as TEvent) !== null;
  }

  /** Get all event types that can trigger transitions from the current state */
  getPossibleEvents(): EventType[] {
    const events = new Set<EventType>();
    for (const t of this._definition.transitions) {
      if (t.from === this._currentState) {
        events.add(t.event);
      }
    }
    return [...events];
  }

  /** Serialize the current state to a plain object */
  serialize(): SerializedMachineState<TContext> {
    return {
      id: this._definition.id,
      currentState: this._currentState,
      context: JSON.parse(JSON.stringify(this._context)) as TContext,
      history: this._history.map((h) => ({ ...h })),
      timestamp: Date.now(),
    };
  }

  /** Restore state from serialized form */
  static deserialize<TContext, TEvent extends BaseEvent>(
    definition: StateMachineDefinition<TContext, TEvent>,
    serialized: SerializedMachineState<TContext>,
    options?: InterpreterOptions
  ): StateMachine<TContext, TEvent> {
    const machine = new StateMachine(definition, options);
    machine._currentState = serialized.currentState;
    machine._context = serialized.context;
    machine._history = serialized.history as TransitionRecord<TEvent>[];
    return machine;
  }

  // --- Private Methods ---

  private _processQueue(): void {
    this._processing = true;
    while (this._eventQueue.length > 0) {
      const event = this._eventQueue.shift()!;
      this._processEvent(event);
    }
    this._processing = false;
  }

  private _processEvent(event: TEvent): void {
    if (this.isFinished) {
      if (this._options.debug) console.log(`[${this.id}] Machine is finished, ignoring event`, event);
      return;
    }

    // If we have an active child machine, try it first (hierarchical)
    if (this._childMachine && !this._childMachine.isFinished) {
      this._childMachine.send(event);
      // If child handled it (its state changed), sync context
      this._context = this._childMachine.context;
      return;
    }

    const transition = this._findTransition(event.type, event);
    if (!transition) {
      if (this._options.debug) {
        console.log(`[${this.id}] No transition for event "${event.type}" in state "${this._currentState}"`);
      }
      return;
    }

    this._executeTransition(transition, event);

    // Also propagate to parallel states
    for (const [, parallel] of this._parallelStates) {
      parallel.send(event);
    }
  }

  private _findTransition(
    eventType: EventType,
    event: TEvent
  ): TransitionDefinition<TContext, TEvent> | null {
    for (const t of this._definition.transitions) {
      if (t.from !== this._currentState || t.event !== eventType) continue;
      if (t.guards && !t.guards.every((g) => g(this._context, event))) continue;
      return t;
    }
    return null;
  }

  private _executeTransition(
    transition: TransitionDefinition<TContext, TEvent>,
    event: TEvent
  ): void {
    const startTime = Date.now();
    const fromState = this._currentState;

    if (this._options.debug) {
      console.log(`[${this.id}] ${fromState} --[${event.type}]--> ${transition.to}`);
    }

    // Run exit actions for current state
    const currentStateDef = this._definition.states.get(fromState);
    if (currentStateDef?.onExit) {
      for (const action of currentStateDef.onExit) {
        const result = action(this._context, event);
        if (result && typeof result === "object" && !(result instanceof Promise)) {
          this._context = result as TContext;
        }
      }
    }

    // Run transition actions
    if (transition.actions) {
      for (const action of transition.actions) {
        const result = action(this._context, event);
        if (result && typeof result === "object" && !(result instanceof Promise)) {
          this._context = result as TContext;
        }
      }
    }

    // Update state
    this._currentState = transition.to;
    this._stateEnteredAt = Date.now();

    // Record in history
    const record: TransitionRecord<TEvent> = {
      from: fromState,
      to: transition.to,
      event,
      timestamp: startTime,
      duration: Date.now() - startTime,
    };
    this._history.push(record);
    if (this._options.maxHistory > 0 && this._history.length > this._options.maxHistory) {
      this._history.shift();
    }

    // Run entry actions for new state
    this._initializeState(transition.to, event);
  }

  private _initializeState(stateId: StateId, event?: TEvent): void {
    const stateDef = this._definition.states.get(stateId);
    if (!stateDef) return;

    // Run entry actions
    if (stateDef.onEntry && event) {
      for (const action of stateDef.onEntry) {
        const result = action(this._context, event);
        if (result && typeof result === "object" && !(result instanceof Promise)) {
          this._context = result as TContext;
        }
      }
    }

    // Initialize child machine if defined
    if (stateDef.children) {
      this._childMachine = new StateMachine(stateDef.children, this._options);
    } else {
      this._childMachine = null;
    }

    // Initialize parallel states
    this._parallelStates.clear();
    if (stateDef.parallel) {
      for (const parallelId of stateDef.parallel) {
        const parallelDef = this._definition.states.get(parallelId);
        if (parallelDef?.children) {
          this._parallelStates.set(
            parallelId,
            new StateMachine(parallelDef.children, this._options)
          );
        }
      }
    }
  }
}

// --- Factory Function ---

export function createMachine<TContext, TEvent extends BaseEvent>(
  definition: StateMachineDefinition<TContext, TEvent>,
  options?: InterpreterOptions
): StateMachine<TContext, TEvent> {
  return new StateMachine(definition, options);
}
