// Event sourcing: aggregate root pattern, NodeAggregate, EdgeAggregate

import type {
  Event,
  NodeCreatedPayload,
  NodeUpdatedPayload,
  NodeDeletedPayload,
  EdgeCreatedPayload,
  EdgeDeletedPayload,
  Snapshot,
} from "./types.js";
import type { InMemoryEventStore } from "./event-store.js";

// ─── EventSourcedEntity base class ───────────────────────────────────────────

export abstract class EventSourcedEntity<TState> {
  protected _state: TState;
  protected _version = 0;
  protected _id: string;
  protected _type: string;
  private _pendingEvents: Event[] = [];

  constructor(id: string, type: string, initialState: TState) {
    this._id = id;
    this._type = type;
    this._state = initialState;
  }

  get id(): string {
    return this._id;
  }

  get version(): number {
    return this._version;
  }

  get state(): TState {
    return this._state;
  }

  get pendingEvents(): Event[] {
    return [...this._pendingEvents];
  }

  /** Apply an event to the aggregate — updates state and increments version */
  protected applyEvent<TPayload>(
    type: string,
    payload: TPayload,
    source = "system"
  ): Event<TPayload> {
    this._version++;
    const event: Event<TPayload> = {
      type,
      payload,
      timestamp: new Date().toISOString(),
      source,
      aggregateId: this._id,
      aggregateType: this._type,
      aggregateVersion: this._version,
    };
    this._pendingEvents.push(event as unknown as Event);
    this._state = this.apply(this._state, event as unknown as Event);
    return event;
  }

  /** Subclasses implement this to fold an event into current state */
  protected abstract apply(state: TState, event: Event): TState;

  /** Replay a list of historical events to rebuild state */
  replayEvents(events: Event[]): void {
    for (const event of events) {
      this._state = this.apply(this._state, event);
      this._version = event.aggregateVersion ?? this._version + 1;
    }
  }

  /** Restore state from a snapshot, then replay any newer events */
  restoreFromSnapshot(snapshot: Snapshot<TState>, events: Event[]): void {
    this._state = snapshot.state;
    this._version = snapshot.version;
    this.replayEvents(events);
  }

  /** Mark pending events as committed (e.g. after persisting to store) */
  clearPendingEvents(): void {
    this._pendingEvents = [];
  }

  /** Create a snapshot of current state */
  createSnapshot(): Snapshot<TState> {
    return {
      aggregateId: this._id,
      aggregateType: this._type,
      version: this._version,
      state: this._state,
      timestamp: new Date().toISOString(),
    };
  }
}

// ─── Repository for loading/saving aggregates ─────────────────────────────────

export class AggregateRepository<TState, TAggregate extends EventSourcedEntity<TState>> {
  constructor(
    private store: InMemoryEventStore,
    private factory: (id: string) => TAggregate
  ) {}

  async load(id: string): Promise<TAggregate> {
    const aggregate = this.factory(id);
    const snapshot = this.store.getSnapshot<TState>(id);
    const fromSequence = snapshot?.version;

    const page = await this.store.query({
      aggregateId: id,
      fromSequence,
    });

    const events = page.events.sort(
      (a, b) => (a.aggregateVersion ?? 0) - (b.aggregateVersion ?? 0)
    );

    if (snapshot) {
      aggregate.restoreFromSnapshot(snapshot, events as Event[]);
    } else {
      aggregate.replayEvents(events as Event[]);
    }

    return aggregate;
  }

  async save(aggregate: TAggregate): Promise<void> {
    for (const event of aggregate.pendingEvents) {
      await this.store.append(event);
    }
    aggregate.clearPendingEvents();
  }
}

// ─── Node state and aggregate ─────────────────────────────────────────────────

export interface NodeState {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  deleted: boolean;
  version: number;
}

const NODE_INITIAL_STATE: NodeState = {
  id: "",
  type: "",
  properties: {},
  deleted: false,
  version: 0,
};

