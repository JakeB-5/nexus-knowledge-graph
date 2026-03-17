import { describe, it, expect } from 'vitest';
import { BinarySerializer, BinaryWriter, BinaryReader } from '../binary-serializer.js';

describe('BinaryWriter / BinaryReader', () => {
  it('writes and reads uint8', () => {
    const w = new BinaryWriter();
    w.writeUint8(200);
    const r = new BinaryReader(w.toUint8Array());
    expect(r.readUint8()).toBe(200);
  });

  it('writes and reads int8 (negative)', () => {
    const w = new BinaryWriter();
    w.writeInt8(-42);
    const r = new BinaryReader(w.toUint8Array());
    expect(r.readInt8()).toBe(-42);
  });

  it('writes and reads int16', () => {
    const w = new BinaryWriter();
    w.writeInt16(-1000);
    const r = new BinaryReader(w.toUint8Array());
    expect(r.readInt16()).toBe(-1000);
  });

  it('writes and reads int32', () => {
    const w = new BinaryWriter();
    w.writeInt32(-100000);
    const r = new BinaryReader(w.toUint8Array());
    expect(r.readInt32()).toBe(-100000);
  });

  it('writes and reads float64', () => {
    const w = new BinaryWriter();
    w.writeFloat64(3.141592653589793);
    const r = new BinaryReader(w.toUint8Array());
    expect(r.readFloat64()).toBeCloseTo(3.141592653589793, 10);
  });

  it('encodes varint for small numbers in one byte', () => {
    const w = new BinaryWriter();
    w.writeVarint(42);
    expect(w.toUint8Array().length).toBe(1);
    const r = new BinaryReader(w.toUint8Array());
    expect(r.readVarint()).toBe(42);
  });

  it('encodes varint for large numbers in multiple bytes', () => {
    const w = new BinaryWriter();
    w.writeVarint(300);
    const bytes = w.toUint8Array();
    expect(bytes.length).toBe(2);
    const r = new BinaryReader(bytes);
    expect(r.readVarint()).toBe(300);
  });

  it('writes and reads a string', () => {
    const w = new BinaryWriter();
    w.writeString('hello world');
    const r = new BinaryReader(w.toUint8Array());
    expect(r.readString()).toBe('hello world');
  });

  it('writes and reads bytes', () => {
    const w = new BinaryWriter();
    const input = new Uint8Array([1, 2, 3, 4, 5]);
    w.writeBytes(input);
    const r = new BinaryReader(w.toUint8Array());
    expect(Array.from(r.readBytes())).toEqual([1, 2, 3, 4, 5]);
  });

  it('reports correct size', () => {
    const w = new BinaryWriter();
    w.writeUint8(1);
    w.writeInt32(100);
    expect(w.size).toBe(5);
  });
});

describe('BinarySerializer', () => {
  const s = new BinarySerializer();

  it('round-trips null', () => {
    expect(s.deserialize(s.serialize(null))).toBe(null);
  });

  it('round-trips undefined', () => {
    expect(s.deserialize(s.serialize(undefined))).toBe(undefined);
  });

  it('round-trips true', () => {
    expect(s.deserialize(s.serialize(true))).toBe(true);
  });

  it('round-trips false', () => {
    expect(s.deserialize(s.serialize(false))).toBe(false);
  });

  it('uses INT8 for small integers', () => {
    const data = s.serialize(42);
    expect(data.length).toBe(2); // tag + int8
    expect(s.deserialize<number>(data)).toBe(42);
  });

  it('uses INT16 for medium integers', () => {
    const data = s.serialize(1000);
    expect(data.length).toBe(3); // tag + int16
    expect(s.deserialize<number>(data)).toBe(1000);
  });

  it('uses INT32 for large integers', () => {
    const data = s.serialize(100000);
    expect(data.length).toBe(5); // tag + int32
    expect(s.deserialize<number>(data)).toBe(100000);
  });

  it('uses FLOAT64 for floats', () => {
    const data = s.serialize(3.14);
    expect(s.deserialize<number>(data)).toBeCloseTo(3.14);
  });

  it('round-trips BigInt', () => {
    const big = BigInt('9007199254740993');
    expect(s.deserialize<bigint>(s.serialize(big))).toBe(big);
  });

  it('round-trips strings', () => {
    expect(s.deserialize<string>(s.serialize('hello'))).toBe('hello');
  });

  it('round-trips unicode strings', () => {
    const str = '日本語テスト🎉';
    expect(s.deserialize<string>(s.serialize(str))).toBe(str);
  });

  it('round-trips Date', () => {
    const date = new Date('2024-03-15T10:00:00Z');
    const result = s.deserialize<Date>(s.serialize(date));
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(date.getTime());
  });

  it('round-trips Uint8Array', () => {
    const buf = new Uint8Array([0, 1, 2, 255]);
    const result = s.deserialize<Uint8Array>(s.serialize(buf));
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([0, 1, 2, 255]);
  });

  it('round-trips an array', () => {
    const arr = [1, 'two', true, null];
    const result = s.deserialize<typeof arr>(s.serialize(arr));
    expect(result).toEqual(arr);
  });

  it('round-trips a plain object', () => {
    const obj = { name: 'Alice', age: 30, active: true };
    const result = s.deserialize<typeof obj>(s.serialize(obj));
    expect(result).toEqual(obj);
  });

  it('round-trips nested structures', () => {
    const obj = {
      users: [
        { id: 1, name: 'Alice', scores: [100, 200, 300] },
        { id: 2, name: 'Bob', scores: [50, 75] },
      ],
      meta: { total: 2, timestamp: new Date('2024-01-01') },
    };
    const result = s.deserialize<typeof obj>(s.serialize(obj));
    expect(result.users[0]?.name).toBe('Alice');
    expect(result.users[1]?.scores).toEqual([50, 75]);
    expect(result.meta.timestamp).toBeInstanceOf(Date);
  });

  it('is smaller than JSON for numeric arrays', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const binarySize = s.serialize(arr).length;
    const jsonSize = JSON.stringify(arr).length;
    // Binary should be more compact (2 bytes per small int vs avg ~3 chars in JSON)
    expect(binarySize).toBeLessThan(jsonSize);
  });

  it('calculateSize matches actual serialized size', () => {
    const obj = { a: 1, b: 'hello', c: [1, 2, 3] };
    const calculated = s.calculateSize(obj);
    const actual = s.serialize(obj).length;
    expect(calculated).toBe(actual);
  });

  it('throws on unknown tag during deserialization', () => {
    const bad = new Uint8Array([0xff]);
    expect(() => s.deserialize(bad)).toThrow(/Unknown tag/);
  });
});
