// Array validation rules

import type { ValidationRule } from "../types.js";

export function minItems(min: number, message?: string): ValidationRule<unknown[]> {
  return {
    name: "minItems",
    message: message ?? "Must have at least {min} items",
    params: { min },
    validate: (value) => Array.isArray(value) && value.length >= min,
  };
}

export function maxItems(max: number, message?: string): ValidationRule<unknown[]> {
  return {
    name: "maxItems",
    message: message ?? "Must have at most {max} items",
    params: { max },
    validate: (value) => Array.isArray(value) && value.length <= max,
  };
}

export function unique(message?: string): ValidationRule<unknown[]> {
  return {
    name: "unique",
    message: message ?? "All items must be unique",
    params: {},
    validate: (value) => {
      if (!Array.isArray(value)) return false;
      const serialized = value.map((item) => JSON.stringify(item));
      return new Set(serialized).size === serialized.length;
    },
  };
}

export function contains<T>(
  item: T,
  message?: string
): ValidationRule<T[]> {
  return {
    name: "contains",
    message: message ?? "Must contain the required item",
    params: { item: JSON.stringify(item) },
    validate: (value) => {
      if (!Array.isArray(value)) return false;
      const target = JSON.stringify(item);
      return value.some((v) => JSON.stringify(v) === target);
    },
  };
}

export function every<T>(
  predicate: (item: T) => boolean,
  message?: string
): ValidationRule<T[]> {
  return {
    name: "every",
    message: message ?? "All items must satisfy the condition",
    params: {},
    validate: (value) => {
      if (!Array.isArray(value)) return false;
      return (value as T[]).every(predicate);
    },
  };
}

export function some<T>(
  predicate: (item: T) => boolean,
  message?: string
): ValidationRule<T[]> {
  return {
    name: "some",
    message: message ?? "At least one item must satisfy the condition",
    params: {},
    validate: (value) => {
      if (!Array.isArray(value)) return false;
      return (value as T[]).some(predicate);
    },
  };
}

export function exactItems(count: number, message?: string): ValidationRule<unknown[]> {
  return {
    name: "exactItems",
    message: message ?? `Must have exactly ${count} items`,
    params: { count },
    validate: (value) => Array.isArray(value) && value.length === count,
  };
}

export function noEmpty(message?: string): ValidationRule<unknown[]> {
  return {
    name: "noEmpty",
    message: message ?? "Array must not be empty",
    params: {},
    validate: (value) => Array.isArray(value) && value.length > 0,
  };
}
