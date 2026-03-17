// SyncProtocol: state-based and operation-based synchronisation
//
// Supports two sync strategies:
//   1. State sync   – send the full document state; peer merges it.
//   2. Delta sync   – send only operations since a known version.
//
// The SyncProtocol class manages per-peer sync state and generates / consumes
// sync messages.  It does NOT own a network layer; callers are responsible for
// transporting messages and calling the appropriate `receive*` methods.

import type {
  NodeId,
  AnySyncMessage,
  StateSyncMessage,
  DeltaSyncMessage,
  AckMessage,
  RequestStateMessage,
  RequestDeltaMessage,
  SyncStatus,
  HLCTimestamp,
  ConflictResolutionStrategy,
} from "./types.js";

import { CRDTDocument } from "./document.js";
import { createHLC, tickHLC, updateHLC } from "./clock.js";

function uuid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ── Per-peer tracking ──────────────────────────────────────────────────────

interface PeerState {
  nodeId: NodeId;
  lastAckedVersion: number;
  isConnected: boolean;
  lastSyncTime: number | undefined;
  pendingMessageIds: Set<string>;
}

// ── SyncProtocol ──────────────────────────────────────────────────────────

export class SyncProtocol {
  private readonly nodeId: NodeId;
  private hlc: HLCTimestamp;
  private peers: Map<NodeId, PeerState>;
  private readonly strategy: ConflictResolutionStrategy;

  // Outbound message queue – callers drain this after each operation
  private outbox: AnySyncMessage[];

  constructor(
    nodeId: NodeId,
    strategy: ConflictResolutionStrategy = "last-write-wins"
  ) {
    this.nodeId = nodeId;
    this.hlc = createHLC(nodeId);
    this.peers = new Map();
    this.strategy = strategy;
    this.outbox = [];
  }

  // ── Peer management ──────────────────────────────────────────────────────

