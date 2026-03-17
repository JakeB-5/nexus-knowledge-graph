// Compression utilities: RLE, LZ77-style, dictionary-based, delta encoding,
// bit-packing, compression ratio reporting, and auto-selection.

export interface CompressionResult {
  data: Uint8Array;
  method: string;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

// ─── Run-Length Encoding (RLE) ───────────────────────────────────────────────

export function rleEncode(data: Uint8Array): Uint8Array {
  if (data.length === 0) return new Uint8Array(0);

  const output: number[] = [];
  let i = 0;

  while (i < data.length) {
    const byte = data[i]!;
    let count = 1;
    while (i + count < data.length && data[i + count] === byte && count < 255) {
      count++;
    }
    output.push(count, byte);
    i += count;
  }

  return new Uint8Array(output);
}

export function rleDecode(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const count = data[i]!;
    const byte = data[i + 1]!;
    for (let j = 0; j < count; j++) output.push(byte);
  }
  return new Uint8Array(output);
}

// ─── LZ77-style Compression ──────────────────────────────────────────────────
// Simplified: tokens are either literal bytes or (offset, length) back-references.
// Format: 0x00 <byte> for literal, 0x01 <offset_hi> <offset_lo> <len> for ref.

const WINDOW_SIZE = 255;
const MIN_MATCH = 3;
const MAX_MATCH = 255;

export function lz77Encode(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let i = 0;

  while (i < data.length) {
    let bestLen = 0;
    let bestOffset = 0;

    const windowStart = Math.max(0, i - WINDOW_SIZE);
    for (let j = windowStart; j < i; j++) {
      let len = 0;
      while (
        len < MAX_MATCH &&
        i + len < data.length &&
        data[j + len] === data[i + len]
      ) {
        len++;
      }
      if (len > bestLen) {
        bestLen = len;
        bestOffset = i - j;
      }
    }

    if (bestLen >= MIN_MATCH) {
      output.push(0x01, bestOffset & 0xff, (bestOffset >> 8) & 0xff, bestLen);
      i += bestLen;
    } else {
      output.push(0x00, data[i]!);
      i++;
    }
  }

  return new Uint8Array(output);
}

export function lz77Decode(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let i = 0;

  while (i < data.length) {
    const token = data[i++]!;
    if (token === 0x00) {
      output.push(data[i++]!);
    } else if (token === 0x01) {
      const offsetLo = data[i++]!;
      const offsetHi = data[i++]!;
      const len = data[i++]!;
      const offset = offsetLo | (offsetHi << 8);
      const start = output.length - offset;
      for (let j = 0; j < len; j++) {
        output.push(output[start + j]!);
      }
    }
  }

  return new Uint8Array(output);
}

// ─── Dictionary-based Compression ────────────────────────────────────────────
// Build a dictionary of repeated byte sequences, replace with 2-byte indices.

