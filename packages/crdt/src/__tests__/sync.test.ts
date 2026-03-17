import { describe, it, expect, beforeEach } from "vitest";
import { SyncProtocol } from "../sync.js";
import { CRDTDocument } from "../document.js";
import type { AnySyncMessage } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDocAndProtocol(nodeId: string, docId = "shared-doc") {
  const doc = new CRDTDocument(nodeId, docId);
  const proto = new SyncProtocol(nodeId);
  return { doc, proto };
}

/**
 * Deliver all messages from sender's outbox into receiver, then
 * deliver receiver's responses back to sender. Single round-trip.
 */
function deliverOnce(
  fromProto: SyncProtocol,
  fromDoc: CRDTDocument,
  toProto: SyncProtocol,
  toDoc: CRDTDocument
): void {
  const msgs = fromProto.drainOutbox();
  for (const msg of msgs) {
    toProto.receive(toDoc, msg);
  }
  const responses = toProto.drainOutbox();
  for (const msg of responses) {
    fromProto.receive(fromDoc, msg);
  }
  fromProto.drainOutbox(); // drain any leftover ACKs
}

/**
 * Full bidirectional sync: both sides send state to each other.
 */
function fullSync(
  aProto: SyncProtocol,
  aDoc: CRDTDocument,
  bProto: SyncProtocol,
  bDoc: CRDTDocument
): void {
  SyncProtocol.simulateSync(aProto, aDoc, bProto, bDoc);
}

// ── Peer management ────────────────────────────────────────────────────────

describe("SyncProtocol - peer management", () => {
  it("adds peers", () => {
    const proto = new SyncProtocol("nodeA");
    proto.addPeer("nodeB");
    const status = proto.peerStatus("nodeB");
    expect(status).toBeDefined();
    expect(status?.nodeId).toBe("nodeB");
  });

  it("removes peers", () => {
    const proto = new SyncProtocol("nodeA");
    proto.addPeer("nodeB");
    proto.removePeer("nodeB");
    expect(proto.peerStatus("nodeB")).toBeUndefined();
  });

  it("connects and disconnects peers", () => {
    const proto = new SyncProtocol("nodeA");
    proto.addPeer("nodeB");

    proto.connectPeer("nodeB");
    expect(proto.peerStatus("nodeB")?.isConnected).toBe(true);

    proto.disconnectPeer("nodeB");
    expect(proto.peerStatus("nodeB")?.isConnected).toBe(false);
  });

  it("allPeerStatuses returns all peers", () => {
    const proto = new SyncProtocol("nodeA");
    proto.addPeer("nodeB");
    proto.addPeer("nodeC");
    expect(proto.allPeerStatuses().length).toBe(2);
  });

  it("localNodeId returns own node id", () => {
    const proto = new SyncProtocol("nodeX");
    expect(proto.localNodeId).toBe("nodeX");
  });
});

// ── State sync ─────────────────────────────────────────────────────────────

describe("SyncProtocol - state sync", () => {
  it("state sync message is generated and placed in outbox", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    aDoc.setTitle("Hello");

    aProto.initiateStateSync(aDoc, "nodeB");
    const msgs = aProto.drainOutbox();

    expect(msgs.length).toBe(1);
    expect(msgs[0]?.type).toBe("state-sync");
    expect((msgs[0] as { type: string; fromNode: string }).fromNode).toBe("nodeA");
  });

  it("receiving a state sync message merges and sends ACK", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    const { doc: bDoc, proto: bProto } = makeDocAndProtocol("nodeB");

    aDoc.setTitle("Synced Title");

    aProto.initiateStateSync(aDoc, "nodeB");
    const msgs = aProto.drainOutbox();

    for (const msg of msgs) {
      bProto.receive(bDoc, msg);
    }

    // B should now have A's title
    expect(bDoc.title).toBe("Synced Title");

    // B should have queued an ACK
    const bResponses = bProto.drainOutbox();
    const acks = bResponses.filter((m) => m.type === "ack");
    expect(acks.length).toBeGreaterThan(0);
  });

  it("simulateSync converges two documents", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    const { doc: bDoc, proto: bProto } = makeDocAndProtocol("nodeB");

    aDoc.setTitle("Shared Title");
    aDoc.insertText(0, "Hello from A");
    bDoc.insertText(0, "Hello from B");
    bDoc.addTag("draft");

    fullSync(aProto, aDoc, bProto, bDoc);
    // Then reverse direction
    fullSync(bProto, bDoc, aProto, aDoc);

    // Both should have converged
    expect(aDoc.content.length).toBe(bDoc.content.length);
    expect(aDoc.title).toBe(bDoc.title);
  });

  it("state sync is idempotent", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    const { doc: bDoc, proto: bProto } = makeDocAndProtocol("nodeB");

    aDoc.setTitle("Test");
    aDoc.insertText(0, "content");

    // Sync twice
    fullSync(aProto, aDoc, bProto, bDoc);
    const textAfterFirst = bDoc.content;

    fullSync(aProto, aDoc, bProto, bDoc);
    const textAfterSecond = bDoc.content;

    expect(textAfterFirst).toBe(textAfterSecond);
  });
});

