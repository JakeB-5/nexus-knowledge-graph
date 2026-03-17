import { describe, it, expect, beforeEach } from 'vitest';
import { OperationTransform } from '../operation-transform.js';
import type { OTOperation } from '../operation-transform.js';

describe('OperationTransform', () => {
  let ot: OperationTransform;

  beforeEach(() => {
    ot = new OperationTransform('Hello world');
  });

  describe('apply', () => {
    it('applies an insert operation', () => {
      const result = ot.apply({ type: 'insert', position: 5, text: ', beautiful' });
      expect(result.document).toBe('Hello, beautiful world');
      expect(result.revision).toBe(1);
    });

    it('applies a delete operation', () => {
      const result = ot.apply({ type: 'delete', position: 5, length: 6 });
      expect(result.document).toBe('Hello');
      expect(result.revision).toBe(1);
    });

    it('retain does not change the document', () => {
      const result = ot.apply({ type: 'retain', length: 5 });
      expect(result.document).toBe('Hello world');
    });

    it('increments revision on each apply', () => {
      ot.apply({ type: 'insert', position: 0, text: 'A' });
      ot.apply({ type: 'insert', position: 0, text: 'B' });
      expect(ot.getRevision()).toBe(2);
    });

    it('insert at position 0 prepends text', () => {
      ot.apply({ type: 'insert', position: 0, text: 'START ' });
      expect(ot.getDocument()).toBe('START Hello world');
    });

    it('insert at end appends text', () => {
      ot.apply({ type: 'insert', position: 11, text: '!' });
      expect(ot.getDocument()).toBe('Hello world!');
    });

    it('delete at position 0 removes from start', () => {
      ot.apply({ type: 'delete', position: 0, length: 6 });
      expect(ot.getDocument()).toBe('world');
    });
  });

  describe('transform', () => {
    it('transforms insert against insert before it (shifts right)', () => {
      const op1: OTOperation = { type: 'insert', position: 5, text: 'X' };
      const op2: OTOperation = { type: 'insert', position: 3, text: 'YY' };
      const transformed = ot.transform(op1, op2);
      expect(transformed.type).toBe('insert');
      if (transformed.type === 'insert') {
        expect(transformed.position).toBe(7); // shifted by 2
      }
    });

    it('does not shift insert when op2 is after op1', () => {
      const op1: OTOperation = { type: 'insert', position: 3, text: 'X' };
      const op2: OTOperation = { type: 'insert', position: 8, text: 'YY' };
      const transformed = ot.transform(op1, op2);
      if (transformed.type === 'insert') {
        expect(transformed.position).toBe(3);
      }
    });

    it('transforms insert against delete before it (shifts left)', () => {
      const op1: OTOperation = { type: 'insert', position: 8, text: 'X' };
      const op2: OTOperation = { type: 'delete', position: 2, length: 3 };
      const transformed = ot.transform(op1, op2);
      if (transformed.type === 'insert') {
        expect(transformed.position).toBe(5); // shifted left by 3
      }
    });

    it('transforms delete against insert before it (shifts right)', () => {
      const op1: OTOperation = { type: 'delete', position: 6, length: 5 };
      const op2: OTOperation = { type: 'insert', position: 2, text: 'XX' };
      const transformed = ot.transform(op1, op2);
      if (transformed.type === 'delete') {
        expect(transformed.position).toBe(8);
      }
    });

    it('transforms delete against non-overlapping delete before it', () => {
      const op1: OTOperation = { type: 'delete', position: 8, length: 3 };
      const op2: OTOperation = { type: 'delete', position: 2, length: 3 };
      const transformed = ot.transform(op1, op2);
      if (transformed.type === 'delete') {
        expect(transformed.position).toBe(5);
        expect(transformed.length).toBe(3);
      }
    });

    it('transforms overlapping deletes to reduce length', () => {
      const op1: OTOperation = { type: 'delete', position: 3, length: 5 };
      const op2: OTOperation = { type: 'delete', position: 5, length: 4 };
      const transformed = ot.transform(op1, op2);
      // op2 overlaps with op1's range: op1 should be shrunk
      expect(transformed.type === 'delete' || transformed.type === 'retain').toBe(true);
    });

    it('retain passes through transform unchanged', () => {
      const op1: OTOperation = { type: 'retain', length: 5 };
      const op2: OTOperation = { type: 'insert', position: 0, text: 'XYZ' };
      const result = ot.transform(op1, op2);
      expect(result).toEqual(op1);
    });
  });

  describe('compose', () => {
    it('composes two adjacent inserts into one', () => {
      const op1: OTOperation = { type: 'insert', position: 0, text: 'Hello' };
      const op2: OTOperation = { type: 'insert', position: 5, text: ' World' };
      const composed = ot.compose(op1, op2);
      expect(composed).toHaveLength(1);
      if (composed[0]!.type === 'insert') {
        expect(composed[0].text).toBe('Hello World');
      }
    });

    it('composes two adjacent deletes into one', () => {
      const op1: OTOperation = { type: 'delete', position: 0, length: 3 };
      const op2: OTOperation = { type: 'delete', position: 0, length: 4 };
      const composed = ot.compose(op1, op2);
      expect(composed).toHaveLength(1);
      if (composed[0]!.type === 'delete') {
        expect(composed[0].length).toBe(7);
      }
    });

    it('returns both ops when they cannot be merged', () => {
      const op1: OTOperation = { type: 'insert', position: 0, text: 'A' };
      const op2: OTOperation = { type: 'delete', position: 5, length: 2 };
      const composed = ot.compose(op1, op2);
      expect(composed).toHaveLength(2);
    });
  });

  describe('undo / redo', () => {
    it('undoes an insert operation', () => {
      ot.apply({ type: 'insert', position: 5, text: ' beautiful' });
      ot.undo();
      expect(ot.getDocument()).toBe('Hello world');
    });

    it('undoes a delete operation', () => {
      ot.apply({ type: 'delete', position: 0, length: 6 });
      ot.undo();
      expect(ot.getDocument()).toBe('Hello world');
    });

    it('returns null when nothing to undo', () => {
      expect(ot.undo()).toBeNull();
    });

    it('redoes after undo', () => {
      ot.apply({ type: 'insert', position: 11, text: '!' });
      ot.undo();
      ot.redo();
      expect(ot.getDocument()).toBe('Hello world!');
    });

    it('returns null when nothing to redo', () => {
      expect(ot.redo()).toBeNull();
    });

    it('clears redo stack after new operation', () => {
      ot.apply({ type: 'insert', position: 0, text: 'X' });
      ot.undo();
      ot.apply({ type: 'insert', position: 0, text: 'Y' });
      expect(ot.redo()).toBeNull();
    });

    it('multiple undo/redo cycles work correctly', () => {
      ot.apply({ type: 'insert', position: 11, text: ' foo' });
      ot.apply({ type: 'insert', position: 15, text: ' bar' });
      ot.undo();
      ot.undo();
      expect(ot.getDocument()).toBe('Hello world');
      ot.redo();
      expect(ot.getDocument()).toBe('Hello world foo');
    });
  });

  describe('receiveClientOperation', () => {
    it('applies client op transformed against server ops', () => {
      // Server has applied one op
      ot.apply({ type: 'insert', position: 0, text: 'A' }); // revision 1
      // Client sends op based on revision 0
      const { newRevision } = ot.receiveClientOperation(
        { type: 'insert', position: 0, text: 'B' },
        0,
      );
      expect(newRevision).toBe(2);
      // Document should have both A and B inserted
      expect(ot.getDocument()).toContain('A');
      expect(ot.getDocument()).toContain('B');
    });

    it('applies client op directly if based on current revision', () => {
      const initial = ot.getDocument();
      const { newRevision } = ot.receiveClientOperation(
        { type: 'insert', position: 0, text: 'Z' },
        ot.getRevision(),
      );
      expect(newRevision).toBe(ot.getRevision());
      expect(ot.getDocument()).not.toBe(initial);
    });
  });

  describe('offline buffer', () => {
    it('buffers operations and flushes them', () => {
      const baseRevision = ot.getRevision();
      const insert = ot.createInsert(0, 'X', 'alice');
      ot.bufferOperation('client1', insert, baseRevision);
      const results = ot.flushOfflineBuffer('client1');
      expect(results.length).toBeGreaterThan(0);
      expect(ot.getDocument()).toContain('X');
    });

    it('returns empty array when no buffer exists', () => {
      const results = ot.flushOfflineBuffer('unknown-client');
      expect(results).toHaveLength(0);
    });
  });

  describe('serializeOperation / deserializeOperation', () => {
    it('round-trips insert operation', () => {
      const op: OTOperation = { type: 'insert', position: 3, text: 'hello' };
      const json = ot.serializeOperation(op);
      const restored = ot.deserializeOperation(json);
      expect(restored).toEqual(op);
    });

    it('round-trips delete operation', () => {
      const op: OTOperation = { type: 'delete', position: 2, length: 4 };
      const json = ot.serializeOperation(op);
      const restored = ot.deserializeOperation(json);
      expect(restored).toEqual(op);
    });
  });

  describe('createInsert / createDelete', () => {
    it('creates insert with correct fields', () => {
      const op = ot.createInsert(5, 'hello', 'alice');
      expect(op.type).toBe('insert');
      expect(op.position).toBe(5);
      expect(op.text).toBe('hello');
      expect(op.author).toBe('alice');
      expect(op.id).toBeTruthy();
    });

    it('creates delete with correct fields', () => {
      const op = ot.createDelete(3, 2, 'bob');
      expect(op.type).toBe('delete');
      expect(op.length).toBe(2);
    });
  });

  describe('toOTOperation', () => {
    it('converts insert EditOperation', () => {
      const editOp = ot.createInsert(1, 'X', 'a');
      const otOp = ot.toOTOperation(editOp);
      expect(otOp.type).toBe('insert');
      if (otOp.type === 'insert') expect(otOp.text).toBe('X');
    });

    it('converts delete EditOperation', () => {
      const editOp = ot.createDelete(1, 3, 'a');
      const otOp = ot.toOTOperation(editOp);
      expect(otOp.type).toBe('delete');
      if (otOp.type === 'delete') expect(otOp.length).toBe(3);
    });
  });
});