export function dictionaryEncode(data: Uint8Array): Uint8Array {
  if (data.length < 4) return new Uint8Array([0x00, ...data]);

  const str = new TextDecoder('latin1').decode(data);
  const phrases = new Map<string, number>();
  const MIN_PHRASE = 3;
  const MAX_PHRASE = 16;

  // Count phrase frequencies
  const freq = new Map<string, number>();
  for (let len = MIN_PHRASE; len <= Math.min(MAX_PHRASE, str.length); len++) {
    for (let i = 0; i <= str.length - len; i++) {
      const phrase = str.slice(i, i + len);
      freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
    }
  }

  // Select top 254 phrases worth compressing
  const worthy = Array.from(freq.entries())
    .filter(([phrase, count]) => count * (phrase.length - 2) > 4)
    .sort((a, b) => b[1] * b[0].length - a[1] * a[0].length)
    .slice(0, 254)
    .map(([phrase]) => phrase);

  for (let i = 0; i < worthy.length; i++) {
    phrases.set(worthy[i]!, i + 1);
  }

  if (phrases.size === 0) return new Uint8Array([0x00, ...data]);

  // Encode dictionary header
  const dictEntries: number[] = [];
  for (const [phrase, idx] of phrases) {
    const encoded = new TextEncoder().encode(phrase);
    dictEntries.push(idx, encoded.length, ...encoded);
  }

  // Encode body
  const body: number[] = [];
  let pos = 0;
  while (pos < str.length) {
    let matched = false;
    for (let len = Math.min(MAX_PHRASE, str.length - pos); len >= MIN_PHRASE; len--) {
      const phrase = str.slice(pos, pos + len);
      const idx = phrases.get(phrase);
      if (idx !== undefined) {
        body.push(0xff, idx); // escape + index
        pos += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const byte = data[pos]!;
      body.push(byte === 0xff ? 0xfe : byte); // escape 0xff
      pos++;
    }
  }

  const header = [0x01, dictEntries.length & 0xff, (dictEntries.length >> 8) & 0xff];
  return new Uint8Array([...header, ...dictEntries, ...body]);
}

export function dictionaryDecode(data: Uint8Array): Uint8Array {
  if (data.length === 0) return new Uint8Array(0);
  const mode = data[0]!;
  if (mode === 0x00) return data.slice(1);

  const dictLen = data[1]! | (data[2]! << 8);
  const dict = new Map<number, Uint8Array>();
  let i = 3;
  const end = 3 + dictLen;

  while (i < end) {
    const idx = data[i++]!;
    const len = data[i++]!;
    const phrase = data.slice(i, i + len);
    dict.set(idx, phrase);
    i += len;
  }

  const body: number[] = [];
  while (i < data.length) {
    const byte = data[i++]!;
    if (byte === 0xff) {
      const idx = data[i++]!;
      const phrase = dict.get(idx);
      if (phrase) body.push(...phrase);
    } else if (byte === 0xfe) {
      body.push(0xff);
    } else {
      body.push(byte);
    }
  }

  return new Uint8Array(body);
}

// ─── Delta Encoding for sorted numbers ───────────────────────────────────────

export function deltaEncode(numbers: number[]): number[] {
  if (numbers.length === 0) return [];
  const result: number[] = [numbers[0]!];
  for (let i = 1; i < numbers.length; i++) {
    result.push(numbers[i]! - numbers[i - 1]!);
  }
  return result;
}

export function deltaDecode(deltas: number[]): number[] {
  if (deltas.length === 0) return [];
  const result: number[] = [deltas[0]!];
  for (let i = 1; i < deltas.length; i++) {
    result.push(result[i - 1]! + deltas[i]!);
  }
  return result;
}

export function deltaEncodeBytes(numbers: number[]): Uint8Array {
  const deltas = deltaEncode(numbers);
  // Encode each delta as zigzag varint
  const bytes: number[] = [];
  for (const d of deltas) {
    const zigzag = d >= 0 ? d * 2 : -d * 2 - 1;
    let v = zigzag;
    do {
      let byte = v & 0x7f;
      v >>>= 7;
      if (v !== 0) byte |= 0x80;
      bytes.push(byte);
    } while (v !== 0);
  }
  return new Uint8Array(bytes);
}

export function deltaDecodeBytes(data: Uint8Array): number[] {
  const deltas: number[] = [];
  let i = 0;
  while (i < data.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = data[i++]!;
      result |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    // Decode zigzag
    const delta = result & 1 ? -(result >> 1) - 1 : result >> 1;
    deltas.push(delta);
  }
  return deltaDecode(deltas);
}

// ─── Bit-packing for small integers ──────────────────────────────────────────

export function bitPack(values: number[], bitsPerValue: number): Uint8Array {
  const totalBits = values.length * bitsPerValue;
  const bytes = new Uint8Array(Math.ceil(totalBits / 8));
  let bitPos = 0;

  for (const val of values) {
    for (let b = 0; b < bitsPerValue; b++) {
      const bit = (val >> b) & 1;
      const byteIdx = Math.floor(bitPos / 8);
      const bitIdx = bitPos % 8;
      bytes[byteIdx]! |= bit << bitIdx;
      bitPos++;
    }
  }

  return bytes;
}

export function bitUnpack(data: Uint8Array, bitsPerValue: number, count: number): number[] {
  const values: number[] = [];
  let bitPos = 0;

  for (let i = 0; i < count; i++) {
    let val = 0;
    for (let b = 0; b < bitsPerValue; b++) {
      const byteIdx = Math.floor(bitPos / 8);
      const bitIdx = bitPos % 8;
      const bit = byteIdx < data.length ? ((data[byteIdx]! >> bitIdx) & 1) : 0;
      val |= bit << b;
      bitPos++;
    }
    values.push(val);
  }

  return values;
}

// ─── Auto-select best method ──────────────────────────────────────────────────

export type CompressionMethod = 'rle' | 'lz77' | 'dictionary' | 'none';

export function compress(data: Uint8Array, method?: CompressionMethod): CompressionResult {
  if (method) {
    return compressWithMethod(data, method);
  }
  return autoCompress(data);
}

export function decompress(data: Uint8Array, method: CompressionMethod): Uint8Array {
  switch (method) {
    case 'rle': return rleDecode(data);
    case 'lz77': return lz77Decode(data);
    case 'dictionary': return dictionaryDecode(data);
    case 'none': return data;
  }
}

function compressWithMethod(data: Uint8Array, method: CompressionMethod): CompressionResult {
  let compressed: Uint8Array;
  switch (method) {
    case 'rle': compressed = rleEncode(data); break;
    case 'lz77': compressed = lz77Encode(data); break;
    case 'dictionary': compressed = dictionaryEncode(data); break;
    case 'none': compressed = data; break;
  }
  return buildResult(data, compressed, method);
}

function autoCompress(data: Uint8Array): CompressionResult {
  if (data.length === 0) return buildResult(data, data, 'none');

  // Sample which method works best
  const candidates: CompressionMethod[] = ['rle', 'lz77', 'dictionary'];
  let best: CompressionResult = buildResult(data, data, 'none');

  for (const method of candidates) {
    try {
      const result = compressWithMethod(data, method);
      if (result.compressedSize < best.compressedSize) {
        best = result;
      }
    } catch {
      // skip failed methods
    }
  }

  return best;
}

function buildResult(
  original: Uint8Array,
  compressed: Uint8Array,
  method: CompressionMethod,
): CompressionResult {
  return {
    data: compressed,
    method,
    originalSize: original.length,
    compressedSize: compressed.length,
    ratio: original.length === 0 ? 1 : compressed.length / original.length,
  };
}
