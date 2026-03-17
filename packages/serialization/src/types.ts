// Core types for the serialization package

export enum SerializationFormat {
  JSON = 'json',
  Binary = 'binary',
  MessagePack = 'msgpack',
}

export type SchemaVersion = string;

export type MigrationFn<TFrom = unknown, TTo = unknown> = (
  data: TFrom,
  fromVersion: SchemaVersion,
  toVersion: SchemaVersion,
) => TTo;

export interface Serializer<T = unknown> {
  serialize(value: T): Uint8Array | string;
  deserialize(data: Uint8Array | string): T;
}

export interface TypedSerializer<T = unknown> {
  serialize(value: T): Uint8Array;
  deserialize(data: Uint8Array): T;
}

export interface SerializerOptions {
  prettyPrint?: boolean;
  includeTypeInfo?: boolean;
  schemaVersion?: SchemaVersion;
}

export interface SerializationResult<T = unknown> {
  data: Uint8Array | string;
  format: SerializationFormat;
  schemaVersion?: SchemaVersion;
  byteSize: number;
  compressionRatio?: number;
}

export interface CustomTypeHandler<T = unknown> {
  typeName: string;
  isType: (value: unknown) => value is T;
  serialize: (value: T) => unknown;
  deserialize: (raw: unknown) => T;
}

export interface CompressionInfo {
  method: string;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

export interface SchemaDefinition {
  version: SchemaVersion;
  validate?: (data: unknown) => boolean;
  migrations?: Record<SchemaVersion, MigrationFn>;
}
