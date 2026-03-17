// Date validation rules

import type { ValidationRule } from "../types.js";

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function isDate(message?: string): ValidationRule<unknown> {
  return {
    name: "isDate",
    message: message ?? "Must be a valid date",
    params: {},
    validate: (value) => toDate(value) !== null,
  };
}

export function isFuture(message?: string): ValidationRule<unknown> {
  return {
    name: "isFuture",
    message: message ?? "Must be a future date",
    params: {},
    validate: (value) => {
      const d = toDate(value);
      return d !== null && d.getTime() > Date.now();
    },
  };
}

export function isPast(message?: string): ValidationRule<unknown> {
  return {
    name: "isPast",
    message: message ?? "Must be a past date",
    params: {},
    validate: (value) => {
      const d = toDate(value);
      return d !== null && d.getTime() < Date.now();
    },
  };
}

export function before(date: Date | string, message?: string): ValidationRule<unknown> {
  const limit = toDate(date);
  return {
    name: "before",
    message: message ?? "Must be before {date}",
    params: { date: String(date) },
    validate: (value) => {
      if (!limit) return false;
      const d = toDate(value);
      return d !== null && d.getTime() < limit.getTime();
    },
  };
}

export function after(date: Date | string, message?: string): ValidationRule<unknown> {
  const limit = toDate(date);
  return {
    name: "after",
    message: message ?? "Must be after {date}",
    params: { date: String(date) },
    validate: (value) => {
      if (!limit) return false;
      const d = toDate(value);
      return d !== null && d.getTime() > limit.getTime();
    },
  };
}

export function betweenDates(
  start: Date | string,
  end: Date | string,
  message?: string
): ValidationRule<unknown> {
  const startDate = toDate(start);
  const endDate = toDate(end);
  return {
    name: "betweenDates",
    message: message ?? "Must be between {start} and {end}",
    params: { start: String(start), end: String(end) },
    validate: (value) => {
      if (!startDate || !endDate) return false;
      const d = toDate(value);
      if (!d) return false;
      return d.getTime() >= startDate.getTime() && d.getTime() <= endDate.getTime();
    },
  };
}

export function isWeekday(message?: string): ValidationRule<unknown> {
  return {
    name: "isWeekday",
    message: message ?? "Must be a weekday (Monday–Friday)",
    params: {},
    validate: (value) => {
      const d = toDate(value);
      if (!d) return false;
      const day = d.getDay();
      return day >= 1 && day <= 5;
    },
  };
}

export function isWeekend(message?: string): ValidationRule<unknown> {
  return {
    name: "isWeekend",
    message: message ?? "Must be a weekend day",
    params: {},
    validate: (value) => {
      const d = toDate(value);
      if (!d) return false;
      const day = d.getDay();
      return day === 0 || day === 6;
    },
  };
}
