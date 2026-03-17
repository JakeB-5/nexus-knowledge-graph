import { BenchmarkRunner, type BenchmarkResult } from "./runner.js";

// ─── RGA (Replicated Growable Array) ─────────────────────────────────────────
// A simplified RGA for text CRDTs.

interface RGANode {
  id: string;       // unique id: "siteId:counter"
  char: string;
  deleted: boolean;
  prev: string | null; // id of the predecessor node
}

class RGADocument {
  private nodes: Map<string, RGANode> = new Map();
  private sequence: string[] = []; // ordered list of node ids (including deleted)
  private siteId: string;
  private counter: number = 0;

  constructor(siteId: string) {
    this.siteId = siteId;
    // sentinel head node
    const head: RGANode = { id: "head", char: "", deleted: true, prev: null };
    this.nodes.set("head", head);
    this.sequence = ["head"];
  }

  private nextId(): string {
    return `${this.siteId}:${++this.counter}`;
  }

  insert(afterId: string, char: string): RGANode {
    const id = this.nextId();
    const node: RGANode = { id, char, deleted: false, prev: afterId };
    this.nodes.set(id, node);

    // Insert after afterId in sequence
    const afterIdx = this.sequence.indexOf(afterId);
    this.sequence.splice(afterIdx + 1, 0, id);

    return node;
  }

  delete(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) node.deleted = true;
  }

  getText(): string {
    return this.sequence
      .filter((id) => {
        const node = this.nodes.get(id);
        return node && !node.deleted && id !== "head";
      })
      .map((id) => this.nodes.get(id)!.char)
      .join("");
  }

  /** Apply a remote insert operation */
  applyInsert(node: RGANode): void {
    if (this.nodes.has(node.id)) return; // idempotent
    this.nodes.set(node.id, { ...node });

    const afterIdx = this.sequence.indexOf(node.prev ?? "head");
    if (afterIdx === -1) {
      this.sequence.push(node.id);
    } else {
      this.sequence.splice(afterIdx + 1, 0, node.id);
    }
  }

  /** Apply a remote delete operation */
  applyDelete(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) node.deleted = true;
  }

  get length(): number {
    return this.getText().length;
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  getVisibleNodeIds(): string[] {
    return this.sequence.filter((id) => {
      const n = this.nodes.get(id);
      return n && !n.deleted && id !== "head";
    });
  }

  clone(newSiteId: string): RGADocument {
    const copy = new RGADocument(newSiteId);
    copy.nodes = new Map(
      Array.from(this.nodes.entries()).map(([k, v]) => [k, { ...v }]),
    );
    copy.sequence = [...this.sequence];
    copy.counter = this.counter;
    return copy;
  }
}

// ─── OR-Set (Observed-Remove Set) ────────────────────────────────────────────

interface ORSetEntry<T> {
  value: T;
  tag: string; // unique tag per addition
}

class ORSet<T> {
  private entries: Map<string, ORSetEntry<T>> = new Map(); // tag -> entry
  private tombstones: Set<string> = new Set(); // removed tags
  private siteId: string;
  private counter = 0;

  constructor(siteId: string) {
    this.siteId = siteId;
  }

  private nextTag(): string {
    return `${this.siteId}:${++this.counter}`;
  }

  add(value: T): string {
    const tag = this.nextTag();
    this.entries.set(tag, { value, tag });
    return tag;
  }

  remove(value: T): void {
    for (const [tag, entry] of this.entries) {
      if (entry.value === value) {
        this.entries.delete(tag);
        this.tombstones.add(tag);
      }
    }
  }

  has(value: T): boolean {
    for (const entry of this.entries.values()) {
      if (entry.value === value) return true;
    }
    return false;
  }

  values(): T[] {
    return Array.from(new Set(Array.from(this.entries.values()).map((e) => e.value)));
  }

