// JSON serializer with advanced features: Date handling, BigInt, Map/Set,
// circular reference detection, custom type handlers, streaming, and pretty-print.

import type { CustomTypeHandler, SerializerOptions } from './types.js';

interface SerializedSpecial {
  __type: string;
  value: unknown;
}

interface CircularRef {
  __circular: true;
  path: string;
}

function isSerializedSpecial(v: unknown): v is SerializedSpecial {
  return (
    typeof v === 'object' &&
    v !== null &&
    '__type' in v &&
    'value' in v
  );
}

function isCircularRef(v: unknown): v is CircularRef {
  return (
    typeof v === 'object' &&
    v !== null &&
    '__circular' in v &&
    (v as Record<string, unknown>)['__circular'] === true
  );
}

export class JSONSerializer {
  private customHandlers: Map<string, CustomTypeHandler> = new Map();
  private options: Required<SerializerOptions>;

  constructor(options: SerializerOptions = {}) {
    this.options = {
      prettyPrint: options.prettyPrint ?? false,
      includeTypeInfo: options.includeTypeInfo ?? false,
      schemaVersion: options.schemaVersion ?? '1.0',
    };
  }

  // Register a custom type handler for serialize/deserialize
  registerType<T>(handler: CustomTypeHandler<T>): void {
    this.customHandlers.set(handler.typeName, handler as CustomTypeHandler);
  }

  serialize(value: unknown): string {
    const seen = new Map<object, string>();
    const replacer = (key: string, val: unknown, path: string): unknown => {
      if (val === null) return null;

      if (typeof val === 'object') {
        const existingPath = seen.get(val as object);
        if (existingPath !== undefined) {
          const ref: CircularRef = { __circular: true, path: existingPath };
          return ref;
        }
        seen.set(val as object, path);
      }

      // BigInt
      if (typeof val === 'bigint') {
        const s: SerializedSpecial = { __type: 'BigInt', value: val.toString() };
        return s;
      }

      // Date
      if (val instanceof Date) {
        const s: SerializedSpecial = { __type: 'Date', value: val.toISOString() };
        return s;
      }

      // Map
      if (val instanceof Map) {
        const entries: Array<[unknown, unknown]> = [];
        for (const [k, v] of val) {
          entries.push([k, v]);
        }
        const s: SerializedSpecial = { __type: 'Map', value: entries };
        return s;
      }

      // Set
      if (val instanceof Set) {
        const s: SerializedSpecial = { __type: 'Set', value: Array.from(val) };
        return s;
      }

      // Uint8Array / Buffer
      if (val instanceof Uint8Array) {
        const s: SerializedSpecial = {
          __type: 'Uint8Array',
          value: Array.from(val),
        };
        return s;
      }

      // Custom handlers
      for (const handler of this.customHandlers.values()) {
        if (handler.isType(val)) {
          const s: SerializedSpecial = {
            __type: handler.typeName,
            value: handler.serialize(val),
          };
          return s;
        }
      }

      return val;
    };

    // Custom stringify that tracks path
    const result = this.stringifyWithPath(value, replacer);
    return this.options.prettyPrint
      ? JSON.stringify(JSON.parse(result) as unknown, null, 2)
      : result;
  }

  private stringifyWithPath(
    root: unknown,
    replacer: (key: string, val: unknown, path: string) => unknown,
  ): string {
    const seen = new Map<object, string>();

    const processValue = (val: unknown, path: string): unknown => {
      if (val === null || typeof val !== 'object') {
        if (typeof val === 'bigint') {
          return replacer('', val, path);
        }
        return val;
      }

      const existingPath = seen.get(val);
      if (existingPath !== undefined) {
        return { __circular: true, path: existingPath };
      }
      seen.set(val, path);

      const replaced = replacer('', val, path);
      if (replaced !== val) {
        // Value was transformed, process the result
        return processValue(replaced, path);
      }

      if (Array.isArray(val)) {
        return val.map((item, i) => processValue(item, `${path}[${i}]`));
      }

      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        obj[k] = processValue(v, path ? `${path}.${k}` : k);
      }
      return obj;
    };

    return JSON.stringify(processValue(root, ''));
  }

  deserialize<T = unknown>(json: string): T {
    const parsed = JSON.parse(json) as unknown;
    return this.revive(parsed) as T;
  }

  private revive(val: unknown): unknown {
    if (val === null || typeof val !== 'object') return val;

    if (isCircularRef(val)) {
      // Return placeholder for circular refs (full resolution requires root reference)
      return '[Circular]';
    }

    if (isSerializedSpecial(val)) {
      return this.reviveSpecial(val);
    }

    if (Array.isArray(val)) {
      return val.map((item) => this.revive(item));
    }

    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      obj[k] = this.revive(v);
    }
    return obj;
  }

  private reviveSpecial(s: SerializedSpecial): unknown {
    switch (s.__type) {
      case 'BigInt':
        return BigInt(s.value as string);
      case 'Date':
        return new Date(s.value as string);
      case 'Map': {
        const map = new Map<unknown, unknown>();
        for (const [k, v] of s.value as Array<[unknown, unknown]>) {
          map.set(this.revive(k), this.revive(v));
        }
        return map;
      }
      case 'Set': {
        const set = new Set<unknown>();
        for (const item of s.value as unknown[]) {
          set.add(this.revive(item));
        }
        return set;
      }
      case 'Uint8Array':
        return new Uint8Array(s.value as number[]);
      default: {
        const handler = this.customHandlers.get(s.__type);
        if (handler) {
          return handler.deserialize(s.value);
        }
        return s;
      }
    }
  }

  // Streaming JSON parser for large files (line-delimited JSON / JSON array)
  async *parseStream(
    source: AsyncIterable<string>,
  ): AsyncGenerator<unknown> {
    let buffer = '';
    let depth = 0;
    let inString = false;
    let escape = false;
    let start = 0;

    for await (const chunk of source) {
      buffer += chunk;

      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch === undefined) continue;

        if (escape) {
          escape = false;
          continue;
        }

        if (inString) {
          if (ch === '\\') escape = true;
          else if (ch === '"') inString = false;
          continue;
        }

        if (ch === '"') {
          inString = true;
        } else if (ch === '{' || ch === '[') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === '}' || ch === ']') {
          depth--;
          if (depth === 0 && i > start) {
            const jsonStr = buffer.slice(start, i + 1);
            try {
              yield this.deserialize(jsonStr);
            } catch {
              // skip malformed
            }
            buffer = buffer.slice(i + 1);
            i = -1;
            start = 0;
          }
        }
      }
    }

    // Try remainder as line-delimited JSON
    const lines = buffer.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          yield this.deserialize(trimmed);
        } catch {
          // skip
        }
      }
    }
  }
}
