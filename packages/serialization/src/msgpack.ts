// MessagePack-compatible serializer (subset implementation).
// Supports: nil, bool, int (fixint, int8/16/32/64), float32/64,
// str (fixstr, str8/16/32), bin (bin8/16/32), array (fixarray, array16/32),
// map (fixmap, map16/32), and extension types for Date and custom objects.

// Format constants
const FORMAT_NIL = 0xc0;
const FORMAT_FALSE = 0xc2;
const FORMAT_TRUE = 0xc3;
const FORMAT_BIN8 = 0xc4;
const FORMAT_BIN16 = 0xc5;
const FORMAT_BIN32 = 0xc6;
const FORMAT_EXT8 = 0xc7;
const FORMAT_EXT16 = 0xc8;
const FORMAT_EXT32 = 0xc9;
const FORMAT_FLOAT32 = 0xca;
const FORMAT_FLOAT64 = 0xcb;
const FORMAT_UINT8 = 0xcc;
const FORMAT_UINT16 = 0xcd;
const FORMAT_UINT32 = 0xce;
const FORMAT_UINT64 = 0xcf;
const FORMAT_INT8 = 0xd0;
const FORMAT_INT16 = 0xd1;
const FORMAT_INT32 = 0xd2;
const FORMAT_INT64 = 0xd3;
const FORMAT_FIXEXT1 = 0xd4;
const FORMAT_FIXEXT2 = 0xd5;
const FORMAT_FIXEXT4 = 0xd6;
const FORMAT_FIXEXT8 = 0xd7;
const FORMAT_FIXEXT16 = 0xd8;
const FORMAT_STR8 = 0xd9;
const FORMAT_STR16 = 0xda;
const FORMAT_STR32 = 0xdb;
const FORMAT_ARRAY16 = 0xdc;
const FORMAT_ARRAY32 = 0xdd;
const FORMAT_MAP16 = 0xde;
const FORMAT_MAP32 = 0xdf;

// Extension type IDs
const EXT_DATE = 0x01;
const EXT_CUSTOM = 0x02;

interface ExtensionType {
  typeId: number;
  encode: (value: unknown) => Uint8Array;
  decode: (data: Uint8Array) => unknown;
}

class MsgPackEncoder {
  private chunks: Uint8Array[] = [];
  private size = 0;

