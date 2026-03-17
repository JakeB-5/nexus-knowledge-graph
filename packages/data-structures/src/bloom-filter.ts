// Bloom filter with configurable false positive rate
export class BloomFilter {
  private readonly bits: Uint8Array;
  private readonly numBits: number;
  private readonly numHashes: number;
  private _count: number = 0;

  constructor(options?: {
    expectedItems?: number;
    falsePositiveRate?: number;
    numBits?: number;
    numHashes?: number;
  }) {
    const expectedItems = options?.expectedItems ?? 1000;
    const falsePositiveRate = options?.falsePositiveRate ?? 0.01;

    if (options?.numBits !== undefined && options?.numHashes !== undefined) {
      this.numBits = options.numBits;
      this.numHashes = options.numHashes;
    } else {
      // Optimal size: m = -n*ln(p) / (ln(2)^2)
      this.numBits = Math.ceil(
        (-expectedItems * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2),
      );
      // Optimal hash count: k = (m/n) * ln(2)
      this.numHashes = Math.max(
        1,
        Math.round((this.numBits / expectedItems) * Math.LN2),
      );
    }

    this.bits = new Uint8Array(Math.ceil(this.numBits / 8));
  }

  // Murmur-inspired hash functions using FNV-1a variant
  private hash(item: string, seed: number): number {
    let h = seed ^ 0x811c9dc5;
    for (let i = 0; i < item.length; i++) {
      h ^= item.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
      h ^= h >>> 16;
    }
    return Math.abs(h) % this.numBits;
  }

  // Secondary hash to generate k independent positions
  private positions(item: string): number[] {
    const pos: number[] = [];
    // Use double hashing: h_i(x) = h1(x) + i * h2(x)
    const h1 = this.hash(item, 0x811c9dc5);
    const h2 = this.hash(item, 0xc4ceb9fe);
    for (let i = 0; i < this.numHashes; i++) {
      pos.push(Math.abs((h1 + i * h2) % this.numBits));
    }
    return pos;
  }

  private setBit(pos: number): void {
    const byteIdx = Math.floor(pos / 8);
    const bitIdx = pos % 8;
    this.bits[byteIdx]! |= 1 << bitIdx;
  }

  private getBit(pos: number): boolean {
    const byteIdx = Math.floor(pos / 8);
    const bitIdx = pos % 8;
    return ((this.bits[byteIdx]! >> bitIdx) & 1) === 1;
  }

  // Add item to filter
  add(item: string): void {
    for (const pos of this.positions(item)) {
      this.setBit(pos);
    }
    this._count++;
  }

  // Test if item might be in the filter (false positives possible, no false negatives)
  mightContain(item: string): boolean {
    for (const pos of this.positions(item)) {
      if (!this.getBit(pos)) return false;
    }
    return true;
  }

  // Estimated number of items added (based on set bits)
  get estimatedCount(): number {
    let setBits = 0;
    for (const byte of this.bits) {
      setBits += this.popcount(byte);
    }
    // n = -(m/k) * ln(1 - X/m) where X = set bits
    const ratio = setBits / this.numBits;
    if (ratio >= 1) return this._count;
    return Math.round((-this.numBits / this.numHashes) * Math.log(1 - ratio));
  }

  private popcount(n: number): number {
    let count = 0;
    while (n) {
      count += n & 1;
      n >>>= 1;
    }
    return count;
  }

  // Merge two bloom filters (union) - must have same params
  merge(other: BloomFilter): BloomFilter {
    if (this.numBits !== other.numBits || this.numHashes !== other.numHashes) {
      throw new Error('Cannot merge bloom filters with different parameters');
    }
    const merged = new BloomFilter({ numBits: this.numBits, numHashes: this.numHashes });
    for (let i = 0; i < this.bits.length; i++) {
      merged.bits[i] = (this.bits[i]! | other.bits[i]!) as number;
    }
    merged._count = this._count + other._count;
    return merged;
  }

  // Serialize to base64 string
  serialize(): string {
    const meta = JSON.stringify({ numBits: this.numBits, numHashes: this.numHashes, count: this._count });
    const metaBytes = new TextEncoder().encode(meta);
    const combined = new Uint8Array(4 + metaBytes.length + this.bits.length);
    const view = new DataView(combined.buffer);
    view.setUint32(0, metaBytes.length, false);
    combined.set(metaBytes, 4);
    combined.set(this.bits, 4 + metaBytes.length);
    return btoa(String.fromCharCode(...combined));
  }

  // Deserialize from base64 string
  static deserialize(data: string): BloomFilter {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const metaLen = view.getUint32(0, false);
    const metaBytes = bytes.slice(4, 4 + metaLen);
    const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as {
      numBits: number;
      numHashes: number;
      count: number;
    };
    const filter = new BloomFilter({ numBits: meta.numBits, numHashes: meta.numHashes });
    filter.bits.set(bytes.slice(4 + metaLen));
    filter._count = meta.count;
    return filter;
  }

  get info(): { numBits: number; numHashes: number; addedCount: number } {
    return {
      numBits: this.numBits,
      numHashes: this.numHashes,
      addedCount: this._count,
    };
  }
}
