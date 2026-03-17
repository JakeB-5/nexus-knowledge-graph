// Operational Transformation for collaborative text editing

import type { InsertOperation, DeleteOperation, EditOperation } from './types.js';

function generateId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type OTOperation =
  | { type: 'insert'; position: number; text: string }
  | { type: 'delete'; position: number; length: number }
  | { type: 'retain'; length: number };

export interface OTResult {
  document: string;
  revision: number;
}

export interface UndoEntry {
  operationId: string;
  inverseOp: OTOperation;
  revision: number;
}

export interface OfflineBuffer {
  operations: Array<InsertOperation | DeleteOperation>;
  baseRevision: number;
}

export class OperationTransform {
  private document: string;
  private revision: number = 0;
  // history of applied operations for undo/redo
  private history: Array<{ op: OTOperation; revision: number; id: string }> = [];
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private offlineBuffer: Map<string, OfflineBuffer> = new Map(); // clientId -> buffer

  constructor(initialDocument = '') {
    this.document = initialDocument;
  }

  // Apply an operation to the current document
  apply(op: OTOperation): OTResult {
    this.document = this.applyToString(this.document, op);
    this.revision++;
    const id = generateId();
    this.history.push({ op, revision: this.revision, id });

    // Build and push undo entry
    const inverseOp = this.invertOp(op, this.document);
    this.undoStack.push({ operationId: id, inverseOp, revision: this.revision });
    this.redoStack = []; // clear redo on new op

    return { document: this.document, revision: this.revision };
  }

  // Transform op1 against op2 (for concurrent editing)
  // Returns transformed op1 that can be applied after op2
  transform(op1: OTOperation, op2: OTOperation): OTOperation {
    if (op1.type === 'retain' || op2.type === 'retain') return op1;

    if (op1.type === 'insert' && op2.type === 'insert') {
      // Both insert: if op2 inserts at or before op1's position, shift op1 right
      if (op2.position <= op1.position) {
        return { type: 'insert', position: op1.position + op2.text.length, text: op1.text };
      }
      return op1;
    }

    if (op1.type === 'insert' && op2.type === 'delete') {
      if (op2.position <= op1.position) {
        // op2 deletes before/at op1's position: shift op1 left by deleted amount
        const shift = Math.min(op2.length, op1.position - op2.position);
        return { type: 'insert', position: op1.position - shift, text: op1.text };
      }
      return op1;
    }

    if (op1.type === 'delete' && op2.type === 'insert') {
      if (op2.position <= op1.position) {
        return { type: 'delete', position: op1.position + op2.text.length, length: op1.length };
      }
      return op1;
    }

    if (op1.type === 'delete' && op2.type === 'delete') {
      const op1End = op1.position + op1.length;
      const op2End = op2.position + op2.length;

      if (op2.position >= op1End) {
        // No overlap, op2 is fully after op1
        return op1;
      }
      if (op2End <= op1.position) {
        // op2 is fully before op1
        return { type: 'delete', position: op1.position - op2.length, length: op1.length };
      }
      // Overlapping deletes: shrink op1's range by the overlap
      const overlapStart = Math.max(op1.position, op2.position);
      const overlapEnd = Math.min(op1End, op2End);
      const overlap = overlapEnd - overlapStart;
      const newLength = op1.length - overlap;
      const newPosition = op2End <= op1.position
        ? op1.position - op2.length
        : op2.position <= op1.position
          ? op2.position
          : op1.position;

      if (newLength <= 0) {
        // op1's range fully consumed by op2; return no-op retain
        return { type: 'retain', length: 0 };
      }
      return { type: 'delete', position: newPosition, length: newLength };
    }

    return op1;
  }

  // Compose two sequential operations into one
  compose(op1: OTOperation, op2: OTOperation): OTOperation[] {
    // Simplified composition: returns [op1, op2] when they can't be merged
    if (
      op1.type === 'insert' &&
      op2.type === 'insert' &&
      op2.position === op1.position + op1.text.length
    ) {
      return [{ type: 'insert', position: op1.position, text: op1.text + op2.text }];
    }
    if (
      op1.type === 'delete' &&
      op2.type === 'delete' &&
      op2.position === op1.position
    ) {
      return [{ type: 'delete', position: op1.position, length: op1.length + op2.length }];
    }
    return [op1, op2];
  }

  // Get current document state
  getDocument(): string {
    return this.document;
  }

  // Get current revision number
  getRevision(): number {
    return this.revision;
  }

