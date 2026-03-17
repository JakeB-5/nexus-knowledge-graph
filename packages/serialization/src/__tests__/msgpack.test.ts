import { describe, it, expect } from 'vitest';
import { MsgPackSerializer } from '../msgpack.js';

describe('MsgPackSerializer', () => {
  const mp = new MsgPackSerializer();

  describe('nil', () => {
    it('encodes and decodes null', () => {
      expect(mp.decode(mp.encode(null))).toBe(null);
    });

    it('encodes null as single byte 0xc0', () => {
      expect(mp.encode(null)[0]).toBe(0xc0);
    });
  });

  describe('boolean', () => {
    it('encodes true as 0xc3', () => {
      expect(mp.encode(true)[0]).toBe(0xc3);
    });

    it('encodes false as 0xc2', () => {
      expect(mp.encode(false)[0]).toBe(0xc2);
    });

    it('round-trips true', () => {
      expect(mp.decode(mp.encode(true))).toBe(true);
    });

    it('round-trips false', () => {
      expect(mp.decode(mp.encode(false))).toBe(false);
    });
  });

  describe('positive fixint', () => {
    it('encodes 0 as single byte', () => {
      const buf = mp.encode(0);
      expect(buf.length).toBe(1);
      expect(buf[0]).toBe(0);
    });

    it('encodes 127 as single byte', () => {
      const buf = mp.encode(127);
      expect(buf.length).toBe(1);
      expect(buf[0]).toBe(127);
    });

    it('round-trips 42', () => {
      expect(mp.decode(mp.encode(42))).toBe(42);
    });
  });

  describe('negative fixint', () => {
    it('encodes -1 as single byte', () => {
      const buf = mp.encode(-1);
      expect(buf.length).toBe(1);
      expect(mp.decode(buf)).toBe(-1);
    });

    it('encodes -32 as single byte', () => {
      const buf = mp.encode(-32);
      expect(buf.length).toBe(1);
      expect(mp.decode(buf)).toBe(-32);
    });
  });

  describe('uint types', () => {
    it('round-trips uint8 (128)', () => {
      expect(mp.decode(mp.encode(128))).toBe(128);
    });

    it('round-trips uint8 (255)', () => {
      expect(mp.decode(mp.encode(255))).toBe(255);
    });

    it('round-trips uint16 (1000)', () => {
      expect(mp.decode(mp.encode(1000))).toBe(1000);
    });

    it('round-trips uint32 (100000)', () => {
      expect(mp.decode(mp.encode(100000))).toBe(100000);
    });
  });

  describe('int types', () => {
    it('round-trips int8 (-33)', () => {
      expect(mp.decode(mp.encode(-33))).toBe(-33);
    });

    it('round-trips int16 (-1000)', () => {
      expect(mp.decode(mp.encode(-1000))).toBe(-1000);
    });

    it('round-trips int32 (-100000)', () => {
      expect(mp.decode(mp.encode(-100000))).toBe(-100000);
    });
  });

  describe('float64', () => {
    it('round-trips float64 (3.14)', () => {
      expect(mp.decode<number>(mp.encode(3.14))).toBeCloseTo(3.14);
    });

    it('round-trips NaN', () => {
      expect(Number.isNaN(mp.decode<number>(mp.encode(NaN)))).toBe(true);
    });

    it('round-trips Infinity', () => {
      expect(mp.decode<number>(mp.encode(Infinity))).toBe(Infinity);
    });
  });

  describe('fixstr', () => {
    it('encodes empty string', () => {
      expect(mp.decode(mp.encode(''))).toBe('');
    });

    it('round-trips short string', () => {
      expect(mp.decode(mp.encode('hello'))).toBe('hello');
    });

    it('fixstr header is 0xa0 | len', () => {
      const buf = mp.encode('hi');
      expect(buf[0]).toBe(0xa0 | 2);
    });
  });

  describe('str8/16/32', () => {
    it('round-trips str8 (32+ chars)', () => {
      const str = 'a'.repeat(32);
      expect(mp.decode(mp.encode(str))).toBe(str);
    });

    it('round-trips str16 (256+ chars)', () => {
      const str = 'b'.repeat(300);
      expect(mp.decode(mp.encode(str))).toBe(str);
    });

    it('round-trips unicode string', () => {
      const str = '日本語テスト🎉';
      expect(mp.decode(mp.encode(str))).toBe(str);
    });
  });

  describe('binary (bin8/16/32)', () => {
    it('round-trips Uint8Array', () => {
      const buf = new Uint8Array([1, 2, 3, 255]);
      const result = mp.decode<Uint8Array>(mp.encode(buf));
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([1, 2, 3, 255]);
    });

    it('round-trips empty Uint8Array', () => {
      const buf = new Uint8Array(0);
      const result = mp.decode<Uint8Array>(mp.encode(buf));
      expect(result.length).toBe(0);
    });
  });

  describe('fixarray', () => {
    it('encodes empty array', () => {
      expect(mp.decode(mp.encode([]))).toEqual([]);
    });

    it('round-trips [1, 2, 3]', () => {
      expect(mp.decode(mp.encode([1, 2, 3]))).toEqual([1, 2, 3]);
    });

    it('fixarray header is 0x90 | len', () => {
      const buf = mp.encode([1, 2]);
      expect(buf[0]).toBe(0x90 | 2);
    });
  });

  describe('array16/32', () => {
    it('round-trips array16 (16+ elements)', () => {
      const arr = Array.from({ length: 20 }, (_, i) => i);
      expect(mp.decode(mp.encode(arr))).toEqual(arr);
    });
  });

  describe('fixmap', () => {
    it('encodes empty object', () => {
      expect(mp.decode(mp.encode({}))).toEqual({});
    });

    it('round-trips simple object', () => {
      const obj = { a: 1, b: 'hello', c: true };
      expect(mp.decode(mp.encode(obj))).toEqual(obj);
    });

    it('fixmap header is 0x80 | len', () => {
      const buf = mp.encode({ x: 1 });
      expect(buf[0]).toBe(0x80 | 1);
    });
  });

  describe('map16/32', () => {
    it('round-trips map16 (16+ keys)', () => {
      const obj: Record<string, number> = {};
      for (let i = 0; i < 20; i++) obj[`key${i}`] = i;
      expect(mp.decode(mp.encode(obj))).toEqual(obj);
    });
  });

  describe('Date extension type', () => {
    it('round-trips Date', () => {
      const date = new Date('2024-06-15T12:00:00.000Z');
      const result = mp.decode<Date>(mp.encode(date));
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(date.getTime());
    });
  });

  describe('custom extension types', () => {
    it('registers and round-trips custom extension', () => {
      class Color {
        constructor(public r: number, public g: number, public b: number) {}
      }

      const mp2 = new MsgPackSerializer();
      mp2.registerExtension({
        typeId: 0x10,
        encode: (value) => {
          if (!(value instanceof Color)) return new Uint8Array(0);
          return new Uint8Array([value.r, value.g, value.b]);
        },
        decode: (data) => new Color(data[0]!, data[1]!, data[2]!),
      });

      const color = new Color(255, 128, 0);
      const result = mp2.decode<Color>(mp2.encode(color));
      expect(result).toBeInstanceOf(Color);
      expect(result.r).toBe(255);
      expect(result.g).toBe(128);
      expect(result.b).toBe(0);
    });
  });

  describe('nested structures', () => {
    it('round-trips nested arrays and maps', () => {
      const obj = {
        matrix: [[1, 2], [3, 4]],
        meta: { rows: 2, cols: 2, label: 'test' },
      };
      expect(mp.decode(mp.encode(obj))).toEqual(obj);
    });
  });

  describe('serialize / deserialize aliases', () => {
    it('serialize is same as encode', () => {
      const data = { a: 1 };
      expect(Array.from(mp.serialize(data))).toEqual(Array.from(mp.encode(data)));
    });

    it('deserialize is same as decode', () => {
      const buf = mp.encode({ x: 42 });
      expect(mp.deserialize(buf)).toEqual(mp.decode(buf));
    });
  });

  describe('size efficiency', () => {
    it('is more compact than JSON for integer arrays', () => {
      const arr = Array.from({ length: 50 }, (_, i) => i);
      const mpSize = mp.encode(arr).length;
      const jsonSize = JSON.stringify(arr).length;
      expect(mpSize).toBeLessThan(jsonSize);
    });
  });
});