  /** Merge another ORSet into this one (state-based CRDT merge) */
  merge(other: ORSet<T>): void {
    // Add entries from other that aren't tombstoned locally
    for (const [tag, entry] of other.entries) {
      if (!this.tombstones.has(tag)) {
        this.entries.set(tag, entry);
      }
    }
    // Apply other's tombstones
    for (const tag of other.tombstones) {
      this.entries.delete(tag);
      this.tombstones.add(tag);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

// ─── Document Sync Simulation ─────────────────────────────────────────────────

function simulateDocumentSync(
  docA: RGADocument,
  docB: RGADocument,
  opsA: RGANode[],
  opsB: RGANode[],
): void {
  // Exchange and apply operations
  for (const op of opsA) docB.applyInsert(op);
  for (const op of opsB) docA.applyInsert(op);
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

export async function runCrdtBenchmarks(): Promise<BenchmarkResult[]> {
  const runner = new BenchmarkRunner({
    warmupIterations: 2,
    iterations: 5,
    trackMemory: true,
  });

  // ── RGA Insert Benchmarks ──
  console.log("Benchmarking RGA insert operations...");

  const insertCounts = [100, 1_000, 10_000];

  for (const count of insertCounts) {
    runner.run(`RGA insert ${count} chars`, () => {
      const doc = new RGADocument("site-a");
      let lastId = "head";
      const chars = "abcdefghijklmnopqrstuvwxyz";
      for (let i = 0; i < count; i++) {
        const char = chars[i % chars.length]!;
        const node = doc.insert(lastId, char);
        lastId = node.id;
      }
    });
  }

  // ── RGA Delete Benchmarks ──
  console.log("\nBenchmarking RGA delete operations...");

  for (const count of insertCounts) {
    // Pre-build a document
    const doc = new RGADocument("site-a");
    let lastId = "head";
    const chars = "abcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < count; i++) {
      const node = doc.insert(lastId, chars[i % chars.length]!);
      lastId = node.id;
    }

    runner.run(`RGA delete ${count} chars`, () => {
      const copy = doc.clone("site-bench");
      const ids = copy.getVisibleNodeIds();
      // Delete every other character
      for (let i = 0; i < ids.length; i += 2) {
        copy.delete(ids[i]!);
      }
    });
  }

  // ── RGA Interleaved Insert/Delete ──
  console.log("\nBenchmarking RGA interleaved operations...");

  runner.run("RGA interleaved 1000 ops (70% insert, 30% delete)", () => {
    const doc = new RGADocument("site-a");
    let lastId = "head";
    const visibleIds: string[] = [];

    for (let i = 0; i < 1_000; i++) {
      if (Math.random() < 0.7 || visibleIds.length === 0) {
        const node = doc.insert(lastId, "x");
        lastId = node.id;
        visibleIds.push(node.id);
      } else {
        const idx = Math.floor(Math.random() * visibleIds.length);
        const id = visibleIds.splice(idx, 1)[0]!;
        doc.delete(id);
      }
    }
  });

  // ── ORSet Benchmarks ──
  console.log("\nBenchmarking ORSet operations...");

  const orSetSizes = [100, 1_000, 10_000];

  for (const size of orSetSizes) {
    runner.run(`ORSet add ${size} items`, () => {
      const set = new ORSet<string>("site-a");
      for (let i = 0; i < size; i++) {
        set.add(`item-${i}`);
      }
    });
  }

  for (const size of orSetSizes) {
    // Pre-build set
    const set = new ORSet<string>("site-a");
    const tags: string[] = [];
    for (let i = 0; i < size; i++) {
      set.add(`item-${i}`);
    }

    runner.run(`ORSet remove ${size} items`, () => {
      const copy = new ORSet<string>("site-bench");
      // Copy state
      for (let i = 0; i < size; i++) copy.add(`item-${i}`);
      // Remove half
      for (let i = 0; i < size; i += 2) {
        copy.remove(`item-${i}`);
      }
    });
    void tags;
    void set;
  }

  // ── ORSet Merge ──
  console.log("\nBenchmarking ORSet merge...");

  for (const size of [100, 1_000]) {
    runner.run(`ORSet merge (${size} items each)`, () => {
      const setA = new ORSet<number>("site-a");
      const setB = new ORSet<number>("site-b");

      for (let i = 0; i < size; i++) setA.add(i);
      for (let i = size / 2; i < size * 1.5; i++) setB.add(i);

      setA.merge(setB);
    });
  }

  // ── Document Sync Benchmarks ──
  console.log("\nBenchmarking document sync...");

  const docSizes = [100, 500, 1_000];

  for (const size of docSizes) {
    runner.run(`DocSync ${size} ops per peer`, () => {
      const docA = new RGADocument("site-a");
      const docB = new RGADocument("site-b");

      const opsA: RGANode[] = [];
      const opsB: RGANode[] = [];

      // Site A inserts
      let lastA = "head";
      for (let i = 0; i < size; i++) {
        const node = docA.insert(lastA, "a");
        lastA = node.id;
        opsA.push(node);
      }

      // Site B inserts independently
      let lastB = "head";
      for (let i = 0; i < size; i++) {
        const node = docB.insert(lastB, "b");
        lastB = node.id;
        opsB.push(node);
      }

      simulateDocumentSync(docA, docB, opsA, opsB);
    });
  }

  // ── Concurrent Operations Benchmark ──
  console.log("\nBenchmarking concurrent operations (N sites)...");

  const siteCounts = [2, 5, 10];

  for (const siteCount of siteCounts) {
    runner.run(`Concurrent ops (${siteCount} sites, 100 ops each)`, () => {
      const docs: RGADocument[] = Array.from(
        { length: siteCount },
        (_, i) => new RGADocument(`site-${i}`),
      );

      const allOps: RGANode[][] = Array.from({ length: siteCount }, () => []);

      // Each site inserts 100 chars independently
      for (let s = 0; s < siteCount; s++) {
        let lastId = "head";
        for (let i = 0; i < 100; i++) {
          const node = docs[s]!.insert(lastId, String.fromCharCode(65 + s));
          lastId = node.id;
          allOps[s]!.push(node);
        }
      }

      // Sync: each site applies all other sites' ops
      for (let s = 0; s < siteCount; s++) {
        for (let other = 0; other < siteCount; other++) {
          if (other === s) continue;
          for (const op of allOps[other]!) {
            docs[s]!.applyInsert(op);
          }
        }
      }
    });
  }

  // ── Memory per Document Size ──
  console.log("\nMemory usage per document size:");
  for (const size of [1_000, 10_000, 100_000]) {
    const before = process.memoryUsage().heapUsed;
    const doc = new RGADocument("site-mem");
    let lastId = "head";
    for (let i = 0; i < size; i++) {
      const node = doc.insert(lastId, "x");
      lastId = node.id;
    }
    const after = process.memoryUsage().heapUsed;
    const deltaKB = ((after - before) / 1024).toFixed(1);
    console.log(
      `  ${size} chars: ~${deltaKB} KB heap delta (${doc.nodeCount} RGA nodes)`,
    );
  }

  // ── Vary document sizes for RGA getText ──
  console.log("\nBenchmarking getText on large documents...");
  for (const size of [1_000, 10_000]) {
    const doc = new RGADocument("site-a");
    let lastId = "head";
    for (let i = 0; i < size; i++) {
      const node = doc.insert(lastId, "x");
      lastId = node.id;
    }

    runner.run(`RGA getText (${size} chars)`, () => {
      doc.getText();
    }, { iterations: 20, warmupIterations: 3 });
  }

  runner.printResults();
  return runner.getResults();
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runCrdtBenchmarks().catch(console.error);
}
