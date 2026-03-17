// Built-in template helpers/block helpers
import type { HelperFn, TemplateContext } from './types.js';

// if/else is handled natively in the parser/compiler as IfNode
// These helpers are for use as function-style helpers in expressions

export const ifHelper: HelperFn = (_context, args, body, elseBody) => {
  const condition = args[0];
  if (condition) {
    return body ? body() : '';
  }
  return elseBody ? elseBody() : '';
};

export const unlessHelper: HelperFn = (_context, args, body, elseBody) => {
  const condition = args[0];
  if (!condition) {
    return body ? body() : '';
  }
  return elseBody ? elseBody() : '';
};

// with helper: change context scope
export const withHelper: HelperFn = (context, args, body) => {
  const scopeObj = args[0];
  if (!body) return '';
  if (typeof scopeObj === 'object' && scopeObj !== null) {
    const newContext: TemplateContext = { ...context, ...(scopeObj as TemplateContext) };
    void newContext;
    return body();
  }
  return body();
};

// raw helper: output without escaping (no-op marker, engine handles)
export const rawHelper: HelperFn = (_context, _args, body) => {
  return body ? body() : '';
};

// log helper: for debugging
export const logHelper: HelperFn = (_context, args) => {
  console.log('[template:log]', ...args);
  return '';
};

// times helper: repeat body N times
export const timesHelper: HelperFn = (_context, args, body) => {
  const n = typeof args[0] === 'number' ? args[0] : parseInt(String(args[0] ?? 0), 10);
  if (!body) return '';
  let out = '';
  for (let i = 0; i < n; i++) {
    out += body();
  }
  return out;
};

// concat helper
export const concatHelper: HelperFn = (_context, args) =>
  args.map((a) => String(a ?? '')).join('');

// eq helper
export const eqHelper: HelperFn = (_context, args, body, elseBody) => {
  const [a, b] = args;
  if (a === b) return body ? body() : 'true';
  return elseBody ? elseBody() : '';
};

// ne helper
export const neHelper: HelperFn = (_context, args, body, elseBody) => {
  const [a, b] = args;
  if (a !== b) return body ? body() : 'true';
  return elseBody ? elseBody() : '';
};

// lookup helper: look up value in object
export const lookupHelper: HelperFn = (_context, args) => {
  const [obj, key] = args;
  if (typeof obj === 'object' && obj !== null && key !== undefined) {
    return String((obj as Record<string, unknown>)[String(key)] ?? '');
  }
  return '';
};

export const builtinHelpers: Record<string, HelperFn> = {
  if: ifHelper,
  unless: unlessHelper,
  with: withHelper,
  raw: rawHelper,
  log: logHelper,
  times: timesHelper,
  concat: concatHelper,
  eq: eqHelper,
  ne: neHelper,
  lookup: lookupHelper,
};