  private push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
  }

  private writeByte(b: number): void {
    this.push(new Uint8Array([b & 0xff]));
  }

  private writeBytes(bytes: Uint8Array): void {
    this.push(bytes);
  }

  encode(value: unknown, extensions: ExtensionType[]): void {
    if (value === null || value === undefined) {
      this.writeByte(FORMAT_NIL);
      return;
    }

    if (typeof value === 'boolean') {
      this.writeByte(value ? FORMAT_TRUE : FORMAT_FALSE);
      return;
    }

    if (typeof value === 'number') {
      this.encodeNumber(value);
      return;
    }

    if (typeof value === 'string') {
      this.encodeString(value);
      return;
    }

    if (value instanceof Uint8Array) {
      this.encodeBinary(value);
      return;
    }

    if (value instanceof Date) {
      this.encodeDate(value);
      return;
    }

    // Check custom extensions
    for (const ext of extensions) {
      const data = ext.encode(value);
      if (data.length > 0) {
        this.encodeExt(ext.typeId, data);
        return;
      }
    }

    if (Array.isArray(value)) {
      this.encodeArray(value, extensions);
      return;
    }

    if (typeof value === 'object') {
      this.encodeMap(value as Record<string, unknown>, extensions);
      return;
    }
  }

  private encodeNumber(value: number): void {
    if (Number.isInteger(value) && isFinite(value)) {
      if (value >= 0) {
        if (value <= 0x7f) {
          // positive fixint
          this.writeByte(value);
        } else if (value <= 0xff) {
          this.writeByte(FORMAT_UINT8);
          this.writeByte(value);
        } else if (value <= 0xffff) {
          const buf = new Uint8Array(3);
          buf[0] = FORMAT_UINT16;
          buf[1] = (value >> 8) & 0xff;
          buf[2] = value & 0xff;
          this.push(buf);
        } else if (value <= 0xffffffff) {
          const buf = new Uint8Array(5);
          buf[0] = FORMAT_UINT32;
          new DataView(buf.buffer).setUint32(1, value, false);
          this.push(buf);
        } else {
          // uint64 via float64 for large ints
          const buf = new Uint8Array(9);
          buf[0] = FORMAT_FLOAT64;
          new DataView(buf.buffer).setFloat64(1, value, false);
          this.push(buf);
        }
      } else {
        if (value >= -32) {
          // negative fixint
          this.writeByte(value & 0xff);
        } else if (value >= -128) {
          this.writeByte(FORMAT_INT8);
          this.writeByte(value & 0xff);
        } else if (value >= -32768) {
          const buf = new Uint8Array(3);
          buf[0] = FORMAT_INT16;
          new DataView(buf.buffer).setInt16(1, value, false);
          this.push(buf);
        } else if (value >= -2147483648) {
          const buf = new Uint8Array(5);
          buf[0] = FORMAT_INT32;
          new DataView(buf.buffer).setInt32(1, value, false);
          this.push(buf);
        } else {
          const buf = new Uint8Array(9);
          buf[0] = FORMAT_INT64;
          new DataView(buf.buffer).setFloat64(1, value, false);
          this.push(buf);
        }
      }
    } else {
      // float64
      const buf = new Uint8Array(9);
      buf[0] = FORMAT_FLOAT64;
      new DataView(buf.buffer).setFloat64(1, value, false);
      this.push(buf);
    }
  }

  private encodeString(value: string): void {
    const encoded = new TextEncoder().encode(value);
    const len = encoded.length;
    if (len <= 31) {
      // fixstr
      this.writeByte(0xa0 | len);
    } else if (len <= 0xff) {
      this.writeByte(FORMAT_STR8);
      this.writeByte(len);
    } else if (len <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = FORMAT_STR16;
      new DataView(buf.buffer).setUint16(1, len, false);
      this.push(buf);
    } else {
      const buf = new Uint8Array(5);
      buf[0] = FORMAT_STR32;
      new DataView(buf.buffer).setUint32(1, len, false);
      this.push(buf);
    }
    this.writeBytes(encoded);
  }

  private encodeBinary(value: Uint8Array): void {
    const len = value.length;
    if (len <= 0xff) {
      this.writeByte(FORMAT_BIN8);
      this.writeByte(len);
    } else if (len <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = FORMAT_BIN16;
      new DataView(buf.buffer).setUint16(1, len, false);
      this.push(buf);
    } else {
      const buf = new Uint8Array(5);
      buf[0] = FORMAT_BIN32;
      new DataView(buf.buffer).setUint32(1, len, false);
      this.push(buf);
    }
    this.writeBytes(value);
  }

  private encodeDate(value: Date): void {
    // Store as 8-byte float64 milliseconds
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setFloat64(0, value.getTime(), false);
    this.encodeExt(EXT_DATE, buf);
  }

  private encodeExt(typeId: number, data: Uint8Array): void {
    const len = data.length;
    if (len === 1) {
      this.writeByte(FORMAT_FIXEXT1);
    } else if (len === 2) {
      this.writeByte(FORMAT_FIXEXT2);
    } else if (len === 4) {
      this.writeByte(FORMAT_FIXEXT4);
    } else if (len === 8) {
      this.writeByte(FORMAT_FIXEXT8);
    } else if (len === 16) {
      this.writeByte(FORMAT_FIXEXT16);
    } else if (len <= 0xff) {
      this.writeByte(FORMAT_EXT8);
      this.writeByte(len);
    } else if (len <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = FORMAT_EXT16;
      new DataView(buf.buffer).setUint16(1, len, false);
      this.push(buf);
    } else {
      const buf = new Uint8Array(5);
      buf[0] = FORMAT_EXT32;
      new DataView(buf.buffer).setUint32(1, len, false);
      this.push(buf);
    }
    this.writeByte(typeId);
    this.writeBytes(data);
  }

  private encodeArray(value: unknown[], extensions: ExtensionType[]): void {
    const len = value.length;
    if (len <= 15) {
      // fixarray
      this.writeByte(0x90 | len);
    } else if (len <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = FORMAT_ARRAY16;
      new DataView(buf.buffer).setUint16(1, len, false);
      this.push(buf);
    } else {
      const buf = new Uint8Array(5);
      buf[0] = FORMAT_ARRAY32;
      new DataView(buf.buffer).setUint32(1, len, false);
      this.push(buf);
    }
    for (const item of value) {
      this.encode(item, extensions);
    }
  }

  private encodeMap(value: Record<string, unknown>, extensions: ExtensionType[]): void {
    const keys = Object.keys(value);
    const len = keys.length;
    if (len <= 15) {
      // fixmap
      this.writeByte(0x80 | len);
    } else if (len <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = FORMAT_MAP16;
      new DataView(buf.buffer).setUint16(1, len, false);
      this.push(buf);
    } else {
      const buf = new Uint8Array(5);
      buf[0] = FORMAT_MAP32;
      new DataView(buf.buffer).setUint32(1, len, false);
      this.push(buf);
    }
    for (const key of keys) {
      this.encodeString(key);
      this.encode(value[key], extensions);
    }
  }

  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.size);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

