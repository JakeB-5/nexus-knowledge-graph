/**
 * UploadManager - handles file uploads with chunking, progress tracking,
 * resume support, validation, and concurrency control.
 */

import crypto from 'node:crypto';
import { StorageProvider, PutOptions } from './types.js';

export interface UploadValidationOptions {
  /** Maximum file size in bytes */
  maxSizeBytes?: number;
  /** Allowed MIME content types */
  allowedContentTypes?: string[];
  /** Allowed file extensions (with dot, e.g. ".jpg") */
  allowedExtensions?: string[];
}

export interface ChunkUploadState {
  uploadId: string;
  key: string;
  totalSize: number;
  chunkSize: number;
  uploadedChunks: number[];
  totalChunks: number;
  contentType: string;
  createdAt: Date;
}

export interface UploadProgress {
  uploadId: string;
  key: string;
  bytesUploaded: number;
  totalBytes: number;
  percent: number;
  chunksUploaded: number;
  totalChunks: number;
}

export type ProgressCallback = (progress: UploadProgress) => void;

export interface UploadOptions extends PutOptions {
  /** Chunk size in bytes for multipart uploads (default: 5 MB) */
  chunkSize?: number;
  /** Maximum concurrent chunk uploads (default: 3) */
  concurrency?: number;
  /** Callback invoked after each chunk completes */
  onProgress?: ProgressCallback;
  /** Validation constraints */
  validation?: UploadValidationOptions;
}

export interface UploadResult {
  key: string;
  size: number;
  contentType: string;
  uploadId: string;
}

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_CONCURRENCY = 3;

export class UploadManager {
  private readonly provider: StorageProvider;
  private readonly activeUploads = new Map<string, ChunkUploadState>();

  constructor(provider: StorageProvider) {
    this.provider = provider;
  }

