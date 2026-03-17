/**
 * Core types for the storage abstraction layer.
 */

// Visibility of a stored object
export type StorageVisibility = 'public' | 'private';

// Options when listing objects
export interface ListOptions {
  // Only list objects whose key starts with this prefix
  prefix?: string;
  // Pagination cursor (opaque token from previous ListResult)
  cursor?: string;
  // Maximum number of results to return (default: 100)
  limit?: number;
}

// A single stored object's metadata
export interface StorageObject {
  // Unique storage key (path-like identifier)
  key: string;
  // File size in bytes
  size: number;
  // MIME content type
  contentType: string;
  // When the object was last modified
  lastModified: Date;
  // Arbitrary user-defined metadata
  metadata: Record<string, string>;
}

// Paginated list result
export interface ListResult {
  objects: StorageObject[];
  // Cursor to pass to the next list call; undefined means no more pages
  nextCursor?: string;
  // Whether there are more results
  hasMore: boolean;
}

// Options when putting (writing) an object
export interface PutOptions {
  // MIME content type to assign to the object
  contentType?: string;
  // Arbitrary user-defined metadata
  metadata?: Record<string, string>;
  // Visibility (public vs private); defaults to private
  visibility?: StorageVisibility;
}

// Options when reading an object as a stream
export interface StreamOptions {
  // Byte offset to start reading from
  start?: number;
  // Byte offset to stop reading at (inclusive)
  end?: number;
}

// Result of a put operation
export interface PutResult {
  key: string;
  size: number;
  contentType: string;
  url?: string;
}

// Permission scope for signed URLs
export type SignedUrlPermission = 'read' | 'write';

// Options for generating signed URLs
export interface SignedUrlOptions {
  // Permission granted by this URL
  permission: SignedUrlPermission;
  // How many seconds until the URL expires
  expiresInSeconds: number;
  // Optional additional metadata to embed in the URL
  metadata?: Record<string, string>;
}

// A signed URL with its expiration information
export interface SignedUrl {
  url: string;
  expiresAt: Date;
  permission: SignedUrlPermission;
}

// Core storage provider interface
export interface StorageProvider {
  /**
   * Store data at the given key.
   */
  put(key: string, data: Buffer | Uint8Array | string, options?: PutOptions): Promise<PutResult>;

  /**
   * Retrieve data stored at key.
   * Returns null if the key does not exist.
   */
  get(key: string): Promise<Buffer | null>;

  /**
   * Delete the object at key.
   * Resolves silently if the key does not exist.
   */
  delete(key: string): Promise<void>;

  /**
   * Check whether an object exists at key.
   */
  exists(key: string): Promise<boolean>;

  /**
   * List objects, optionally filtered by prefix and paginated.
   */
  list(options?: ListOptions): Promise<ListResult>;

  /**
   * Return a URL for accessing the object at key.
   * For private objects this may be a signed URL.
   */
  getUrl(key: string): Promise<string>;
}