class MsgPackDecoder {
  private view: DataView;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  decode(extensions: ExtensionType[]): unknown {
    const byte = this.readUint8();

    // positive fixint
    if (byte <= 0x7f) return byte;
    // fixmap
    if ((byte & 0xf0) === 0x80) return this.decodeMap(byte & 0x0f, extensions);
    // fixarray
    if ((byte & 0xf0) === 0x90) return this.decodeArray(byte & 0x0f, extensions);
    // fixstr
    if ((byte & 0xe0) === 0xa0) return this.decodeStr(byte & 0x1f);
    // negative fixint
    if (byte >= 0xe0) return byte - 256;

    switch (byte) {
      case FORMAT_NIL: return null;
      case FORMAT_FALSE: return false;
      case FORMAT_TRUE: return true;
      case FORMAT_BIN8: return this.decodeBin(this.readUint8());
      case FORMAT_BIN16: return this.decodeBin(this.readUint16());
      case FORMAT_BIN32: return this.decodeBin(this.readUint32());
      case FORMAT_EXT8: {
        const len = this.readUint8();
        return this.decodeExt(len, extensions);
      }
      case FORMAT_EXT16: {
        const len = this.readUint16();
        return this.decodeExt(len, extensions);
      }
      case FORMAT_EXT32: {
        const len = this.readUint32();
        return this.decodeExt(len, extensions);
      }
      case FORMAT_FLOAT32: {
        const val = this.view.getFloat32(this.offset, false);
        this.offset += 4;
        return val;
      }
      case FORMAT_FLOAT64: {
        const val = this.view.getFloat64(this.offset, false);
        this.offset += 8;
        return val;
      }
      case FORMAT_UINT8: return this.readUint8();
      case FORMAT_UINT16: return this.readUint16();
      case FORMAT_UINT32: return this.readUint32();
      case FORMAT_UINT64: {
        const val = this.view.getFloat64(this.offset, false);
        this.offset += 8;
        return val;
      }
      case FORMAT_INT8: return this.readInt8();
      case FORMAT_INT16: return this.readInt16();
      case FORMAT_INT32: return this.readInt32();
      case FORMAT_INT64: {
        const val = this.view.getFloat64(this.offset, false);
        this.offset += 8;
        return val;
      }
      case FORMAT_FIXEXT1: return this.decodeExt(1, extensions);
      case FORMAT_FIXEXT2: return this.decodeExt(2, extensions);
      case FORMAT_FIXEXT4: return this.decodeExt(4, extensions);
      case FORMAT_FIXEXT8: return this.decodeExt(8, extensions);
      case FORMAT_FIXEXT16: return this.decodeExt(16, extensions);
      case FORMAT_STR8: return this.decodeStr(this.readUint8());
      case FORMAT_STR16: return this.decodeStr(this.readUint16());
      case FORMAT_STR32: return this.decodeStr(this.readUint32());
      case FORMAT_ARRAY16: return this.decodeArray(this.readUint16(), extensions);
      case FORMAT_ARRAY32: return this.decodeArray(this.readUint32(), extensions);
      case FORMAT_MAP16: return this.decodeMap(this.readUint16(), extensions);
      case FORMAT_MAP32: return this.decodeMap(this.readUint32(), extensions);
      default:
        throw new Error(`Unknown format byte: 0x${byte.toString(16)}`);
    }
  }

  private decodeStr(len: number): string {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len);
    this.offset += len;
    return new TextDecoder().decode(bytes);
  }

  private decodeBin(len: number): Uint8Array {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len).slice();
    this.offset += len;
    return bytes;
  }

  private decodeExt(len: number, extensions: ExtensionType[]): unknown {
    const typeId = this.readUint8();
    const data = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len).slice();
    this.offset += len;

    if (typeId === EXT_DATE) {
      const ms = new DataView(data.buffer).getFloat64(0, false);
      return new Date(ms);
    }

    for (const ext of extensions) {
      if (ext.typeId === typeId) {
        return ext.decode(data);
      }
    }

    return { __ext: typeId, data };
  }

  private decodeArray(len: number, extensions: ExtensionType[]): unknown[] {
    const arr: unknown[] = [];
    for (let i = 0; i < len; i++) {
      arr.push(this.decode(extensions));
    }
    return arr;
  }

  private decodeMap(len: number, extensions: ExtensionType[]): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < len; i++) {
      const key = this.decode(extensions) as string;
      obj[key] = this.decode(extensions);
    }
    return obj;
  }

  private readUint8(): number {
    return this.view.getUint8(this.offset++);
  }

  private readInt8(): number {
    return this.view.getInt8(this.offset++);
  }

  private readUint16(): number {
    const val = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return val;
  }

  private readInt16(): number {
    const val = this.view.getInt16(this.offset, false);
    this.offset += 2;
    return val;
  }

  private readUint32(): number {
    const val = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return val;
  }

  private readInt32(): number {
    const val = this.view.getInt32(this.offset, false);
    this.offset += 4;
    return val;
  }
}

export class MsgPackSerializer {
  private extensions: ExtensionType[] = [];

  // Register a custom extension type
  registerExtension(ext: ExtensionType): void {
    this.extensions.push(ext);
  }

  encode(value: unknown): Uint8Array {
    const encoder = new MsgPackEncoder();
    encoder.encode(value, this.extensions);
    return encoder.toUint8Array();
  }

  decode<T = unknown>(data: Uint8Array): T {
    const decoder = new MsgPackDecoder(data);
    return decoder.decode(this.extensions) as T;
  }

  // Alias for encode/decode
  serialize(value: unknown): Uint8Array {
    return this.encode(value);
  }

  deserialize<T = unknown>(data: Uint8Array): T {
    return this.decode<T>(data);
  }
}
