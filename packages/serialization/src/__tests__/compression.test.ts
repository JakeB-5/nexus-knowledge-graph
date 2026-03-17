import { describe, it, expect } from 'vitest';
import {
  rleEncode,
  rleDecode,
  lz77Encode,
  lz77Decode,
  dictionaryEncode,
  dictionaryDecode,
  deltaEncode,
  deltaDecode,
  deltaEncodeBytes,
  deltaDecodeBytes,
  bitPack,
  bitUnpack,
  compress,
  decompress,
} from '../compression.js';

describe('RLE (Run-Length Encoding)', () => {
  it('encodes a run of identical bytes', () => {
    const input = new Uint8Array([5, 5, 5, 5, 5]);
    const encoded = rleEncode(input);
    expect(encoded.length).toBe(2); // count=5, byte=5
    expect(encoded[0]).toBe(5);
    expect(encoded[1]).toBe(5);
  });

  it('round-trips a uniform run', () => {
    const input = new Uint8Array([255, 255, 255]);
    expect(Array.from(rleDecode(rleEncode(input)))).toEqual(Array.from(input));
  });

  it('round-trips mixed data', () => {
    const input = new Uint8Array([1, 1, 2, 3, 3, 3, 4]);
    expect(Array.from(rleDecode(rleEncode(input)))).toEqual(Array.from(input));
  });

  it('handles empty input', () => {
    const result = rleEncode(new Uint8Array(0));
    expect(result.length).toBe(0);
    expect(Array.from(rleDecode(result))).toEqual([]);
  });

  it('handles single byte', () => {
    const input = new Uint8Array([42]);
    expect(Array.from(rleDecode(rleEncode(input)))).toEqual([42]);
  });

  it('compresses repeated bytes better than JSON', () => {
    const input = new Uint8Array(100).fill(7);
    const encoded = rleEncode(input);
    expect(encoded.length).toBeLessThan(input.length);
  });
});

describe('LZ77-style compression', () => {
  it('round-trips simple string bytes', () => {
    const input = new TextEncoder().encode('abcabcabc');
    const encoded = lz77Encode(input);
    const decoded = lz77Decode(encoded);
    expect(new TextDecoder().decode(decoded)).toBe('abcabcabc');
  });

  it('round-trips non-repetitive data', () => {
    const input = new Uint8Array([1, 2, 3, 4, 5]);
    const decoded = lz77Decode(lz77Encode(input));
    expect(Array.from(decoded)).toEqual([1, 2, 3, 4, 5]);
  });

  it('round-trips empty input', () => {
    expect(Array.from(lz77Decode(lz77Encode(new Uint8Array(0))))).toEqual([]);
  });

  it('compresses repetitive data', () => {
    const input = new TextEncoder().encode('hello hello hello hello');
    const encoded = lz77Encode(input);
    expect(encoded.length).toBeLessThan(input.length);
  });

  it('round-trips a longer repetitive sequence', () => {
    const str = 'the quick brown fox jumps over the lazy dog '.repeat(3);
    const input = new TextEncoder().encode(str);
    const decoded = lz77Decode(lz77Encode(input));
    expect(new TextDecoder().decode(decoded)).toBe(str);
  });
});

describe('Dictionary-based compression', () => {
  it('round-trips simple data', () => {
    const input = new TextEncoder().encode('hello world hello world');
    const decoded = dictionaryDecode(dictionaryEncode(input));
    expect(new TextDecoder().decode(decoded)).toBe('hello world hello world');
  });

  it('round-trips data without repeated phrases', () => {
    const input = new Uint8Array([10, 20, 30, 40]);
    const decoded = dictionaryDecode(dictionaryEncode(input));
    expect(Array.from(decoded)).toEqual([10, 20, 30, 40]);
  });

  it('round-trips empty input', () => {
    expect(Array.from(dictionaryDecode(dictionaryEncode(new Uint8Array(0))))).toEqual([]);
  });

  it('round-trips data with many repeated phrases', () => {
    const str = 'compress this string compress this string again compress this string once more';
    const input = new TextEncoder().encode(str);
    const decoded = dictionaryDecode(dictionaryEncode(input));
    expect(new TextDecoder().decode(decoded)).toBe(str);
  });
});

