// Custom compact binary serializer with type tags, varint encoding,
// UTF-8 string support, and nested structure handling.

// Type tags
const TAG_NULL = 0x00;
const TAG_TRUE = 0x01;
const TAG_FALSE = 0x02;
const TAG_INT8 = 0x03;
const TAG_INT16 = 0x04;
const TAG_INT32 = 0x05;
const TAG_FLOAT64 = 0x06;
const TAG_STRING = 0x07;
const TAG_ARRAY = 0x08;
const TAG_OBJECT = 0x09;
const TAG_DATE = 0x0a;
const TAG_BUFFER = 0x0b;
const TAG_BIGINT = 0x0c;
const TAG_UNDEFINED = 0x0d;

export class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private totalSize = 0;

  writeUint8(value: number): void {
    const buf = new Uint8Array(1);
    buf[0] = value & 0xff;
    this.chunks.push(buf);
    this.totalSize += 1;
  }

  writeInt8(value: number): void {
    const buf = new Uint8Array(1);
    const view = new DataView(buf.buffer);
    view.setInt8(0, value);
    this.chunks.push(buf);
    this.totalSize += 1;
  }

  writeInt16(value: number): void {
    const buf = new Uint8Array(2);
    const view = new DataView(buf.buffer);
    view.setInt16(0, value, false); // big-endian
    this.chunks.push(buf);
    this.totalSize += 2;
  }

  writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, false);
    this.chunks.push(buf);
    this.totalSize += 4;
  }

  writeFloat64(value: number): void {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setFloat64(0, value, false);
    this.chunks.push(buf);
    this.totalSize += 8;
  }

  // Variable-length unsigned integer (unsigned LEB128)
  writeVarint(value: number): void {
    const bytes: number[] = [];
    let v = value >>> 0; // treat as unsigned 32-bit
    do {
      let byte = v & 0x7f;
      v >>>= 7;
      if (v !== 0) byte |= 0x80;
      bytes.push(byte);
    } while (v !== 0);
    const buf = new Uint8Array(bytes);
    this.chunks.push(buf);
    this.totalSize += bytes.length;
  }

  // UTF-8 string with varint length prefix
  writeString(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.writeVarint(encoded.length);
    this.chunks.push(encoded);
    this.totalSize += encoded.length;
  }

  writeBytes(bytes: Uint8Array): void {
    this.writeVarint(bytes.length);
    this.chunks.push(bytes);
    this.totalSize += bytes.length;
  }

  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.totalSize);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  get size(): number {
    return this.totalSize;
  }
}

export class BinaryReader {
  private view: DataView;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  readUint8(): number {
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readInt8(): number {
    const val = this.view.getInt8(this.offset);
    this.offset += 1;
    return val;
  }

  readInt16(): number {
    const val = this.view.getInt16(this.offset, false);
    this.offset += 2;
    return val;
  }

  readInt32(): number {
    const val = this.view.getInt32(this.offset, false);
    this.offset += 4;
    return val;
  }

  readFloat64(): number {
    const val = this.view.getFloat64(this.offset, false);
    this.offset += 8;
    return val;
  }

  readVarint(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = this.view.getUint8(this.offset++);
      result |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    return result >>> 0;
  }

  readString(): string {
    const len = this.readVarint();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len);
    this.offset += len;
    return new TextDecoder().decode(bytes);
  }

  readBytes(): Uint8Array {
    const len = this.readVarint();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len).slice();
    this.offset += len;
    return bytes;
  }

  get position(): number {
    return this.offset;
  }

  hasMore(): boolean {
    return this.offset < this.view.byteLength;
  }
}

export class BinarySerializer {
  serialize(value: unknown): Uint8Array {
    const writer = new BinaryWriter();
    this.writeValue(writer, value);
    return writer.toUint8Array();
  }

  deserialize<T = unknown>(data: Uint8Array): T {
    const reader = new BinaryReader(data);
    return this.readValue(reader) as T;
  }

  // Calculate serialized size without allocating
  calculateSize(value: unknown): number {
    const writer = new BinaryWriter();
    this.writeValue(writer, value);
    return writer.size;
  }

  private writeValue(writer: BinaryWriter, value: unknown): void {
    if (value === null) {
      writer.writeUint8(TAG_NULL);
      return;
    }

    if (value === undefined) {
      writer.writeUint8(TAG_UNDEFINED);
      return;
    }

    if (typeof value === 'boolean') {
      writer.writeUint8(value ? TAG_TRUE : TAG_FALSE);
      return;
    }

    if (typeof value === 'bigint') {
      writer.writeUint8(TAG_BIGINT);
      writer.writeString(value.toString());
      return;
    }

    if (typeof value === 'number') {
      this.writeNumber(writer, value);
      return;
    }

    if (typeof value === 'string') {
      writer.writeUint8(TAG_STRING);
      writer.writeString(value);
      return;
    }

    if (value instanceof Date) {
      writer.writeUint8(TAG_DATE);
      writer.writeFloat64(value.getTime());
      return;
    }

    if (value instanceof Uint8Array) {
      writer.writeUint8(TAG_BUFFER);
      writer.writeBytes(value);
      return;
    }

    if (Array.isArray(value)) {
      writer.writeUint8(TAG_ARRAY);
      writer.writeVarint(value.length);
      for (const item of value) {
        this.writeValue(writer, item);
      }
      return;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      writer.writeUint8(TAG_OBJECT);
      writer.writeVarint(entries.length);
      for (const [k, v] of entries) {
        writer.writeString(k);
        this.writeValue(writer, v);
      }
      return;
    }
  }

  private writeNumber(writer: BinaryWriter, value: number): void {
    if (Number.isInteger(value) && isFinite(value)) {
      if (value >= -128 && value <= 127) {
        writer.writeUint8(TAG_INT8);
        writer.writeInt8(value);
      } else if (value >= -32768 && value <= 32767) {
        writer.writeUint8(TAG_INT16);
        writer.writeInt16(value);
      } else if (value >= -2147483648 && value <= 2147483647) {
        writer.writeUint8(TAG_INT32);
        writer.writeInt32(value);
      } else {
        writer.writeUint8(TAG_FLOAT64);
        writer.writeFloat64(value);
      }
    } else {
      writer.writeUint8(TAG_FLOAT64);
      writer.writeFloat64(value);
    }
  }

  private readValue(reader: BinaryReader): unknown {
    const tag = reader.readUint8();

    switch (tag) {
      case TAG_NULL:
        return null;
      case TAG_UNDEFINED:
        return undefined;
      case TAG_TRUE:
        return true;
      case TAG_FALSE:
        return false;
      case TAG_INT8:
        return reader.readInt8();
      case TAG_INT16:
        return reader.readInt16();
      case TAG_INT32:
        return reader.readInt32();
      case TAG_FLOAT64:
        return reader.readFloat64();
      case TAG_STRING:
        return reader.readString();
      case TAG_BIGINT:
        return BigInt(reader.readString());
      case TAG_DATE:
        return new Date(reader.readFloat64());
      case TAG_BUFFER:
        return reader.readBytes();
      case TAG_ARRAY: {
        const len = reader.readVarint();
        const arr: unknown[] = [];
        for (let i = 0; i < len; i++) {
          arr.push(this.readValue(reader));
        }
        return arr;
      }
      case TAG_OBJECT: {
        const len = reader.readVarint();
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < len; i++) {
          const key = reader.readString();
          obj[key] = this.readValue(reader);
        }
        return obj;
      }
      default:
        throw new Error(`Unknown tag: 0x${tag.toString(16)}`);
    }
  }
}
