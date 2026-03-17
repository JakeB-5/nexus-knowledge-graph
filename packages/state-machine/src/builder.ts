/**
 * Fluent builder API for constructing StateMachineDefinitions.
 */
import type {
  StateId,
  EventType,
  BaseEvent,
  Action,
  Guard,
  StateDefinition,
  TransitionDefinition,
  StateMachineDefinition,
  ValidationResult,
} from "./types.js";

// --- State Builder ---

class StateBuilder<TContext, TEvent extends BaseEvent> {
  private _def: StateDefinition<TContext, TEvent>;
  private _machineBuilder: StateMachineBuilder<TContext, TEvent>;

  constructor(
    id: StateId,
    machineBuilder: StateMachineBuilder<TContext, TEvent>
  ) {
    this._def = { id, type: "normal" };
    this._machineBuilder = machineBuilder;
  }

  onEntry(action: Action<TContext, TEvent>): this {
    if (!this._def.onEntry) this._def.onEntry = [];
    this._def.onEntry.push(action);
    return this;
  }

  onExit(action: Action<TContext, TEvent>): this {
    if (!this._def.onExit) this._def.onExit = [];
    this._def.onExit.push(action);
    return this;
  }

  meta(data: Record<string, unknown>): this {
    this._def.meta = { ...this._def.meta, ...data };
    return this;
  }

  parallel(stateIds: StateId[]): this {
    this._def.parallel = stateIds;
    return this;
  }

  asInitial(): this {
    this._def.type = "initial";
    return this;
  }

  asFinal(): this {
    this._def.type = "final";
    return this;
  }

  build(): StateDefinition<TContext, TEvent> {
    return this._def;
  }

  // Delegate back to machine builder for chaining
  state(id: StateId): StateBuilder<TContext, TEvent> {
    return this._machineBuilder.state(id);
  }

  transition(from: StateId, event: EventType, to: StateId): TransitionBuilder<TContext, TEvent> {
    return this._machineBuilder.transition(from, event, to);
  }

  initial(stateId: StateId): StateMachineBuilder<TContext, TEvent> {
    return this._machineBuilder.initial(stateId);
  }

  final(stateId: StateId): StateMachineBuilder<TContext, TEvent> {
    return this._machineBuilder.final(stateId);
  }

  build_machine(): StateMachineDefinition<TContext, TEvent> {
    return this._machineBuilder.build();
  }
}

// --- Transition Builder ---

class TransitionBuilder<TContext, TEvent extends BaseEvent> {
  private _def: TransitionDefinition<TContext, TEvent>;
  private _machineBuilder: StateMachineBuilder<TContext, TEvent>;

  constructor(
    from: StateId,
    event: EventType,
    to: StateId,
    machineBuilder: StateMachineBuilder<TContext, TEvent>
  ) {
    this._def = { from, event, to };
    this._machineBuilder = machineBuilder;
  }

  guard(fn: Guard<TContext, TEvent>): this {
    if (!this._def.guards) this._def.guards = [];
    this._def.guards.push(fn);
    return this;
  }

  action(fn: Action<TContext, TEvent>): this {
    if (!this._def.actions) this._def.actions = [];
    this._def.actions.push(fn);
    return this;
  }

  description(desc: string): this {
    this._def.description = desc;
    return this;
  }

  build(): TransitionDefinition<TContext, TEvent> {
    return this._def;
  }

  // Delegate back to machine builder
  state(id: StateId): StateBuilder<TContext, TEvent> {
    return this._machineBuilder.state(id);
  }

  transition(from: StateId, event: EventType, to: StateId): TransitionBuilder<TContext, TEvent> {
    return this._machineBuilder.transition(from, event, to);
  }

  initial(stateId: StateId): StateMachineBuilder<TContext, TEvent> {
    return this._machineBuilder.initial(stateId);
  }

  final(stateId: StateId): StateMachineBuilder<TContext, TEvent> {
    return this._machineBuilder.final(stateId);
  }

  build_machine(): StateMachineDefinition<TContext, TEvent> {
    return this._machineBuilder.build();
  }
}

// --- Main Builder ---

export class StateMachineBuilder<
  TContext = Record<string, unknown>,
  TEvent extends BaseEvent = BaseEvent
