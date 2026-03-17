/**
 * StateMachineInterpreter: event listeners, async support, delayed transitions, inspection.
 */
import type {
  StateId,
  EventType,
  BaseEvent,
  StateMachineDefinition,
  TransitionRecord,
  TransitionListener,
  StateChangeListener,
  ErrorListener,
  InterpreterOptions,
} from "./types.js";
import { StateMachine } from "./state-machine.js";

export interface DelayedTransition<TEvent extends BaseEvent = BaseEvent> {
  id: string;
  event: TEvent;
  delay: number;
  timerId?: ReturnType<typeof setTimeout>;
}

export class StateMachineInterpreter<
  TContext = unknown,
  TEvent extends BaseEvent = BaseEvent
> {
  private readonly _machine: StateMachine<TContext, TEvent>;
  private readonly _definition: StateMachineDefinition<TContext, TEvent>;

  // Listeners
  private _transitionListeners: Array<TransitionListener<TContext, TEvent>> = [];
  private _stateChangeListeners: Array<StateChangeListener<TContext>> = [];
  private _errorListeners: Array<ErrorListener> = [];

  // Async queue
  private _asyncQueue: Array<{ event: TEvent; resolve: () => void; reject: (e: Error) => void }> = [];
  private _processingAsync = false;

  // Delayed transitions
  private _delayedTransitions: Map<string, DelayedTransition<TEvent>> = new Map();
  private _delayIdCounter = 0;

  // State
  private _started = false;
  private _stopped = false;

  // Previous state tracking for listeners
  private _previousState: StateId;

  constructor(
    definition: StateMachineDefinition<TContext, TEvent>,
    options: InterpreterOptions = {}
  ) {
    this._definition = definition;
    this._machine = new StateMachine(definition, options);
    this._previousState = definition.initial;
  }

  get currentState(): StateId {
    return this._machine.currentState;
  }

  get context(): TContext {
    return this._machine.context;
  }

  get history(): TransitionRecord<TEvent>[] {
    return this._machine.history;
  }

  get isStarted(): boolean {
    return this._started;
  }

  get isStopped(): boolean {
    return this._stopped;
  }

  get isFinished(): boolean {
    return this._machine.isFinished;
  }

  /** Start the interpreter */
  start(): this {
    if (this._started) throw new Error("Interpreter already started");
    this._started = true;
    this._stopped = false;
    return this;
  }

  /** Stop the interpreter, canceling all delayed transitions */
  stop(): this {
    this._stopped = true;
    this._cancelAllDelayed();
    return this;
  }

  /** Send an event synchronously */
  send(event: TEvent): this {
    if (!this._started) throw new Error("Interpreter not started. Call start() first.");
    if (this._stopped) throw new Error("Interpreter has been stopped.");

    const prevState = this._machine.currentState;
    try {
      this._machine.send(event);
      this._notifyListeners(prevState, event);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const listener of this._errorListeners) {
        listener(error, this._machine.currentState);
      }
      throw error;
    }
    return this;
  }

  /** Send an event asynchronously (queued, in order) */
  async sendAsync(event: TEvent): Promise<void> {
    if (!this._started) throw new Error("Interpreter not started");
    return new Promise<void>((resolve, reject) => {
      this._asyncQueue.push({ event, resolve, reject });
      void this._processAsyncQueue();
    });
  }

  private async _processAsyncQueue(): Promise<void> {
    if (this._processingAsync) return;
    this._processingAsync = true;
    while (this._asyncQueue.length > 0) {
      const item = this._asyncQueue.shift()!;
      const prevState = this._machine.currentState;
      try {
        this._machine.send(item.event);
        await this._runAsyncActions(item.event);
        this._notifyListeners(prevState, item.event);
        item.resolve();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        for (const listener of this._errorListeners) {
          listener(error, this._machine.currentState);
        }
        item.reject(error);
      }
    }
    this._processingAsync = false;
  }

  private async _runAsyncActions(_event: TEvent): Promise<void> {
    // Async actions are resolved via the machine's action system;
    // this hook point allows subclasses to inject additional async handling
    await Promise.resolve();
  }

  /** Schedule a delayed transition */
  delay(event: TEvent, delayMs: number): string {
    const id = `delay-${++this._delayIdCounter}`;
    const timer = setTimeout(() => {
      if (!this._stopped && this._started) {
        try {
          this.send(event);
        } catch {
          // Ignore errors from delayed transitions (machine may have moved on)
        }
      }
      this._delayedTransitions.delete(id);
    }, delayMs);

    this._delayedTransitions.set(id, { id, event, delay: delayMs, timerId: timer });
    return id;
  }

  /** Cancel a specific delayed transition */
  cancelDelay(id: string): boolean {
    const d = this._delayedTransitions.get(id);
    if (!d) return false;
    if (d.timerId !== undefined) clearTimeout(d.timerId);
    this._delayedTransitions.delete(id);
    return true;
  }

  private _cancelAllDelayed(): void {
    for (const [, d] of this._delayedTransitions) {
      if (d.timerId !== undefined) clearTimeout(d.timerId);
    }
    this._delayedTransitions.clear();
  }

  // --- Listeners ---

  /** Listen for any state transition */
  onTransition(listener: TransitionListener<TContext, TEvent>): () => void {
    this._transitionListeners.push(listener);
    return () => {
      this._transitionListeners = this._transitionListeners.filter((l) => l !== listener);
    };
  }

  /** Listen for state changes */
  onStateChange(listener: StateChangeListener<TContext>): () => void {
    this._stateChangeListeners.push(listener);
    return () => {
      this._stateChangeListeners = this._stateChangeListeners.filter((l) => l !== listener);
    };
  }

  /** Listen for errors */
  onError(listener: ErrorListener): () => void {
    this._errorListeners.push(listener);
    return () => {
      this._errorListeners = this._errorListeners.filter((l) => l !== listener);
    };
  }

  private _notifyListeners(prevState: StateId, event: TEvent): void {
    const newState = this._machine.currentState;
    const history = this._machine.history;
    const lastRecord = history[history.length - 1];

    if (lastRecord && lastRecord.from === prevState) {
      for (const listener of this._transitionListeners) {
        listener(lastRecord, this._machine.context);
      }
    }

    if (newState !== prevState) {
      for (const listener of this._stateChangeListeners) {
        listener(newState, prevState, this._machine.context);
      }
      this._previousState = prevState;
    }
    void event;
  }

  // --- Inspection ---

  /** Get all events possible from the current state */
  getPossibleEvents(): EventType[] {
    return this._machine.getPossibleEvents();
  }

  /** Check if a transition is possible for a given event */
  can(eventType: EventType): boolean {
    return this._machine.canTransition(eventType);
  }

  /** Get the machine definition */
  getDefinition(): StateMachineDefinition<TContext, TEvent> {
    return this._definition;
  }

  /** Get all state IDs */
  getStates(): StateId[] {
    return [...this._definition.states.keys()];
  }

  /** Get all transition definitions */
  getTransitions() {
    return [...this._definition.transitions];
  }

  /** Snapshot current state for inspection */
  snapshot() {
    return this._machine.serialize();
  }

  /** Get previous state */
  getPreviousState(): StateId {
    return this._previousState;
  }
}

// --- Factory ---

export function interpret<TContext, TEvent extends BaseEvent>(
  definition: StateMachineDefinition<TContext, TEvent>,
  options?: InterpreterOptions
): StateMachineInterpreter<TContext, TEvent> {
  return new StateMachineInterpreter(definition, options);
}
