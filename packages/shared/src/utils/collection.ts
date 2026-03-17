/**
 * Collection utility functions for the Nexus platform.
 */

/**
 * Split an array into chunks of the given size.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) throw new RangeError("chunk size must be positive");
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Group array elements by a key derived from each element.
 */
export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  key: (item: T) => K,
): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of array) {
    const k = key(item);
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}

/**
 * Sort an array by a key function, with optional order.
 */
export function sortBy<T>(
  array: T[],
  key: (item: T) => string | number | Date,
  order: "asc" | "desc" = "asc",
): T[] {
  return [...array].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const va = ka instanceof Date ? ka.getTime() : ka;
    const vb = kb instanceof Date ? kb.getTime() : kb;
    if (va < vb) return order === "asc" ? -1 : 1;
    if (va > vb) return order === "asc" ? 1 : -1;
    return 0;
  });
}

/**
 * Return a new array with duplicate primitive values removed.
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Return a new array with duplicates removed, comparing by a key function.
 */
export function uniqueBy<T>(array: T[], key: (item: T) => unknown): T[] {
  const seen = new Set<unknown>();
  return array.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Partition an array into two arrays: [passes, fails] based on a predicate.
 */
export function partition<T>(
  array: T[],
  predicate: (item: T) => boolean,
): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of array) {
    (predicate(item) ? pass : fail).push(item);
  }
  return [pass, fail];
}

/**
 * Flatten a nested array up to the given depth (default: 1).
 */
export function flatten<T>(nestedArray: unknown[], depth = 1): T[] {
  return nestedArray.flat(depth) as T[];
}

/**
 * Zip multiple arrays together into an array of tuples.
 * Length is determined by the shortest input array.
 */
export function zip<T extends unknown[][]>(
  ...arrays: { [K in keyof T]: T[K] }
): { [K in keyof T]: T[K] extends (infer U)[] ? U : never }[] {
  const minLength = Math.min(...arrays.map((a) => a.length));
  return Array.from({ length: minLength }, (_, i) =>
    arrays.map((a) => a[i]),
  ) as { [K in keyof T]: T[K] extends (infer U)[] ? U : never }[];
}

/**
 * Return the intersection of two arrays (elements present in both).
 */
export function intersection<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => setB.has(item));
}

/**
 * Return the union of two arrays (all unique elements).
 */
export function union<T>(a: T[], b: T[]): T[] {
  return unique([...a, ...b]);
}

/**
 * Return elements present in the first array but not in the second.
 */
export function difference<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => !setB.has(item));
}

/**
 * Remove null and undefined values from an array.
 */
export function compact<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((item): item is T => item !== null && item !== undefined);
}

/**
 * Generate a numeric range array from start (inclusive) to end (exclusive).
 */
export function range(start: number, end: number, step = 1): number[] {
  if (step === 0) throw new RangeError("step cannot be zero");
  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) result.push(i);
  } else {
    for (let i = start; i > end; i += step) result.push(i);
  }
  return result;
}

/**
 * Shuffle an array using the Fisher-Yates algorithm.
 * Returns a new shuffled array.
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Return n random elements from the array (without replacement).
 */
export function sample<T>(array: T[], n: number): T[] {
  if (n >= array.length) return shuffle(array);
  const shuffled = shuffle(array);
  return shuffled.slice(0, n);
}

/**
 * Count the occurrences of each element.
 * Returns a Map from element to count.
 */
export function frequencies<T>(array: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const item of array) {
    map.set(item, (map.get(item) ?? 0) + 1);
  }
  return map;
}