> {
  private _id: string;
  private _initial: StateId = "";
  private _final: StateId[] = [];
  private _states: Map<StateId, StateDefinition<TContext, TEvent>> = new Map();
  private _transitions: TransitionDefinition<TContext, TEvent>[] = [];
  private _context: TContext = {} as TContext;

  constructor(id: string) {
    this._id = id;
  }

  /** Set the initial context */
  withContext(context: TContext): this {
    this._context = context;
    return this;
  }

  /** Define a state */
  state(id: StateId): StateBuilder<TContext, TEvent> {
    const builder = new StateBuilder<TContext, TEvent>(id, this);
    // Register state when first created; build() will finalize
    if (!this._states.has(id)) {
      this._states.set(id, { id });
    }
    // Return a builder that will update the state on build
    const self = this;
    const stateBuilder = new StateBuilder<TContext, TEvent>(id, this);
    // Override build to register with the machine builder
    const originalBuild = stateBuilder.build.bind(stateBuilder);
    Object.defineProperty(stateBuilder, "build", {
      value: () => {
        const def = originalBuild();
        self._states.set(id, def);
        return def;
      },
    });
    // Auto-register simple state immediately (full def set via build)
    void builder;
    return stateBuilder;
  }

  /** Define a transition */
  transition(from: StateId, event: EventType, to: StateId): TransitionBuilder<TContext, TEvent> {
    const builder = new TransitionBuilder<TContext, TEvent>(from, event, to, this);
    const self = this;
    const originalBuild = builder.build.bind(builder);
    Object.defineProperty(builder, "build", {
      value: () => {
        const def = originalBuild();
        self._transitions.push(def);
        return def;
      },
    });
    return builder;
  }

  /** Set the initial state */
  initial(stateId: StateId): this {
    this._initial = stateId;
    return this;
  }

  /** Mark a state as final */
  final(stateId: StateId): this {
    if (!this._final.includes(stateId)) {
      this._final.push(stateId);
    }
    return this;
  }

  /** Build and validate the definition */
  build(): StateMachineDefinition<TContext, TEvent> {
    const definition: StateMachineDefinition<TContext, TEvent> = {
      id: this._id,
      initial: this._initial,
      states: this._states,
      transitions: this._transitions,
      context: this._context,
      final: this._final.length > 0 ? this._final : undefined,
    };
    return definition;
  }

  /** Build with validation, throws if invalid */
  buildValidated(): StateMachineDefinition<TContext, TEvent> {
    const definition = this.build();
    const result = validate(definition);
    if (!result.valid) {
      throw new Error(`Invalid state machine: ${result.errors.join("; ")}`);
    }
    return definition;
  }
}

// --- Validation ---

export function validate<TContext, TEvent extends BaseEvent>(
  definition: StateMachineDefinition<TContext, TEvent>
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check initial state exists
  if (!definition.initial) {
    errors.push("No initial state defined");
  } else if (!definition.states.has(definition.initial)) {
    errors.push(`Initial state "${definition.initial}" is not defined`);
  }

  // Check all transition targets exist
  for (const t of definition.transitions) {
    if (!definition.states.has(t.from)) {
      errors.push(`Transition from unknown state "${t.from}"`);
    }
    if (!definition.states.has(t.to)) {
      errors.push(`Transition to unknown state "${t.to}"`);
    }
  }

  // Check final states exist
  if (definition.final) {
    for (const f of definition.final) {
      if (!definition.states.has(f)) {
        errors.push(`Final state "${f}" is not defined`);
      }
    }
  }

  // Check for orphan states (not reachable from initial)
  const reachable = computeReachable(definition);
  for (const [id] of definition.states) {
    if (!reachable.has(id)) {
      warnings.push(`State "${id}" is not reachable from initial state "${definition.initial}"`);
    }
  }

  // Check for states with no outgoing transitions (non-final dead ends)
  for (const [id] of definition.states) {
    const isFinal = definition.final?.includes(id) ?? false;
    if (!isFinal) {
      const hasOutgoing = definition.transitions.some((t) => t.from === id);
      if (!hasOutgoing) {
        warnings.push(`State "${id}" has no outgoing transitions and is not a final state`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function computeReachable<TContext, TEvent extends BaseEvent>(
  definition: StateMachineDefinition<TContext, TEvent>
): Set<StateId> {
  const reachable = new Set<StateId>();
  const queue: StateId[] = [definition.initial];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const t of definition.transitions) {
      if (t.from === current && !reachable.has(t.to)) {
        queue.push(t.to);
      }
    }
  }
  return reachable;
}

// --- Convenience Factory ---

export function defineMachine<
  TContext = Record<string, unknown>,
  TEvent extends BaseEvent = BaseEvent
>(id: string): StateMachineBuilder<TContext, TEvent> {
  return new StateMachineBuilder<TContext, TEvent>(id);
}