  /**
   * Generate a unique storage key for a file.
   * Format: uploads/<date>/<uuid>/<filename>
   */
  generateKey(filename: string, prefix = 'uploads'): string {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const id = crypto.randomBytes(8).toString('hex');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${prefix}/${date}/${id}/${safeName}`;
  }

  /**
   * Validate a file before uploading.
   */
  validate(
    data: Buffer,
    filename: string,
    contentType: string,
    options: UploadValidationOptions = {},
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (options.maxSizeBytes !== undefined && data.length > options.maxSizeBytes) {
      errors.push(
        `File size ${data.length} exceeds maximum ${options.maxSizeBytes} bytes`,
      );
    }

    if (
      options.allowedContentTypes &&
      options.allowedContentTypes.length > 0 &&
      !options.allowedContentTypes.includes(contentType)
    ) {
      errors.push(
        `Content type "${contentType}" is not allowed. Allowed: ${options.allowedContentTypes.join(', ')}`,
      );
    }

    if (options.allowedExtensions && options.allowedExtensions.length > 0) {
      const ext = '.' + (filename.split('.').pop()?.toLowerCase() ?? '');
      if (!options.allowedExtensions.includes(ext)) {
        errors.push(
          `Extension "${ext}" is not allowed. Allowed: ${options.allowedExtensions.join(', ')}`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Simple single-shot upload for small files.
   */
  async upload(
    key: string,
    data: Buffer,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    const uploadId = crypto.randomBytes(8).toString('hex');
    const contentType = options.contentType ?? 'application/octet-stream';

    if (options.validation) {
      const filename = key.split('/').pop() ?? key;
      const { valid, errors } = this.validate(data, filename, contentType, options.validation);
      if (!valid) {
        throw new Error(`Upload validation failed: ${errors.join('; ')}`);
      }
    }

    const result = await this.provider.put(key, data, options);

    options.onProgress?.({
      uploadId,
      key,
      bytesUploaded: data.length,
      totalBytes: data.length,
      percent: 100,
      chunksUploaded: 1,
      totalChunks: 1,
    });

    return { key: result.key, size: result.size, contentType: result.contentType, uploadId };
  }

  /**
   * Upload a large file in chunks.
   * Chunks are uploaded with limited concurrency and assembled at the end.
   */
  async uploadMultipart(
    key: string,
    data: Buffer,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const contentType = options.contentType ?? 'application/octet-stream';

    if (options.validation) {
      const filename = key.split('/').pop() ?? key;
      const { valid, errors } = this.validate(data, filename, contentType, options.validation);
      if (!valid) {
        throw new Error(`Upload validation failed: ${errors.join('; ')}`);
      }
    }

    const totalChunks = Math.ceil(data.length / chunkSize);
    const uploadId = crypto.randomBytes(8).toString('hex');

    const state: ChunkUploadState = {
      uploadId,
      key,
      totalSize: data.length,
      chunkSize,
      uploadedChunks: [],
      totalChunks,
      contentType,
      createdAt: new Date(),
    };

    this.activeUploads.set(uploadId, state);

    try {
      // Build chunk index array and upload with concurrency limit
      const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
      const chunks: Buffer[] = [];

      // Process chunks in batches
      for (let i = 0; i < chunkIndices.length; i += concurrency) {
        const batch = chunkIndices.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (idx) => {
            const start = idx * chunkSize;
            const end = Math.min(start + chunkSize, data.length);
            const chunk = data.subarray(start, end);
            const chunkKey = `${key}.__parts__/${uploadId}/${idx}`;
            await this.provider.put(chunkKey, chunk, { contentType });
            state.uploadedChunks.push(idx);
            chunks[idx] = chunk;

            const bytesUploaded = state.uploadedChunks.length * chunkSize;
            options.onProgress?.({
              uploadId,
              key,
              bytesUploaded: Math.min(bytesUploaded, data.length),
              totalBytes: data.length,
              percent: Math.round((state.uploadedChunks.length / totalChunks) * 100),
              chunksUploaded: state.uploadedChunks.length,
              totalChunks,
            });
          }),
        );
      }

      // Assemble chunks and write final object
      const assembled = Buffer.concat(chunks);
      const result = await this.provider.put(key, assembled, { contentType, ...options });

      // Clean up chunk objects
      await this.cleanupChunks(uploadId, key, totalChunks);

      return { key: result.key, size: result.size, contentType: result.contentType, uploadId };
    } finally {
      this.activeUploads.delete(uploadId);
    }
  }

  /**
   * Resume a previously interrupted multipart upload.
   * Re-uploads only missing chunks.
   */
  async resumeUpload(
    uploadId: string,
    data: Buffer,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    const state = this.activeUploads.get(uploadId);
    if (!state) {
      throw new Error(`No active upload found with id "${uploadId}"`);
    }

    const { key, chunkSize, totalChunks, contentType } = state;
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

    // Determine which chunks are missing
    const uploaded = new Set(state.uploadedChunks);
    const missing = Array.from({ length: totalChunks }, (_, i) => i).filter(
      (i) => !uploaded.has(i),
    );

    const chunks: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      chunks[i] = data.subarray(start, end);
    }

    // Upload missing chunks
    for (let i = 0; i < missing.length; i += concurrency) {
      const batch = missing.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (idx) => {
          const chunkKey = `${key}.__parts__/${uploadId}/${idx}`;
          await this.provider.put(chunkKey, chunks[idx]!, { contentType });
          state.uploadedChunks.push(idx);
        }),
      );
    }

    // Assemble and finalize
    const assembled = Buffer.concat(chunks);
    const result = await this.provider.put(key, assembled, { contentType });
    await this.cleanupChunks(uploadId, key, totalChunks);
    this.activeUploads.delete(uploadId);

    return { key: result.key, size: result.size, contentType, uploadId };
  }

  private async cleanupChunks(
    uploadId: string,
    key: string,
    totalChunks: number,
  ): Promise<void> {
    await Promise.allSettled(
      Array.from({ length: totalChunks }, (_, i) =>
        this.provider.delete(`${key}.__parts__/${uploadId}/${i}`),
      ),
    );
  }

  /** Return the current state of an active upload. */
  getUploadState(uploadId: string): ChunkUploadState | undefined {
    return this.activeUploads.get(uploadId);
  }

  /** Cancel and clean up an active upload. */
  async cancelUpload(uploadId: string): Promise<void> {
    const state = this.activeUploads.get(uploadId);
    if (!state) return;
    await this.cleanupChunks(uploadId, state.key, state.totalChunks);
    this.activeUploads.delete(uploadId);
  }

  /** List all currently active uploads. */
  listActiveUploads(): ChunkUploadState[] {
    return Array.from(this.activeUploads.values());
  }
}
