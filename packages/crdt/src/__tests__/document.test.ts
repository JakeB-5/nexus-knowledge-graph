import { describe, it, expect, beforeEach } from "vitest";
import { CRDTDocument } from "../document.js";

// ── Factory helpers ────────────────────────────────────────────────────────

function makeDoc(nodeId: string, id = "doc-1"): CRDTDocument {
  return new CRDTDocument(nodeId, id);
}

// ── Basic document operations ──────────────────────────────────────────────

describe("CRDTDocument - basic operations", () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    doc = makeDoc("nodeA");
  });

  it("has undefined title initially", () => {
    expect(doc.title).toBeUndefined();
  });

  it("setTitle stores the title", () => {
    doc.setTitle("My Document");
    expect(doc.title).toBe("My Document");
  });

  it("setTitle updates to latest value", () => {
    doc.setTitle("First");
    doc.setTitle("Second");
    expect(doc.title).toBe("Second");
  });

  it("content starts empty", () => {
    expect(doc.content).toBe("");
  });

  it("insertText appends characters", () => {
    doc.insertText(0, "Hello");
    expect(doc.content).toBe("Hello");
  });

  it("insertText at middle inserts correctly", () => {
    doc.insertText(0, "Hllo");
    doc.insertText(1, "e");
    expect(doc.content).toBe("Hello");
  });

  it("deleteText removes characters", () => {
    doc.insertText(0, "Hello World");
    doc.deleteText(5, 6); // delete " World"
    expect(doc.content).toBe("Hello");
  });

  it("metadata set and get", () => {
    doc.setMetadata("author", "Alice");
    doc.setMetadata("version", 42);
    expect(doc.getMetadata("author")).toBe("Alice");
    expect(doc.getMetadata("version")).toBe(42);
  });

  it("metadata delete removes key", () => {
    doc.setMetadata("key", "value");
    doc.deleteMetadata("key");
    expect(doc.getMetadata("key")).toBeUndefined();
  });

  it("allMetadata returns only live keys", () => {
    doc.setMetadata("a", 1);
    doc.setMetadata("b", 2);
    doc.deleteMetadata("a");
    const meta = doc.allMetadata();
    expect(Object.keys(meta)).toEqual(["b"]);
  });

  it("addTag and hasTag", () => {
    doc.addTag("typescript");
    doc.addTag("crdt");
    expect(doc.hasTag("typescript")).toBe(true);
    expect(doc.hasTag("crdt")).toBe(true);
    expect(doc.hasTag("unknown")).toBe(false);
  });

  it("removeTag removes a tag", () => {
    doc.addTag("tag1");
    doc.removeTag("tag1");
    expect(doc.hasTag("tag1")).toBe(false);
  });

  it("tags returns all live tags", () => {
    doc.addTag("a");
    doc.addTag("b");
    doc.addTag("c");
    doc.removeTag("b");
    expect(doc.tags.sort()).toEqual(["a", "c"]);
  });

  it("version increments on each operation", () => {
    const v0 = doc.version;
    doc.setTitle("T");
    expect(doc.version).toBeGreaterThan(v0);
    doc.insertText(0, "x");
    expect(doc.version).toBeGreaterThan(v0 + 1);
  });

  it("operationLog records all operations", () => {
    doc.setTitle("T");
    doc.insertText(0, "ab");
    doc.addTag("tag");
    // title + 2 chars + tag = at least 4 ops
    expect(doc.operationLog.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Merge behaviour ────────────────────────────────────────────────────────

describe("CRDTDocument - merge", () => {
  it("merges title with LWW semantics", () => {
    const a = makeDoc("nodeA");
    const b = makeDoc("nodeB");

    a.setTitle("From A");
    b.setTitle("From B");

    // Both titles set; merge should pick one deterministically
    a.merge(b);
    b.merge(a);

    // Convergence: both should have the same title
    expect(a.title).toBe(b.title);
  });

  it("merges content from two nodes", () => {
    const a = makeDoc("nodeA");
    const b = makeDoc("nodeB");

    a.insertText(0, "Hello");
    b.insertText(0, "World");

    a.merge(b);
    b.merge(a);

    // Both converge to same text
    expect(a.content).toBe(b.content);
    expect(a.content.length).toBe(10);
  });

  it("merges tags with OR-Set add-wins", () => {
    const a = makeDoc("nodeA");
    const b = makeDoc("nodeB");

    a.addTag("shared");
    b.merge(a); // b sees "shared"
    b.removeTag("shared");

    // Concurrent: a also adds "shared" again
    a.addTag("shared");

    // After merge, a's new add wins
    b.merge(a);
    expect(b.hasTag("shared")).toBe(true);
  });

  it("merges metadata per-key with LWW", () => {
    const a = makeDoc("nodeA");
    const b = makeDoc("nodeB");

    a.setMetadata("x", 1);
    b.setMetadata("y", 2);
    b.setMetadata("x", 99);

    a.merge(b);
    // a gets b's unique key
    expect(a.getMetadata("y")).toBe(2);
    // For "x", the later write wins (b wrote 99, but order depends on HLC)
    expect(a.getMetadata("x")).toBeDefined();
  });

  it("merge is convergent (all replicas reach same state)", () => {
    const a = makeDoc("nodeA");
    const b = makeDoc("nodeB");
    const c = makeDoc("nodeC");

    a.setTitle("Doc");
    a.insertText(0, "Hello");
    b.addTag("important");
    c.setMetadata("created", "2024");

    // Full merge
    a.merge(b);
    a.merge(c);
    b.merge(a);
    b.merge(c);
    c.merge(a);
    c.merge(b);

    expect(a.title).toBe(b.title);
    expect(b.title).toBe(c.title);
    expect(a.content).toBe(b.content);
    expect(b.content).toBe(c.content);
    expect(a.hasTag("important")).toBe(b.hasTag("important"));
  });
});

// ── Snapshot & restore ─────────────────────────────────────────────────────

describe("CRDTDocument - snapshot and restore", () => {
  it("snapshot captures current state", () => {
    const doc = makeDoc("nodeA");
    doc.setTitle("Test");
    doc.insertText(0, "Hello");
    doc.addTag("tag1");

    const snap = doc.snapshot();
    expect(snap.state.title.value).toBe("Test");
    expect(snap.snapshotVersion).toBe(doc.version);
  });

  it("restoreSnapshot restores all sub-CRDTs", () => {
    const doc = makeDoc("nodeA");
    doc.setTitle("Original");
    doc.insertText(0, "content");
    doc.addTag("tag");
    doc.setMetadata("key", "value");

    const snap = doc.snapshot();

    const doc2 = makeDoc("nodeB", "doc-1");
    doc2.restoreSnapshot(snap);

    expect(doc2.title).toBe("Original");
    expect(doc2.content).toBe("content");
    expect(doc2.hasTag("tag")).toBe(true);
    expect(doc2.getMetadata("key")).toBe("value");
  });

  it("fromSnapshot factory works", () => {
    const doc = makeDoc("nodeA");
    doc.setTitle("Snap Test");
    doc.insertText(0, "abc");

    const snap = doc.snapshot();
    const restored = CRDTDocument.fromSnapshot("nodeB", snap);

    expect(restored.title).toBe("Snap Test");
    expect(restored.content).toBe("abc");
  });

  it("getState / fromState round-trip", () => {
    const doc = makeDoc("nodeA");
    doc.setTitle("State Test");
    doc.insertText(0, "hello world");

    const state = doc.getState();
    const restored = CRDTDocument.fromState("nodeB", state);

    expect(restored.title).toBe("State Test");
    expect(restored.content).toBe("hello world");
    expect(restored.id).toBe(doc.id);
  });
});

// ── Delta operations ───────────────────────────────────────────────────────

describe("CRDTDocument - delta generation", () => {
  it("operationsSince returns ops after given version", () => {
    const doc = makeDoc("nodeA");
    const v0 = doc.version;

    doc.setTitle("T");
    doc.insertText(0, "ab");

    const ops = doc.operationsSince(v0);
    expect(ops.length).toBeGreaterThan(0);
  });

  it("applyOperation applies a remote operation", () => {
    const a = makeDoc("nodeA");
    const b = makeDoc("nodeB", a.id);

    a.setTitle("Hello");
    const ops = a.operationLog;

    for (const op of ops) {
      b.applyOperation(op);
    }

    expect(b.title).toBe("Hello");
  });

  it("applyOperation is idempotent for set-title", () => {
    const a = makeDoc("nodeA");
    const b = makeDoc("nodeB", a.id);

    a.setTitle("Idempotent");
    const ops = a.operationLog;

    for (const op of ops) {
      b.applyOperation(op);
    }
    // Apply again
    for (const op of ops) {
      b.applyOperation(op);
    }

    expect(b.title).toBe("Idempotent");
  });

  it("summary returns human-readable info", () => {
    const doc = makeDoc("nodeA");
    doc.setTitle("Summary Test");
    doc.insertText(0, "xyz");

    const summary = doc.summary() as Record<string, unknown>;
    expect(summary["title"]).toBe("Summary Test");
    expect(summary["contentLength"]).toBe(3);
  });
});