// ── Delta sync ─────────────────────────────────────────────────────────────

describe("SyncProtocol - delta sync", () => {
  it("delta sync sends only new operations", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    const { doc: bDoc, proto: bProto } = makeDocAndProtocol("nodeB");

    // First full sync
    aDoc.setTitle("Initial");
    fullSync(aProto, aDoc, bProto, bDoc);

    // A makes more changes
    aDoc.insertText(0, "new content");
    aDoc.addTag("updated");

    // Delta sync
    aProto.initiateDeltaSync(aDoc, "nodeB");
    const msgs = aProto.drainOutbox();

    expect(msgs.length).toBeGreaterThan(0);
    const deltaMsg = msgs.find((m) => m.type === "delta-sync");
    expect(deltaMsg).toBeDefined();
  });

  it("receiving delta sync applies operations and ACKs", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    const { doc: bDoc, proto: bProto } = makeDocAndProtocol("nodeB");

    aDoc.setTitle("Title");
    fullSync(aProto, aDoc, bProto, bDoc);

    // A makes new changes
    aDoc.insertText(0, "delta");

    // Delta sync to B
    aProto.initiateDeltaSync(aDoc, "nodeB");
    const msgs = aProto.drainOutbox();
    for (const msg of msgs) {
      bProto.receive(bDoc, msg);
    }

    expect(bDoc.content).toContain("delta");

    // B should ACK
    const responses = bProto.drainOutbox();
    const acks = responses.filter((m) => m.type === "ack");
    expect(acks.length).toBeGreaterThan(0);
  });

  it("delta sync with no changes sends nothing", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    const { doc: bDoc, proto: bProto } = makeDocAndProtocol("nodeB");

    // Set peer as known so it has lastAckedVersion = current
    aProto.addPeer("nodeB");
    // Simulate peer has seen all versions
    fullSync(aProto, aDoc, bProto, bDoc);
    aProto.drainOutbox();

    // No new changes → delta should be empty
    aProto.initiateDeltaSync(aDoc, "nodeB");
    const msgs = aProto.drainOutbox();
    // Either no messages or no delta-sync messages
    const deltaMessages = msgs.filter((m) => m.type === "delta-sync");
    expect(deltaMessages.length).toBe(0);
  });
});

// ── Request messages ───────────────────────────────────────────────────────

describe("SyncProtocol - request messages", () => {
  it("requestState generates a request-state message", () => {
    const proto = new SyncProtocol("nodeA");
    proto.requestState("nodeB");
    const msgs = proto.drainOutbox();
    expect(msgs.length).toBe(1);
    expect(msgs[0]?.type).toBe("request-state");
  });

  it("requestDelta generates a request-delta message", () => {
    const proto = new SyncProtocol("nodeA");
    proto.requestDelta("nodeB", 5);
    const msgs = proto.drainOutbox();
    expect(msgs.length).toBe(1);
    expect(msgs[0]?.type).toBe("request-delta");
  });

  it("handleRequest for request-state triggers state sync response", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    const { doc: bDoc, proto: bProto } = makeDocAndProtocol("nodeB");

    aDoc.setTitle("Requested");

    // B requests state from A
    bProto.requestState("nodeA");
    const requestMsgs = bProto.drainOutbox();

    // A handles the request
    for (const msg of requestMsgs) {
      aProto.receive(aDoc, msg);
    }

    // A should have a state-sync in its outbox
    const aResponse = aProto.drainOutbox();
    const stateSyncs = aResponse.filter((m) => m.type === "state-sync");
    expect(stateSyncs.length).toBeGreaterThan(0);

    // B applies A's response
    for (const msg of stateSyncs) {
      bProto.receive(bDoc, msg);
    }
    expect(bDoc.title).toBe("Requested");
  });
});

