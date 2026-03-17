// Core CRDT type definitions

// ── Node / replica identity ────────────────────────────────────────────────

export type NodeId = string;

// ── Clock types ────────────────────────────────────────────────────────────

export interface LamportTimestamp {
  readonly counter: number;
  readonly nodeId: NodeId;
}

export interface VectorClock {
  readonly clocks: Readonly<Record<NodeId, number>>;
}

export interface HLCTimestamp {
  /** Wall-clock milliseconds */
  readonly wallTime: number;
  /** Logical component (counter within same wall-time) */
  readonly logical: number;
  readonly nodeId: NodeId;
}

export type ClockComparison = "less" | "equal" | "greater" | "concurrent";

// ── G-Counter ─────────────────────────────────────────────────────────────

export interface GCounterState {
  readonly counters: Readonly<Record<NodeId, number>>;
}

// ── PN-Counter ────────────────────────────────────────────────────────────

export interface PNCounterState {
  readonly increments: GCounterState;
  readonly decrements: GCounterState;
}

// ── G-Set ─────────────────────────────────────────────────────────────────

export interface GSetState<T> {
  readonly elements: ReadonlySet<T>;
}

// ── OR-Set ────────────────────────────────────────────────────────────────

/** Each element is paired with a set of unique add-tags. */
export interface ORSetState<T> {
  /** Map from element (serialised) → set of add-tags still "alive" */
  readonly entries: Readonly<Record<string, ReadonlySet<string>>>;
  /** Original element values keyed by their serialised form */
  readonly values: Readonly<Record<string, T>>;
}

// ── LWW-Register ──────────────────────────────────────────────────────────

export interface LWWRegisterState<T> {
  readonly value: T | undefined;
  readonly timestamp: HLCTimestamp | undefined;
}

// ── LWW-Map ───────────────────────────────────────────────────────────────

export interface LWWMapState<T> {
  readonly registers: Readonly<Record<string, LWWRegisterState<T>>>;
}

// ── RGA (Replicated Growable Array) ───────────────────────────────────────

export interface RGAId {
  readonly counter: number;
  readonly nodeId: NodeId;
}

export interface RGANode<T> {
  readonly id: RGAId;
  readonly value: T;
  /** true when logically deleted (tombstone) */
  readonly deleted: boolean;
  /** id of the predecessor node; null means "insert at head" */
  readonly originId: RGAId | null;
}

export interface RGAState<T> {
  readonly nodes: readonly RGANode<T>[];
  readonly tombstones: ReadonlySet<string>; // serialised RGAId
}

export interface RichTextMarker {
  readonly type: "bold" | "italic" | "underline" | "code";
  readonly startIndex: number;
  readonly endIndex: number;
}

// ── Document ──────────────────────────────────────────────────────────────

export interface DocumentState {
  readonly id: string;
  readonly title: LWWRegisterState<string>;
  readonly content: RGAState<string>;
  readonly metadata: LWWMapState<unknown>;
  readonly tags: ORSetState<string>;
  readonly version: number;
  readonly lastModified: HLCTimestamp | undefined;
}

export interface DocumentSnapshot {
  readonly state: DocumentState;
  readonly operations: readonly Operation[];
  readonly snapshotVersion: number;
}

// ── Operation types ───────────────────────────────────────────────────────

export type OperationType =
  | "set-title"
  | "rga-insert"
  | "rga-delete"
  | "set-metadata"
  | "delete-metadata"
  | "add-tag"
  | "remove-tag";

export interface BaseOperation {
  readonly id: string;
  readonly type: OperationType;
  readonly nodeId: NodeId;
  readonly timestamp: HLCTimestamp;
}

export interface SetTitleOperation extends BaseOperation {
  readonly type: "set-title";
  readonly value: string;
}

export interface RGAInsertOperation extends BaseOperation {
  readonly type: "rga-insert";
  readonly rgaId: RGAId;
  readonly value: string;
  readonly afterId: RGAId | null;
}

export interface RGADeleteOperation extends BaseOperation {
  readonly type: "rga-delete";
  readonly rgaId: RGAId;
}

export interface SetMetadataOperation extends BaseOperation {
  readonly type: "set-metadata";
  readonly key: string;
  readonly value: unknown;
}

export interface DeleteMetadataOperation extends BaseOperation {
  readonly type: "delete-metadata";
  readonly key: string;
}

export interface AddTagOperation extends BaseOperation {
  readonly type: "add-tag";
  readonly tag: string;
  readonly addTag: string; // unique tag identifier
}

export interface RemoveTagOperation extends BaseOperation {
  readonly type: "remove-tag";
  readonly tag: string;
}

export type Operation =
  | SetTitleOperation
  | RGAInsertOperation
  | RGADeleteOperation
  | SetMetadataOperation
  | DeleteMetadataOperation
  | AddTagOperation
  | RemoveTagOperation;

// ── Sync ──────────────────────────────────────────────────────────────────

export type SyncMessageType =
  | "state-sync"
  | "delta-sync"
  | "ack"
  | "request-state"
  | "request-delta";

export interface SyncMessage {
  readonly id: string;
  readonly type: SyncMessageType;
  readonly fromNode: NodeId;
  readonly toNode: NodeId;
  readonly timestamp: HLCTimestamp;
}

export interface StateSyncMessage extends SyncMessage {
  readonly type: "state-sync";
  readonly state: DocumentState;
}

export interface DeltaSyncMessage extends SyncMessage {
  readonly type: "delta-sync";
  readonly operations: readonly Operation[];
  readonly fromVersion: number;
  readonly toVersion: number;
}

export interface AckMessage extends SyncMessage {
  readonly type: "ack";
  readonly ackedMessageId: string;
  readonly version: number;
}

export interface RequestStateMessage extends SyncMessage {
  readonly type: "request-state";
}

export interface RequestDeltaMessage extends SyncMessage {
  readonly type: "request-delta";
  readonly fromVersion: number;
}

export type AnySyncMessage =
  | StateSyncMessage
  | DeltaSyncMessage
  | AckMessage
  | RequestStateMessage
  | RequestDeltaMessage;

export type ConflictResolutionStrategy = "last-write-wins" | "merge" | "custom";

export interface SyncStatus {
  readonly nodeId: NodeId;
  readonly lastSyncedVersion: number;
  readonly pendingOperations: number;
  readonly isConnected: boolean;
  readonly lastSyncTime: number | undefined;
}