  // Undo the last operation
  undo(): OTResult | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.document = this.applyToString(this.document, entry.inverseOp);
    this.revision++;
    this.redoStack.push(entry);
    return { document: this.document, revision: this.revision };
  }

  // Redo a previously undone operation
  redo(): OTResult | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    // Re-apply the original operation (inverse of inverse)
    const historyEntry = this.history.find(h => h.id === entry.operationId);
    if (!historyEntry) return null;
    this.document = this.applyToString(this.document, historyEntry.op);
    this.revision++;
    this.undoStack.push(entry);
    return { document: this.document, revision: this.revision };
  }

  // Client-server OT protocol: receive and transform a client op against server ops
  receiveClientOperation(
    clientOp: OTOperation,
    clientRevision: number,
  ): { serverOp: OTOperation; newRevision: number } {
    // Get operations applied since clientRevision
    const serverOps = this.history
      .filter(h => h.revision > clientRevision)
      .map(h => h.op);

    // Transform clientOp against all server ops since the client's base revision
    let transformed = clientOp;
    for (const serverOp of serverOps) {
      transformed = this.transform(transformed, serverOp);
    }

    // Apply the transformed op
    this.apply(transformed);
    return { serverOp: transformed, newRevision: this.revision };
  }

  // Buffer an operation for offline support
  bufferOperation(
    clientId: string,
    op: InsertOperation | DeleteOperation,
    baseRevision: number,
  ): void {
    let buffer = this.offlineBuffer.get(clientId);
    if (!buffer) {
      buffer = { operations: [], baseRevision };
      this.offlineBuffer.set(clientId, buffer);
    }
    buffer.operations.push(op);
  }

  // Flush buffered operations for a client (reconnect scenario)
  flushOfflineBuffer(clientId: string): OTResult[] {
    const buffer = this.offlineBuffer.get(clientId);
    if (!buffer || buffer.operations.length === 0) return [];

    this.offlineBuffer.delete(clientId);
    const results: OTResult[] = [];

    for (const op of buffer.operations) {
      const otOp: OTOperation =
        op.type === 'insert'
          ? { type: 'insert', position: op.position, text: op.text }
          : { type: 'delete', position: op.position, length: op.length };

      const { serverOp, newRevision } = this.receiveClientOperation(otOp, buffer.baseRevision);
      buffer.baseRevision = newRevision;
      results.push({ document: this.document, revision: newRevision });
      void serverOp; // consumed
    }

    return results;
  }

  // Serialize an operation to JSON
  serializeOperation(op: OTOperation): string {
    return JSON.stringify(op);
  }

  // Deserialize an operation from JSON
  deserializeOperation(json: string): OTOperation {
    return JSON.parse(json) as OTOperation;
  }

  // Create an insert EditOperation (typed for transport)
  createInsert(position: number, text: string, author: string): InsertOperation {
    return {
      type: 'insert',
      position,
      text,
      author,
      timestamp: Date.now(),
      id: generateId(),
    };
  }

  // Create a delete EditOperation (typed for transport)
  createDelete(position: number, length: number, author: string): DeleteOperation {
    return {
      type: 'delete',
      position,
      length,
      author,
      timestamp: Date.now(),
      id: generateId(),
    };
  }

  // Convert typed EditOperation to OTOperation
  toOTOperation(op: EditOperation): OTOperation {
    switch (op.type) {
      case 'insert':
        return { type: 'insert', position: op.position, text: op.text };
      case 'delete':
        return { type: 'delete', position: op.position, length: op.length };
      case 'retain':
        return { type: 'retain', length: op.length };
    }
  }

  // Apply an OTOperation to a string and return the result
  private applyToString(doc: string, op: OTOperation): string {
    if (op.type === 'retain') return doc;
    if (op.type === 'insert') {
      const pos = Math.max(0, Math.min(op.position, doc.length));
      return doc.slice(0, pos) + op.text + doc.slice(pos);
    }
    if (op.type === 'delete') {
      const pos = Math.max(0, Math.min(op.position, doc.length));
      const end = Math.min(pos + op.length, doc.length);
      return doc.slice(0, pos) + doc.slice(end);
    }
    return doc;
  }

  // Compute the inverse of an operation (for undo)
  private invertOp(op: OTOperation, docAfter: string): OTOperation {
    if (op.type === 'retain') return { type: 'retain', length: op.length };
    if (op.type === 'insert') {
      return { type: 'delete', position: op.position, length: op.text.length };
    }
    // For delete, we need the original text which is in docAfter reversed
    // We store a retain with length 0 as a placeholder (actual undo requires pre-op state)
    return { type: 'insert', position: op.position, text: docAfter.slice(op.position, op.position + op.length) };
  }
}
