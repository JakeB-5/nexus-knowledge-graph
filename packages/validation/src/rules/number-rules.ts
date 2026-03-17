// Number validation rules

import type { ValidationRule } from "../types.js";

export function min(minimum: number, message?: string): ValidationRule<number> {
  return {
    name: "min",
    message: message ?? "Must be at least {min}",
    params: { min: minimum },
    validate: (value) => typeof value === "number" && value >= minimum,
  };
}

export function max(maximum: number, message?: string): ValidationRule<number> {
  return {
    name: "max",
    message: message ?? "Must be at most {max}",
    params: { max: maximum },
    validate: (value) => typeof value === "number" && value <= maximum,
  };
}

export function integer(message?: string): ValidationRule<number> {
  return {
    name: "integer",
    message: message ?? "Must be an integer",
    params: {},
    validate: (value) => typeof value === "number" && Number.isInteger(value),
  };
}

export function positive(message?: string): ValidationRule<number> {
  return {
    name: "positive",
    message: message ?? "Must be a positive number",
    params: {},
    validate: (value) => typeof value === "number" && value > 0,
  };
}

export function negative(message?: string): ValidationRule<number> {
  return {
    name: "negative",
    message: message ?? "Must be a negative number",
    params: {},
    validate: (value) => typeof value === "number" && value < 0,
  };
}

export function between(
  minimum: number,
  maximum: number,
  message?: string
): ValidationRule<number> {
  return {
    name: "between",
    message: message ?? "Must be between {min} and {max}",
    params: { min: minimum, max: maximum },
    validate: (value) =>
      typeof value === "number" && value >= minimum && value <= maximum,
  };
}

export function multipleOf(factor: number, message?: string): ValidationRule<number> {
  return {
    name: "multipleOf",
    message: message ?? "Must be a multiple of {factor}",
    params: { factor },
    validate: (value) => {
      if (typeof value !== "number") return false;
      // Avoid floating-point errors by rounding
      return Math.round(value / factor) * factor === value;
    },
  };
}

export function precision(digits: number, message?: string): ValidationRule<number> {
  return {
    name: "precision",
    message: message ?? "Must have at most {digits} decimal places",
    params: { digits },
    validate: (value) => {
      if (typeof value !== "number") return false;
      const str = value.toString();
      const dot = str.indexOf(".");
      if (dot === -1) return true;
      return str.length - dot - 1 <= digits;
    },
  };
}

export function finite(message?: string): ValidationRule<number> {
  return {
    name: "finite",
    message: message ?? "Must be a finite number",
    params: {},
    validate: (value) => typeof value === "number" && Number.isFinite(value),
  };
}

export function nonZero(message?: string): ValidationRule<number> {
  return {
    name: "nonZero",
    message: message ?? "Must not be zero",
    params: {},
    validate: (value) => typeof value === "number" && value !== 0,
  };
}