  addPeer(peerId: NodeId): void {
    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, {
        nodeId: peerId,
        lastAckedVersion: 0,
        isConnected: false,
        lastSyncTime: undefined,
        pendingMessageIds: new Set(),
      });
    }
  }

  removePeer(peerId: NodeId): void {
    this.peers.delete(peerId);
  }

  connectPeer(peerId: NodeId): void {
    const peer = this.getPeer(peerId);
    peer.isConnected = true;
  }

  disconnectPeer(peerId: NodeId): void {
    const peer = this.peers.get(peerId);
    if (peer) peer.isConnected = false;
  }

  private getPeer(peerId: NodeId): PeerState {
    let peer = this.peers.get(peerId);
    if (!peer) {
      peer = {
        nodeId: peerId,
        lastAckedVersion: 0,
        isConnected: false,
        lastSyncTime: undefined,
        pendingMessageIds: new Set(),
      };
      this.peers.set(peerId, peer);
    }
    return peer;
  }

  // ── Outbox ────────────────────────────────────────────────────────────────

  /**
   * Drain all pending outbound messages. Call after initiating a sync.
   */
  drainOutbox(): AnySyncMessage[] {
    const msgs = [...this.outbox];
    this.outbox = [];
    return msgs;
  }

  private enqueue(msg: AnySyncMessage): void {
    this.outbox.push(msg);
  }

  // ── State-based sync ──────────────────────────────────────────────────────

  /**
   * Initiate a full state sync with a peer.
   * Generates a StateSyncMessage and places it in the outbox.
   */
  initiateStateSync(doc: CRDTDocument, toNode: NodeId): void {
    this.hlc = tickHLC(this.hlc);
    const msg: StateSyncMessage = {
      id: uuid(),
      type: "state-sync",
      fromNode: this.nodeId,
      toNode,
      timestamp: this.hlc,
      state: doc.getState(),
    };

    const peer = this.getPeer(toNode);
    peer.pendingMessageIds.add(msg.id);
    this.enqueue(msg);
  }

  /**
   * Receive and apply a state sync message from a peer.
   * Merges the remote state into `doc` and sends an ACK.
   */
  receiveStateSync(doc: CRDTDocument, msg: StateSyncMessage): void {
    this.hlc = updateHLC(this.hlc, msg.timestamp);

    // Merge the remote document state
    doc.mergeState(msg.state);

    // Acknowledge
    this.sendAck(msg.fromNode, msg.id, doc.version);
  }

  // ── Delta-based sync ──────────────────────────────────────────────────────

  /**
   * Send only operations since the peer's last known version.
   */
  initiateDeltaSync(doc: CRDTDocument, toNode: NodeId): void {
    const peer = this.getPeer(toNode);
    const fromVersion = peer.lastAckedVersion;

    const ops = doc.operationsSince(fromVersion);
    if (ops.length === 0) return; // Nothing to send

    this.hlc = tickHLC(this.hlc);
    const msg: DeltaSyncMessage = {
      id: uuid(),
      type: "delta-sync",
      fromNode: this.nodeId,
      toNode,
      timestamp: this.hlc,
      operations: ops,
      fromVersion,
      toVersion: doc.version,
    };

    peer.pendingMessageIds.add(msg.id);
    this.enqueue(msg);
  }

  /**
   * Receive and apply a delta sync message.
   */
  receiveDeltaSync(doc: CRDTDocument, msg: DeltaSyncMessage): void {
    this.hlc = updateHLC(this.hlc, msg.timestamp);

    // Apply operations in causal order (they arrive sorted by the sender)
    for (const op of msg.operations) {
      // Idempotency: skip if already applied (check via op id in log)
      const alreadyApplied = doc.operationLog.some((o) => o.id === op.id);
      if (!alreadyApplied) {
        doc.applyOperation(op);
      }
    }

    this.sendAck(msg.fromNode, msg.id, doc.version);
  }

  // ── Request messages ───────────────────────────────────────────────────────

  /**
   * Request a full state from a peer (e.g. on first connect or recovery).
   */
  requestState(toNode: NodeId): void {
    this.hlc = tickHLC(this.hlc);
    const msg: RequestStateMessage = {
      id: uuid(),
      type: "request-state",
      fromNode: this.nodeId,
      toNode,
      timestamp: this.hlc,
    };
    this.enqueue(msg);
  }

  /**
   * Request a delta from a known version.
   */
  requestDelta(toNode: NodeId, fromVersion: number): void {
    this.hlc = tickHLC(this.hlc);
    const msg: RequestDeltaMessage = {
      id: uuid(),
      type: "request-delta",
      fromNode: this.nodeId,
      toNode,
      timestamp: this.hlc,
      fromVersion,
    };
    this.enqueue(msg);
  }

  /**
   * Handle an incoming request from a peer.
   * Generates the appropriate sync response into the outbox.
   */
  handleRequest(doc: CRDTDocument, msg: RequestStateMessage | RequestDeltaMessage): void {
    this.hlc = updateHLC(this.hlc, msg.timestamp);

    if (msg.type === "request-state") {
      this.initiateStateSync(doc, msg.fromNode);
    } else {
      this.initiateDeltaSync(doc, msg.fromNode);
    }
  }

  // ── ACK handling ───────────────────────────────────────────────────────────

  private sendAck(toNode: NodeId, ackedMessageId: string, version: number): void {
    this.hlc = tickHLC(this.hlc);
    const ack: AckMessage = {
      id: uuid(),
      type: "ack",
      fromNode: this.nodeId,
      toNode,
      timestamp: this.hlc,
      ackedMessageId,
      version,
    };
    this.enqueue(ack);
  }

  receiveAck(msg: AckMessage): void {
    this.hlc = updateHLC(this.hlc, msg.timestamp);
    const peer = this.peers.get(msg.fromNode);
    if (!peer) return;

    peer.lastAckedVersion = Math.max(peer.lastAckedVersion, msg.version);
    peer.pendingMessageIds.delete(msg.ackedMessageId);
    peer.lastSyncTime = Date.now();
    peer.isConnected = true;
  }

  // ── Unified receive ────────────────────────────────────────────────────────

  /**
   * Dispatch any incoming message to the correct handler.
   */
  receive(doc: CRDTDocument, msg: AnySyncMessage): void {
    switch (msg.type) {
      case "state-sync":
        this.receiveStateSync(doc, msg);
        break;
      case "delta-sync":
        this.receiveDeltaSync(doc, msg);
        break;
      case "ack":
        this.receiveAck(msg);
        break;
      case "request-state":
      case "request-delta":
        this.handleRequest(doc, msg);
        break;
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  peerStatus(peerId: NodeId): SyncStatus | undefined {
    const peer = this.peers.get(peerId);
    if (!peer) return undefined;
    return {
      nodeId: peer.nodeId,
      lastSyncedVersion: peer.lastAckedVersion,
      pendingOperations: peer.pendingMessageIds.size,
      isConnected: peer.isConnected,
      lastSyncTime: peer.lastSyncTime,
    };
  }

  allPeerStatuses(): SyncStatus[] {
    return [...this.peers.values()].map((peer) => ({
      nodeId: peer.nodeId,
      lastSyncedVersion: peer.lastAckedVersion,
      pendingOperations: peer.pendingMessageIds.size,
      isConnected: peer.isConnected,
      lastSyncTime: peer.lastSyncTime,
    }));
  }

  get localNodeId(): NodeId {
    return this.nodeId;
  }

  // ── Conflict resolution ───────────────────────────────────────────────────

  /**
   * Apply a conflict resolution strategy when two values compete.
   * For LWW this is handled automatically by HLC timestamps.
   * For "merge" strategy, both values are kept (caller decides format).
   * For "custom" strategy, the caller provides a resolver function.
   */
  resolveConflict<T>(
    local: { value: T; timestamp: HLCTimestamp },
    remote: { value: T; timestamp: HLCTimestamp },
    customResolver?: (a: T, b: T) => T
  ): T {
    switch (this.strategy) {
      case "last-write-wins": {
        const { compareHLC } = require("./clock.js") as typeof import("./clock.js");
        return compareHLC(remote.timestamp, local.timestamp) === "greater"
          ? remote.value
          : local.value;
      }
      case "custom": {
        if (!customResolver) {
          throw new Error("Custom conflict resolution requires a resolver function");
        }
        return customResolver(local.value, remote.value);
      }
      case "merge":
      default:
        // For merge strategy with primitive values, default to LWW
        return local.value;
    }
  }

  // ── Sync session ──────────────────────────────────────────────────────────

  /**
   * Perform a full sync round with all connected peers.
   * Uses delta sync when possible, falls back to state sync for new peers.
   */
  syncAll(doc: CRDTDocument): AnySyncMessage[] {
    for (const peer of this.peers.values()) {
      if (!peer.isConnected) continue;

      if (peer.lastAckedVersion === 0) {
        // New peer: send full state
        this.initiateStateSync(doc, peer.nodeId);
      } else {
        // Known peer: send delta
        this.initiateDeltaSync(doc, peer.nodeId);
      }
    }
    return this.drainOutbox();
  }

  /**
   * Simulate a complete sync exchange between two protocols and documents.
   * Useful for testing without a network layer.
   */
  static simulateSync(
    aProtocol: SyncProtocol,
    aDoc: CRDTDocument,
    bProtocol: SyncProtocol,
    bDoc: CRDTDocument
  ): void {
    // A → B (state sync)
    aProtocol.initiateStateSync(aDoc, bProtocol.nodeId);
    const aMessages = aProtocol.drainOutbox();
    for (const msg of aMessages) {
      bProtocol.receive(bDoc, msg);
    }

    // B's responses back to A (ACKs + possibly a state sync of its own)
    const bMessages = bProtocol.drainOutbox();
    for (const msg of bMessages) {
      aProtocol.receive(aDoc, msg);
    }

    // A processes ACKs
    const aAcks = aProtocol.drainOutbox();
    for (const msg of aAcks) {
      bProtocol.receive(bDoc, msg);
    }
  }
}
