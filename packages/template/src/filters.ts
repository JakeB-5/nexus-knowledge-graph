// Built-in template filters
import type { FilterFn } from './types.js';

// ─── String filters ───────────────────────────────────────────────────────────

const upper: FilterFn = (value) => String(value ?? '').toUpperCase();

const lower: FilterFn = (value) => String(value ?? '').toLowerCase();

const capitalize: FilterFn = (value) => {
  const s = String(value ?? '');
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const title: FilterFn = (value) =>
  String(value ?? '').replace(/\b\w/g, (c) => c.toUpperCase());

const trim: FilterFn = (value) => String(value ?? '').trim();

const truncate: FilterFn = (value, length = 255, suffix = '...') => {
  const s = String(value ?? '');
  const len = typeof length === 'number' ? length : 255;
  const suf = typeof suffix === 'string' ? suffix : '...';
  if (s.length <= len) return s;
  return s.slice(0, len - suf.length) + suf;
};

const slugify: FilterFn = (value) =>
  String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const reverse: FilterFn = (value) => {
  if (Array.isArray(value)) return [...value].reverse();
  return String(value ?? '').split('').reverse().join('');
};

const replace: FilterFn = (value, search, replacement = '') => {
  const s = String(value ?? '');
  const searchStr = String(search ?? '');
  const replStr = String(replacement ?? '');
  return s.split(searchStr).join(replStr);
};

const wordcount: FilterFn = (value) =>
  String(value ?? '').trim().split(/\s+/).filter(Boolean).length;

// ─── Number filters ───────────────────────────────────────────────────────────

const round: FilterFn = (value, precision = 0) => {
  const n = Number(value);
  const p = typeof precision === 'number' ? precision : 0;
  const factor = Math.pow(10, p);
  return Math.round(n * factor) / factor;
};

const floor: FilterFn = (value) => Math.floor(Number(value));

const ceil: FilterFn = (value) => Math.ceil(Number(value));

const abs: FilterFn = (value) => Math.abs(Number(value));

const format: FilterFn = (value, decimals = 2) => {
  const n = Number(value);
  const d = typeof decimals === 'number' ? decimals : 2;
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};

// ─── Date filters ─────────────────────────────────────────────────────────────

const dateFormat: FilterFn = (value, fmt = 'YYYY-MM-DD') => {
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  const fmtStr = typeof fmt === 'string' ? fmt : 'YYYY-MM-DD';
  return fmtStr
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('DD', String(d.getDate()).padStart(2, '0'))
    .replace('HH', String(d.getHours()).padStart(2, '0'))
    .replace('mm', String(d.getMinutes()).padStart(2, '0'))
    .replace('ss', String(d.getSeconds()).padStart(2, '0'));
};

const relative: FilterFn = (value) => {
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return dateFormat(value) as string;
};

const iso: FilterFn = (value) => {
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return d.toISOString();
};

// ─── Array filters ────────────────────────────────────────────────────────────

const sort: FilterFn = (value, key?) => {
  if (!Array.isArray(value)) return value;
  return [...value].sort((a, b) => {
    const av = key ? (a as Record<string, unknown>)[String(key)] : a;
    const bv = key ? (b as Record<string, unknown>)[String(key)] : b;
    if (av === bv) return 0;
    return String(av) < String(bv) ? -1 : 1;
  });
};

const first: FilterFn = (value) => {
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value[0];
  return undefined;
};

const last: FilterFn = (value) => {
  if (Array.isArray(value)) return value[value.length - 1];
  if (typeof value === 'string') return value[value.length - 1];
  return undefined;
};

const join: FilterFn = (value, separator = ', ') => {
  if (!Array.isArray(value)) return String(value ?? '');
  return value.join(String(separator));
};

const length: FilterFn = (value) => {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'object' && value !== null) return Object.keys(value as object).length;
  return 0;
};

const slice: FilterFn = (value, start = 0, end?: unknown) => {
  const s = typeof start === 'number' ? start : 0;
  const e = typeof end === 'number' ? end : undefined;
  if (Array.isArray(value)) return value.slice(s, e);
  if (typeof value === 'string') return value.slice(s, e);
  return value;
};

const unique: FilterFn = (value) => {
  if (!Array.isArray(value)) return value;
  return [...new Set(value)];
};

const mapFilter: FilterFn = (value, attr) => {
  if (!Array.isArray(value)) return value;
  return value.map((item) =>
    attr ? (item as Record<string, unknown>)[String(attr)] : item
  );
};

const filterFilter: FilterFn = (value, attr, test?: unknown) => {
  if (!Array.isArray(value)) return value;
  return value.filter((item) => {
    const val = attr ? (item as Record<string, unknown>)[String(attr)] : item;
    if (test !== undefined) return val === test;
    return Boolean(val);
  });
};

// ─── Object filters ───────────────────────────────────────────────────────────

const keys: FilterFn = (value) => {
  if (typeof value === 'object' && value !== null) return Object.keys(value as object);
  return [];
};

const values: FilterFn = (value) => {
  if (typeof value === 'object' && value !== null) return Object.values(value as object);
  return [];
};

const entries: FilterFn = (value) => {
  if (typeof value === 'object' && value !== null) return Object.entries(value as object);
  return [];
};

const json: FilterFn = (value, indent = 2) => {
  const spaces = typeof indent === 'number' ? indent : 2;
  return JSON.stringify(value, null, spaces);
};

// ─── HTML filters ─────────────────────────────────────────────────────────────

const escape: FilterFn = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const unescape: FilterFn = (value) =>
  String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");

const striptags: FilterFn = (value) =>
  String(value ?? '').replace(/<[^>]*>/g, '');

const nl2br: FilterFn = (value) =>
  String(value ?? '').replace(/\n/g, '<br>\n');

const urlize: FilterFn = (value) =>
  String(value ?? '').replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1">$1</a>'
  );

// ─── Utility filters ──────────────────────────────────────────────────────────

const defaultFilter: FilterFn = (value, fallback = '') =>
  value === null || value === undefined || value === '' ? fallback : value;

const safe: FilterFn = (value) => value; // marks as safe — engine should not re-escape

export const builtinFilters: Record<string, FilterFn> = {
  upper,
  lower,
  capitalize,
  title,
  trim,
  truncate,
  slugify,
  reverse,
  replace,
  wordcount,
  round,
  floor,
  ceil,
  abs,
  format,
  date: dateFormat,
  dateFormat,
  relative,
  iso,
  sort,
  first,
  last,
  join,
  length,
  count: length,
  slice,
  unique,
  map: mapFilter,
  filter: filterFilter,
  keys,
  values,
  entries,
  json,
  escape,
  e: escape,
  unescape,
  striptags,
  nl2br,
  urlize,
  default: defaultFilter,
  d: defaultFilter,
  safe,
};
