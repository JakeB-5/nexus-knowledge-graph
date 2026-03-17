/**
 * ImageProcessor - parse image metadata from raw bytes without external dependencies.
 *
 * Supported formats: PNG, JPEG, GIF, WebP
 * Provides: dimensions, content type validation, file size validation,
 *           thumbnail placeholder SVG generation.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageMetadata {
  format: 'png' | 'jpeg' | 'gif' | 'webp' | 'unknown';
  width: number;
  height: number;
  contentType: string;
  sizeBytes: number;
  /** Whether the format was successfully parsed */
  parsed: boolean;
}

// Allowed image content types
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

// Maximum allowed image size (50 MB)
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

export class ImageProcessor {
  private readonly maxSizeBytes: number;

  constructor(maxSizeBytes = DEFAULT_MAX_SIZE_BYTES) {
    this.maxSizeBytes = maxSizeBytes;
  }

  /**
   * Extract metadata from image bytes.
   */
  extractMetadata(data: Buffer): ImageMetadata {
    const sizeBytes = data.length;
    const format = this.detectFormat(data);

    let width = 0;
    let height = 0;
    let parsed = false;
    let contentType = 'application/octet-stream';

    try {
      switch (format) {
        case 'png': {
          const dims = this.parsePNG(data);
          width = dims.width;
          height = dims.height;
          contentType = 'image/png';
          parsed = true;
          break;
        }
        case 'jpeg': {
          const dims = this.parseJPEG(data);
          width = dims.width;
          height = dims.height;
          contentType = 'image/jpeg';
          parsed = true;
          break;
        }
        case 'gif': {
          const dims = this.parseGIF(data);
          width = dims.width;
          height = dims.height;
          contentType = 'image/gif';
          parsed = true;
          break;
        }
        case 'webp': {
          const dims = this.parseWebP(data);
          width = dims.width;
          height = dims.height;
          contentType = 'image/webp';
          parsed = true;
          break;
        }
        default:
          break;
      }
    } catch {
      // Parsing failed; leave dimensions at 0
    }

    return { format, width, height, contentType, sizeBytes, parsed };
  }

  /**
   * Detect image format from magic bytes.
   */
  detectFormat(data: Buffer): ImageMetadata['format'] {
    if (data.length < 4) return 'unknown';

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47
    ) {
      return 'png';
    }