export class NodeAggregate extends EventSourcedEntity<NodeState> {
  constructor(id: string) {
    super(id, "Node", { ...NODE_INITIAL_STATE, id });
  }

  // ─── Commands ───────────────────────────────────────────────────────────────

  create(
    type: string,
    properties: Record<string, unknown> = {},
    source = "system"
  ): Event<NodeCreatedPayload> {
    if (this._state.type !== "") {
      throw new Error(`Node ${this._id} already exists`);
    }
    return this.applyEvent<NodeCreatedPayload>(
      "node:created",
      { nodeId: this._id, type, properties },
      source
    );
  }

  update(
    changes: Record<string, unknown>,
    source = "system"
  ): Event<NodeUpdatedPayload> {
    if (this._state.deleted) {
      throw new Error(`Node ${this._id} has been deleted`);
    }
    return this.applyEvent<NodeUpdatedPayload>(
      "node:updated",
      { nodeId: this._id, changes },
      source
    );
  }

  delete(source = "system"): Event<NodeDeletedPayload> {
    if (this._state.deleted) {
      throw new Error(`Node ${this._id} is already deleted`);
    }
    return this.applyEvent<NodeDeletedPayload>(
      "node:deleted",
      { nodeId: this._id },
      source
    );
  }

  // ─── State reducer ──────────────────────────────────────────────────────────

  protected apply(state: NodeState, event: Event): NodeState {
    switch (event.type) {
      case "node:created": {
        const payload = event.payload as NodeCreatedPayload;
        return {
          ...state,
          id: payload.nodeId,
          type: payload.type,
          properties: { ...payload.properties },
          deleted: false,
          version: event.aggregateVersion ?? state.version + 1,
        };
      }
      case "node:updated": {
        const payload = event.payload as NodeUpdatedPayload;
        return {
          ...state,
          properties: { ...state.properties, ...payload.changes },
          version: event.aggregateVersion ?? state.version + 1,
        };
      }
      case "node:deleted": {
        return {
          ...state,
          deleted: true,
          version: event.aggregateVersion ?? state.version + 1,
        };
      }
      default:
        return state;
    }
  }
}

// ─── Edge state and aggregate ─────────────────────────────────────────────────

export interface EdgeState {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
  deleted: boolean;
  version: number;
}

const EDGE_INITIAL_STATE: EdgeState = {
  id: "",
  source: "",
  target: "",
  type: "",
  properties: {},
  deleted: false,
  version: 0,
};

export class EdgeAggregate extends EventSourcedEntity<EdgeState> {
  constructor(id: string) {
    super(id, "Edge", { ...EDGE_INITIAL_STATE, id });
  }

  create(
    source: string,
    target: string,
    type: string,
    properties: Record<string, unknown> = {},
    emitSource = "system"
  ): Event<EdgeCreatedPayload> {
    if (this._state.source !== "") {
      throw new Error(`Edge ${this._id} already exists`);
    }
    return this.applyEvent<EdgeCreatedPayload>(
      "edge:created",
      { edgeId: this._id, source, target, type, properties },
      emitSource
    );
  }

  delete(emitSource = "system"): Event<EdgeDeletedPayload> {
    if (this._state.deleted) {
      throw new Error(`Edge ${this._id} is already deleted`);
    }
    return this.applyEvent<EdgeDeletedPayload>(
      "edge:deleted",
      { edgeId: this._id },
      emitSource
    );
  }

  protected apply(state: EdgeState, event: Event): EdgeState {
    switch (event.type) {
      case "edge:created": {
        const payload = event.payload as EdgeCreatedPayload;
        return {
          ...state,
          id: payload.edgeId,
          source: payload.source,
          target: payload.target,
          type: payload.type,
          properties: { ...(payload.properties ?? {}) },
          deleted: false,
          version: event.aggregateVersion ?? state.version + 1,
        };
      }
      case "edge:deleted": {
        return {
          ...state,
          deleted: true,
          version: event.aggregateVersion ?? state.version + 1,
        };
      }
      default:
        return state;
    }
  }
}