// ── ACK tracking ───────────────────────────────────────────────────────────

describe("SyncProtocol - ACK and peer tracking", () => {
  it("receiving ACK updates peer lastSyncedVersion", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    const { doc: bDoc, proto: bProto } = makeDocAndProtocol("nodeB");

    aDoc.setTitle("Test");
    aProto.initiateStateSync(aDoc, "nodeB");
    const msgs = aProto.drainOutbox();

    for (const msg of msgs) {
      bProto.receive(bDoc, msg);
    }

    const acks = bProto.drainOutbox();
    for (const ack of acks) {
      aProto.receive(aDoc, ack);
    }

    const status = aProto.peerStatus("nodeB");
    expect(status?.lastSyncedVersion).toBeGreaterThan(0);
  });

  it("syncAll sends to all connected peers", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    aProto.addPeer("nodeB");
    aProto.addPeer("nodeC");
    aProto.connectPeer("nodeB");
    aProto.connectPeer("nodeC");

    aDoc.setTitle("Broadcast");

    const msgs = aProto.syncAll(aDoc);
    const stateSyncs = msgs.filter((m) => m.type === "state-sync");
    // One state-sync per connected peer (both are new peers with version 0)
    expect(stateSyncs.length).toBe(2);
  });

  it("syncAll skips disconnected peers", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    aProto.addPeer("nodeB");
    aProto.addPeer("nodeC");
    aProto.connectPeer("nodeB");
    // nodeC stays disconnected

    aDoc.setTitle("Partial");

    const msgs = aProto.syncAll(aDoc);
    const toNodeB = msgs.filter(
      (m) => (m as AnySyncMessage & { toNode: string }).toNode === "nodeB"
    );
    const toNodeC = msgs.filter(
      (m) => (m as AnySyncMessage & { toNode: string }).toNode === "nodeC"
    );

    expect(toNodeB.length).toBeGreaterThan(0);
    expect(toNodeC.length).toBe(0);
  });
});

// ── Three-node convergence scenario ───────────────────────────────────────

describe("SyncProtocol - three-node convergence", () => {
  it("three nodes converge after full sync", () => {
    const { doc: aDoc, proto: aProto } = makeDocAndProtocol("nodeA");
    const { doc: bDoc, proto: bProto } = makeDocAndProtocol("nodeB");
    const { doc: cDoc, proto: cProto } = makeDocAndProtocol("nodeC");

    // Each node makes independent changes
    aDoc.setTitle("Three Node Test");
    aDoc.insertText(0, "From A: hello");

    bDoc.addTag("from-b");
    bDoc.setMetadata("source", "nodeB");

    cDoc.insertText(0, "From C: world");

    // Sync: A → B
    fullSync(aProto, aDoc, bProto, bDoc);

    // Sync: B → C (B now has A+B state)
    fullSync(bProto, bDoc, cProto, cDoc);

    // Sync: A → C (C now has A+B+C, A gets C)
    fullSync(aProto, aDoc, cProto, cDoc);

    // Sync: B ← C (B gets C)
    fullSync(cProto, cDoc, bProto, bDoc);

    // All three should have the same title
    expect(aDoc.title).toBe(bDoc.title);
    expect(bDoc.title).toBe(cDoc.title);

    // All should have B's tag
    expect(aDoc.hasTag("from-b")).toBe(true);
    expect(cDoc.hasTag("from-b")).toBe(true);
  });
});
