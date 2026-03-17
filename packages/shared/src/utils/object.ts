/**
 * Object utility functions for the Nexus platform.
 */

/**
 * Deep clone an object using structuredClone.
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Recursively merge source into target, returning a new object.
 * Arrays are replaced (not merged).
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = result[key as string];
    if (
      sourceVal !== null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key as string] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      result[key as string] = sourceVal;
    }
  }
  return result as T;
}

/**
 * Return a new object containing only the specified keys.
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

/**
 * Return a new object with the specified keys removed.
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * Return a new object with keys transformed by the given function.
 */
export function mapKeys<V>(
  obj: Record<string, V>,
  fn: (key: string, value: V) => string,
): Record<string, V> {
  const result: Record<string, V> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[fn(key, value)] = value;
  }
  return result;
}

/**
 * Return a new object with values transformed by the given function.
 */
export function mapValues<V, W>(
  obj: Record<string, V>,
  fn: (value: V, key: string) => W,
): Record<string, W> {
  const result: Record<string, W> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = fn(value, key);
  }
  return result;
}

/**
 * Flatten a nested object into a single-level object using a separator.
 * e.g. { a: { b: 1 } } -> { "a.b": 1 }
 */
export function flattenObject(
  obj: Record<string, unknown>,
  separator = ".",
  prefix = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}${separator}${key}` : key;
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length > 0
    ) {
      const nested = flattenObject(value as Record<string, unknown>, separator, newKey);
      Object.assign(result, nested);
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

/**
 * Unflatten a flat object back to a nested structure using a separator.
 * e.g. { "a.b": 1 } -> { a: { b: 1 } }
 */
export function unflattenObject(
  obj: Record<string, unknown>,
  separator = ".",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split(separator);
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    const lastPart = parts[parts.length - 1]!;
    current[lastPart] = value;
  }
  return result;
}

/**
 * Deep equality check between two values.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => isEqual(item, b[i]));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) =>
    isEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  );
}

export interface ObjectDiff {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { from: unknown; to: unknown }>;
}

/**
 * Compute the shallow difference between two objects.
 * Returns added keys, removed keys, and changed key-value pairs.
 */
export function diff(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): ObjectDiff {
  const added: Record<string, unknown> = {};
  const removed: Record<string, unknown> = {};
  const changed: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(b)) {
    if (!(key in a)) {
      added[key] = b[key];
    } else if (!isEqual(a[key], b[key])) {
      changed[key] = { from: a[key], to: b[key] };
    }
  }
  for (const key of Object.keys(a)) {
    if (!(key in b)) {
      removed[key] = a[key];
    }
  }
  return { added, removed, changed };
}
