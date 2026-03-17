// CRDTDocument: composite CRDT combining RGA, LWWRegister, LWWMap, and ORSet
//
// A document has:
//   - title:    LWWRegister<string>    (last writer wins)
//   - content:  RGA<string>            (collaborative text)
//   - metadata: LWWMap<unknown>        (arbitrary key-value pairs)
//   - tags:     ORSet<string>          (add/remove with concurrent-add-wins)
//
// Operations are logged so that deltas can be sent to peers.

import type {
  NodeId,
  DocumentState,
  DocumentSnapshot,
  Operation,
  HLCTimestamp,
  RGAId,
  SetTitleOperation,
  RGAInsertOperation,
  RGADeleteOperation,
  SetMetadataOperation,
  DeleteMetadataOperation,
  AddTagOperation,
  RemoveTagOperation,
} from "./types.js";

import { LWWRegister } from "./lww-register.js";
import { LWWMap } from "./lww-map.js";
import { ORSet } from "./or-set.js";
import { RGA } from "./rga.js";
import { createHLC, tickHLC, updateHLC } from "./clock.js";

function uuid(): string {
  // Simple deterministic-ish id; replace with crypto.randomUUID() where available
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export class CRDTDocument {
  readonly id: string;
  private readonly nodeId: NodeId;

  private _title: LWWRegister<string>;
  private _content: RGA<string>;
  private _metadata: LWWMap<unknown>;
  private _tags: ORSet<string>;

  private _version: number;
  private _operationLog: Operation[];
  private _hlc: HLCTimestamp;

  constructor(nodeId: NodeId, id?: string, initial?: DocumentState) {
    this.nodeId = nodeId;
    this.id = id ?? uuid();
    this._hlc = createHLC(nodeId);

    if (initial) {
      this._title = LWWRegister.fromState<string>(nodeId, initial.title);
      this._content = RGA.fromState<string>(nodeId, initial.content);
      this._metadata = LWWMap.fromState<unknown>(nodeId, initial.metadata);
      this._tags = ORSet.fromState<string>(nodeId, initial.tags);
      this._version = initial.version;
      if (initial.lastModified) {
        this._hlc = updateHLC(this._hlc, initial.lastModified);
      }
    } else {
      this._title = new LWWRegister<string>(nodeId);
      this._content = new RGA<string>(nodeId);
      this._metadata = new LWWMap<unknown>(nodeId);
      this._tags = new ORSet<string>(nodeId);
      this._version = 0;
    }
    this._operationLog = [];
  }

  // ── Clock helpers ──────────────────────────────────────────────────────────

  private tick(): HLCTimestamp {
    this._hlc = tickHLC(this._hlc);
    return this._hlc;
  }

  private bumpVersion(): void {
    this._version++;
  }

  // ── Title operations ───────────────────────────────────────────────────────

  setTitle(value: string): void {
    const ts = this.tick();
    this._title.setWithTimestamp(value, ts);
    this.bumpVersion();

    const op: SetTitleOperation = {
      id: uuid(),
      type: "set-title",
      nodeId: this.nodeId,
      timestamp: ts,
      value,
    };
    this._operationLog.push(op);
  }

  get title(): string | undefined {
    return this._title.get();
  }

  // ── Content (RGA text) operations ─────────────────────────────────────────

  /**
   * Insert text at a visible index. Returns the IDs of inserted nodes.
   */
  insertText(index: number, text: string): RGAId[] {
    const ts = this.tick();
    const afterId = this._content.idAtVisibleIndex(index - 1);
    const ids: RGAId[] = [];
    let prevId = afterId;

    for (const ch of text) {
      const id = this._content.insert(ch, prevId);
      ids.push(id);
      prevId = id;

      const op: RGAInsertOperation = {
        id: uuid(),
        type: "rga-insert",
        nodeId: this.nodeId,
        timestamp: ts,
        rgaId: id,
        value: ch,
        afterId: prevId === id ? afterId : ids[ids.indexOf(id) - 1] ?? afterId,
      };
      this._operationLog.push(op);
    }

    this.bumpVersion();
    return ids;
  }

  /**
   * Delete `count` characters starting at visible `index`.
   */
  deleteText(index: number, count = 1): RGAId[] {
    const ts = this.tick();
    const deleted = this._content.deleteRange(index, index + count);
    this.bumpVersion();

    for (const rgaId of deleted) {
      const op: RGADeleteOperation = {
        id: uuid(),
        type: "rga-delete",
        nodeId: this.nodeId,
        timestamp: ts,
        rgaId,
      };
      this._operationLog.push(op);
    }

    return deleted;
  }

  get content(): string {
    return this._content.toString();
  }

  get contentRGA(): RGA<string> {
    return this._content;
  }

  // ── Metadata operations ────────────────────────────────────────────────────

  setMetadata(key: string, value: unknown): void {
    const ts = this.tick();
    this._metadata.set(key, value);
    this.bumpVersion();

    const op: SetMetadataOperation = {
      id: uuid(),
      type: "set-metadata",
      nodeId: this.nodeId,
      timestamp: ts,
      key,
      value,
    };
    this._operationLog.push(op);
  }

  deleteMetadata(key: string): void {
    const ts = this.tick();
    this._metadata.delete(key);
    this.bumpVersion();

    const op: DeleteMetadataOperation = {
      id: uuid(),
      type: "delete-metadata",
      nodeId: this.nodeId,
      timestamp: ts,
      key,
    };
    this._operationLog.push(op);
  }

  getMetadata(key: string): unknown {
    return this._metadata.get(key);
  }

  allMetadata(): Record<string, unknown> {
    return this._metadata.toObject();
  }

  // ── Tag operations ─────────────────────────────────────────────────────────

  addTag(tag: string): void {
    const ts = this.tick();
    const addTag = this._tags.add(tag);
    this.bumpVersion();

    const op: AddTagOperation = {
      id: uuid(),
      type: "add-tag",
      nodeId: this.nodeId,
      timestamp: ts,
      tag,
      addTag,
    };
    this._operationLog.push(op);
  }

  removeTag(tag: string): void {
    const ts = this.tick();
    this._tags.remove(tag);
    this.bumpVersion();

    const op: RemoveTagOperation = {
      id: uuid(),
      type: "remove-tag",
      nodeId: this.nodeId,
      timestamp: ts,
      tag,
    };
    this._operationLog.push(op);
  }

  hasTag(tag: string): boolean {
    return this._tags.has(tag);
  }

  get tags(): string[] {
    return this._tags.values();
  }

  // ── CRDT merge ─────────────────────────────────────────────────────────────

  /**
   * Merge a remote document state into this document.
   * All sub-CRDTs are merged independently.
   */
  merge(remote: CRDTDocument): void {
    this.mergeState(remote.getState());
  }

  mergeState(remote: DocumentState): void {
    if (remote.lastModified) {
      this._hlc = updateHLC(this._hlc, remote.lastModified);
    }

    this._title.mergeState(remote.title);
    this._content.mergeState(remote.content);
    this._metadata.mergeState(remote.metadata);
    this._tags.mergeState(remote.tags);

    this._version = Math.max(this._version, remote.version);
    this.bumpVersion();
  }

  /**
   * Apply a single operation from a remote node.
   */
  applyOperation(op: Operation): void {
    this._hlc = updateHLC(this._hlc, op.timestamp);

    switch (op.type) {
      case "set-title":
        this._title.setWithTimestamp(op.value, op.timestamp);
        break;

      case "rga-insert":
        this._content.applyInsert({
          id: op.rgaId,
          value: op.value,
          deleted: false,
          originId: op.afterId,
        });
        break;

      case "rga-delete":
        this._content.applyDelete(op.rgaId);
        break;

      case "set-metadata":
        this._metadata.set(op.key, op.value);
        break;

      case "delete-metadata":
        this._metadata.delete(op.key);
        break;

      case "add-tag":
        this._tags.addWithTag(op.tag, op.addTag);
        break;

      case "remove-tag": {
        // For operation-based replication we need to know which tags were
        // observed at remove time. The operation only carries the element;
        // when applying remotely, we remove all tags we currently know about.
        this._tags.remove(op.tag);
        break;
      }
    }

    this.bumpVersion();
    this._operationLog.push(op);
  }

  // ── Snapshot / restore ─────────────────────────────────────────────────────

  /**
   * Return the full serialisable state of this document.
   */
  getState(): DocumentState {
    return {
      id: this.id,
      title: this._title.getState(),
      content: this._content.getState(),
      metadata: this._metadata.getState(),
      tags: this._tags.getState(),
      version: this._version,
      lastModified: this._hlc,
    };
  }

  /**
   * Create a snapshot (state + operation log up to this point).
   */
  snapshot(): DocumentSnapshot {
    return {
      state: this.getState(),
      operations: [...this._operationLog],
      snapshotVersion: this._version,
    };
  }

  /**
   * Restore from a snapshot. Replaces all internal state.
   */
  restoreSnapshot(snap: DocumentSnapshot): void {
    const state = snap.state;
    this._title = LWWRegister.fromState<string>(this.nodeId, state.title);
    this._content = RGA.fromState<string>(this.nodeId, state.content);
    this._metadata = LWWMap.fromState<unknown>(this.nodeId, state.metadata);
    this._tags = ORSet.fromState<string>(this.nodeId, state.tags);
    this._version = state.version;
    this._operationLog = [...snap.operations];
    if (state.lastModified) {
      this._hlc = updateHLC(this._hlc, state.lastModified);
    }
  }

  // ── Delta generation ───────────────────────────────────────────────────────

  /**
   * Return all operations since `sinceVersion`.
   * These can be sent to a peer that has the document at `sinceVersion`.
   */
  operationsSince(sinceVersion: number): Operation[] {
    // The operation log grows monotonically; since we bump version for each
    // operation, we can approximate by slicing from the back.
    // In a production system the log would be indexed by version.
    const totalOps = this._operationLog.length;
    const opsToSkip = Math.max(0, totalOps - (this._version - sinceVersion));
    return this._operationLog.slice(opsToSkip);
  }

  /**
   * Return the full operation log.
   */
  get operationLog(): readonly Operation[] {
    return this._operationLog;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  get version(): number {
    return this._version;
  }

  get lastModified(): HLCTimestamp | undefined {
    return this._hlc;
  }

  /**
   * Human-readable summary.
   */
  summary(): object {
    return {
      id: this.id,
      title: this.title,
      contentLength: this.content.length,
      tags: this.tags,
      metadataKeys: this._metadata.keys(),
      version: this._version,
    };
  }

  toJSON(): object {
    return this.summary();
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static fromState(nodeId: NodeId, state: DocumentState): CRDTDocument {
    return new CRDTDocument(nodeId, state.id, state);
  }

  static fromSnapshot(nodeId: NodeId, snap: DocumentSnapshot): CRDTDocument {
    const doc = CRDTDocument.fromState(nodeId, snap.state);
    doc._operationLog = [...snap.operations];
    return doc;
  }
}