describe('Delta encoding', () => {
  it('encodes sorted numbers as deltas', () => {
    const nums = [10, 20, 30, 40, 50];
    const deltas = deltaEncode(nums);
    expect(deltas).toEqual([10, 10, 10, 10, 10]);
  });

  it('round-trips sorted numbers', () => {
    const nums = [100, 200, 305, 410, 500];
    expect(deltaDecode(deltaEncode(nums))).toEqual(nums);
  });

  it('handles empty array', () => {
    expect(deltaEncode([])).toEqual([]);
    expect(deltaDecode([])).toEqual([]);
  });

  it('handles single element', () => {
    expect(deltaEncode([42])).toEqual([42]);
    expect(deltaDecode([42])).toEqual([42]);
  });

  it('handles decreasing sequence (negative deltas)', () => {
    const nums = [100, 80, 60, 40, 20];
    expect(deltaDecode(deltaEncode(nums))).toEqual(nums);
  });
});

describe('Delta byte encoding (varint)', () => {
  it('round-trips sorted integers as bytes', () => {
    const nums = [1, 5, 10, 100, 1000];
    expect(deltaDecodeBytes(deltaEncodeBytes(nums))).toEqual(nums);
  });

  it('round-trips array with negative deltas', () => {
    const nums = [500, 400, 300, 200, 100];
    expect(deltaDecodeBytes(deltaEncodeBytes(nums))).toEqual(nums);
  });

  it('produces compact encoding for sequential integers', () => {
    const nums = Array.from({ length: 100 }, (_, i) => i * 10);
    const encoded = deltaEncodeBytes(nums);
    // Each delta of 10 encodes to 1 byte (varint) + zigzag overhead is minimal
    expect(encoded.length).toBeLessThan(nums.length * 4);
  });
});

describe('Bit-packing', () => {
  it('packs 4-bit values', () => {
    const values = [0, 1, 7, 15];
    const packed = bitPack(values, 4);
    expect(Array.from(bitUnpack(packed, 4, values.length))).toEqual(values);
  });

  it('packs 1-bit values (flags)', () => {
    const values = [1, 0, 1, 1, 0, 1, 0, 0];
    const packed = bitPack(values, 1);
    expect(packed.length).toBe(1); // 8 bits = 1 byte
    expect(Array.from(bitUnpack(packed, 1, values.length))).toEqual(values);
  });

  it('packs 2-bit values', () => {
    const values = [0, 1, 2, 3, 0, 1, 2, 3];
    const packed = bitPack(values, 2);
    expect(packed.length).toBe(2); // 16 bits = 2 bytes
    expect(Array.from(bitUnpack(packed, 2, values.length))).toEqual(values);
  });

  it('reduces storage for small-range integers', () => {
    // 100 values in range 0-15 need 4 bits each = 50 bytes vs 100 bytes raw
    const values = Array.from({ length: 100 }, (_, i) => i % 16);
    const packed = bitPack(values, 4);
    expect(packed.length).toBe(50);
  });
});

describe('auto-select compress/decompress', () => {
  it('compresses and decompresses with auto method', () => {
    const data = new TextEncoder().encode('hello hello hello hello hello');
    const result = compress(data);
    expect(result.originalSize).toBe(data.length);
    expect(result.ratio).toBeGreaterThan(0);
    const restored = decompress(result.data, result.method as 'rle' | 'lz77' | 'dictionary' | 'none');
    expect(new TextDecoder().decode(restored)).toBe('hello hello hello hello hello');
  });

  it('reports compression ratio', () => {
    const data = new Uint8Array(100).fill(42);
    const result = compress(data, 'rle');
    expect(result.ratio).toBeLessThan(1);
    expect(result.originalSize).toBe(100);
    expect(result.method).toBe('rle');
  });

  it('uses none method for empty data', () => {
    const result = compress(new Uint8Array(0));
    expect(result.method).toBe('none');
  });

  it('explicit rle method', () => {
    const data = new Uint8Array(50).fill(1);
    const result = compress(data, 'rle');
    expect(result.method).toBe('rle');
    expect(result.compressedSize).toBeLessThan(result.originalSize);
  });

  it('explicit lz77 method', () => {
    const data = new TextEncoder().encode('aaabbbcccaaabbbccc');
    const result = compress(data, 'lz77');
    expect(result.method).toBe('lz77');
  });

  it('none method returns data unchanged', () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = compress(data, 'none');
    expect(Array.from(result.data)).toEqual([1, 2, 3]);
    expect(result.ratio).toBe(1);
  });
});