    // JPEG: FF D8 FF
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      return 'jpeg';
    }

    // GIF: 47 49 46 38
    if (
      data[0] === 0x47 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x38
    ) {
      return 'gif';
    }

    // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
    if (
      data.length >= 12 &&
      data[0] === 0x52 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x46 &&
      data[8] === 0x57 &&
      data[9] === 0x45 &&
      data[10] === 0x42 &&
      data[11] === 0x50
    ) {
      return 'webp';
    }

    return 'unknown';
  }

  /**
   * Parse PNG IHDR chunk for dimensions.
   * PNG spec: 8-byte sig, then IHDR chunk at byte 8.
   * IHDR: 4 len + 4 "IHDR" + 4 width + 4 height + ...
   */
  private parsePNG(data: Buffer): ImageDimensions {
    if (data.length < 24) throw new Error('PNG: too short');
    // IHDR data starts at offset 16 (8 sig + 4 len + 4 type)
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return { width, height };
  }

  /**
   * Parse JPEG dimensions from SOF markers.
   * SOF0 (0xFFC0), SOF1 (0xFFC1), SOF2 (0xFFC2), etc.
   */
  private parseJPEG(data: Buffer): ImageDimensions {
    let offset = 2; // skip FF D8

    while (offset < data.length - 8) {
      if (data[offset] !== 0xff) {
        throw new Error('JPEG: marker sync lost');
      }

      const marker = data[offset + 1];
      // SOF markers: C0..C3, C5..C7, C9..CB, CD..CF
      const isSOF =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSOF) {
        // SOF segment: FF xx [2-byte len] [1-byte precision] [2-byte height] [2-byte width]
        const height = data.readUInt16BE(offset + 5);
        const width = data.readUInt16BE(offset + 7);
        return { width, height };
      }

      // Skip this segment
      const segLen = data.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }

    throw new Error('JPEG: SOF marker not found');
  }

  /**
   * Parse GIF header for dimensions.
   * GIF header: 6-byte signature + 2-byte width + 2-byte height (little-endian)
   */
  private parseGIF(data: Buffer): ImageDimensions {
    if (data.length < 10) throw new Error('GIF: too short');
    const width = data.readUInt16LE(6);
    const height = data.readUInt16LE(8);
    return { width, height };
  }

  /**
   * Parse WebP dimensions from VP8, VP8L, or VP8X chunks.
   * RIFF[4] + size[4] + WEBP[4] + chunk_type[4] + chunk_size[4] + chunk_data
   */
  private parseWebP(data: Buffer): ImageDimensions {
    if (data.length < 30) throw new Error('WebP: too short');

    const chunkType = data.toString('ascii', 12, 16);

    if (chunkType === 'VP8 ') {
      // Lossy VP8: frame tag (3 bytes) + start code (3 bytes) + width/height (each 2 bytes with scale bits)
      // Data starts at offset 20 (12 RIFF header + 4 chunk type + 4 chunk size)
      if (data.length < 30) throw new Error('WebP VP8: too short');
      const w = data.readUInt16LE(26) & 0x3fff;
      const h = data.readUInt16LE(28) & 0x3fff;
      return { width: w, height: h };
    }

    if (chunkType === 'VP8L') {
      // Lossless VP8L: signature byte (0x2f) then packed width/height (14 bits each)
      if (data.length < 25) throw new Error('WebP VP8L: too short');
      // Chunk data starts at 20; skip 1-byte signature
      const b0 = data[21]!;
      const b1 = data[22]!;
      const b2 = data[23]!;
      const b3 = data[24]!;
      const bits = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >>> 14) & 0x3fff) + 1;
      return { width, height };
    }

    if (chunkType === 'VP8X') {
      // Extended WebP: flags(4) + width_minus_1(3 bytes LE) + height_minus_1(3 bytes LE)
      if (data.length < 30) throw new Error('WebP VP8X: too short');
      const width = (data[24]! | (data[25]! << 8) | (data[26]! << 16)) + 1;
      const height = (data[27]! | (data[28]! << 8) | (data[29]! << 16)) + 1;
      return { width, height };
    }

    throw new Error(`WebP: unknown chunk type "${chunkType}"`);
  }

  /**
   * Validate that the content type is an allowed image type.
   */
  validateContentType(contentType: string): boolean {
    return ALLOWED_CONTENT_TYPES.has(contentType);
  }

  /**
   * Validate file size is within allowed limit.
   */
  validateFileSize(sizeBytes: number): { valid: boolean; reason?: string } {
    if (sizeBytes <= 0) {
      return { valid: false, reason: 'File is empty' };
    }
    if (sizeBytes > this.maxSizeBytes) {
      return {
        valid: false,
        reason: `File size ${sizeBytes} exceeds limit of ${this.maxSizeBytes} bytes`,
      };
    }
    return { valid: true };
  }

  /**
   * Generate a placeholder SVG thumbnail for an image.
   * Renders the format label and dimensions in a neutral grey box.
   */
  generateThumbnailSVG(
    metadata: Pick<ImageMetadata, 'format' | 'width' | 'height'>,
    thumbWidth = 200,
    thumbHeight = 200,
  ): string {
    const label = metadata.format.toUpperCase();
    const dims =
      metadata.width > 0 && metadata.height > 0
        ? `${metadata.width}×${metadata.height}`
        : 'unknown size';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${thumbWidth}" height="${thumbHeight}" viewBox="0 0 ${thumbWidth} ${thumbHeight}">
  <rect width="${thumbWidth}" height="${thumbHeight}" fill="#e5e7eb" rx="4"/>
  <rect x="2" y="2" width="${thumbWidth - 4}" height="${thumbHeight - 4}" fill="none" stroke="#9ca3af" stroke-width="1" rx="3"/>
  <text x="${thumbWidth / 2}" y="${thumbHeight / 2 - 10}" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" fill="#6b7280" text-anchor="middle">${label}</text>
  <text x="${thumbWidth / 2}" y="${thumbHeight / 2 + 14}" font-family="system-ui, sans-serif" font-size="12" fill="#9ca3af" text-anchor="middle">${dims}</text>
</svg>`;
  }
}
