// Logger package tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, createLogger } from '../logger.js';
import { LogLevel } from '../types.js';
import { MemoryTransport } from '../transports/memory.js';
import { JsonFormatter } from '../formatters/json.js';
import { PrettyFormatter } from '../formatters/pretty.js';

function makeLogger(level = LogLevel.Trace): { logger: Logger; mem: MemoryTransport } {
  const mem = new MemoryTransport();
  const logger = createLogger({
    name: 'test',
    level,
    transports: [mem],
    formatter: new JsonFormatter(),
  });
  return { logger, mem };
}

// ── Basic logging ────────────────────────────────────────────────────────────

describe('Logger - basic logging', () => {
  it('logs at each level', () => {
    const { logger, mem } = makeLogger();
    logger.trace('trace msg');
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');
    logger.fatal('fatal msg');
    expect(mem.size).toBe(6);
  });

  it('records the correct level on each entry', () => {
    const { logger, mem } = makeLogger();
    logger.info('hello');
    const [entry] = mem.getAll();
    expect(entry?.entry.level).toBe(LogLevel.Info);
    expect(entry?.entry.message).toBe('hello');
  });

  it('captures timestamp as a Date', () => {
    const { logger, mem } = makeLogger();
    const before = new Date();
    logger.info('ts test');
    const after = new Date();
    const ts = mem.getAll()[0]?.entry.timestamp;
    expect(ts).toBeInstanceOf(Date);
    expect(ts!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ts!.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ── Level filtering ──────────────────────────────────────────────────────────

describe('Logger - level filtering', () => {
  it('suppresses entries below the configured level', () => {
    const { logger, mem } = makeLogger(LogLevel.Warn);
    logger.debug('should be dropped');
    logger.info('should be dropped');
    logger.warn('should appear');
    logger.error('should appear');
    expect(mem.size).toBe(2);
  });

  it('isLevelEnabled returns false for suppressed levels', () => {
    const { logger } = makeLogger(LogLevel.Error);
    expect(logger.isLevelEnabled(LogLevel.Debug)).toBe(false);
    expect(logger.isLevelEnabled(LogLevel.Error)).toBe(true);
    expect(logger.isLevelEnabled(LogLevel.Fatal)).toBe(true);
  });
});

// ── Lazy evaluation ──────────────────────────────────────────────────────────

describe('Logger - lazy message evaluation', () => {
  it('does not call the factory when level is suppressed', () => {
    const { logger } = makeLogger(LogLevel.Error);
    const factory = vi.fn(() => 'expensive message');
    logger.debug(factory);
    expect(factory).not.toHaveBeenCalled();
  });

  it('calls the factory when level is enabled', () => {
    const { logger, mem } = makeLogger(LogLevel.Debug);
    logger.debug(() => 'lazy value');
    expect(mem.getAll()[0]?.entry.message).toBe('lazy value');
  });
});

// ── Context ──────────────────────────────────────────────────────────────────

describe('Logger - context', () => {
  it('merges bound context into every entry', () => {
    const mem = new MemoryTransport();
    const logger = createLogger({
      name: 'ctx-test',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: new JsonFormatter(),
      context: { service: 'api', region: 'us-east-1' },
    });
    logger.info('hello', { requestId: '123' });
    const ctx = mem.getAll()[0]?.entry.context;
    expect(ctx?.['service']).toBe('api');
    expect(ctx?.['region']).toBe('us-east-1');
    expect(ctx?.['requestId']).toBe('123');
  });
});

// ── Redaction ────────────────────────────────────────────────────────────────

describe('Logger - redaction', () => {
  it('redacts configured sensitive fields', () => {
    const mem = new MemoryTransport();
    const logger = createLogger({
      name: 'redact-test',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: new JsonFormatter(),
      redaction: { fields: ['password', 'secret'], replacement: '[REDACTED]' },
    });
    logger.info('login', { password: 'super-secret', user: 'alice' });
    const ctx = mem.getAll()[0]?.entry.context;
    expect(ctx?.['password']).toBe('[REDACTED]');
    expect(ctx?.['user']).toBe('alice');
  });
});

// ── Child logger ─────────────────────────────────────────────────────────────

describe('Logger - child loggers', () => {
  it('inherits parent context', () => {
    const mem = new MemoryTransport();
    const parent = createLogger({
      name: 'parent',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: new JsonFormatter(),
      context: { app: 'nexus' },
    });
    const child = parent.child('child', { module: 'auth' });
    child.info('child msg');
    const ctx = mem.getAll()[0]?.entry.context;
    expect(ctx?.['app']).toBe('nexus');
    expect(ctx?.['module']).toBe('auth');
  });

  it('child and parent write to the same transport', () => {
    const mem = new MemoryTransport();
    const parent = createLogger({
      name: 'parent',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: new JsonFormatter(),
    });
    const child = parent.child('child');
    parent.info('from parent');
    child.info('from child');
    expect(mem.size).toBe(2);
  });
});

// ── Timer ────────────────────────────────────────────────────────────────────

describe('Logger - timer utility', () => {
  it('logs durationMs when stopped', () => {
    const { logger, mem } = makeLogger();
    const timer = logger.startTimer('db query');
    timer.stop();
    const entries = mem.getAll();
    const last = entries[entries.length - 1];
    expect(last?.entry.message).toContain('db query');
    expect(last?.entry.context['durationMs']).toBeTypeOf('number');
  });
});

// ── Request context ──────────────────────────────────────────────────────────

describe('Logger - request context', () => {
  it('attaches traceId and spanId to entries', () => {
    const { logger, mem } = makeLogger();
    logger.setRequestContext({ traceId: 'trace-abc', spanId: 'span-001' });
    logger.info('traced request');
    const entry = mem.getAll()[0]?.entry;
    expect(entry?.traceId).toBe('trace-abc');
    expect(entry?.spanId).toBe('span-001');
  });

  it('clears request context', () => {
    const { logger, mem } = makeLogger();
    logger.setRequestContext({ traceId: 'trace-abc', spanId: 'span-001' });
    logger.clearRequestContext();
    logger.info('no trace');
    const entry = mem.getAll()[0]?.entry;
    expect(entry?.traceId).toBeUndefined();
  });
});

// ── MemoryTransport ring buffer ───────────────────────────────────────────────

describe('MemoryTransport - ring buffer', () => {
  it('caps at capacity', () => {
    const mem = new MemoryTransport({ capacity: 3 });
    const logger = createLogger({
      name: 'ring',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: new JsonFormatter(),
    });
    for (let i = 0; i < 10; i++) logger.info(`msg ${i}`);
    expect(mem.size).toBe(3);
  });

  it('returns entries in insertion order after wrap', () => {
    const mem = new MemoryTransport({ capacity: 3 });
    const logger = createLogger({
      name: 'ring2',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: new JsonFormatter(),
    });
    for (let i = 0; i < 5; i++) logger.info(`msg ${i}`);
    const messages = mem.getAll().map((s) => s.entry.message);
    expect(messages).toEqual(['msg 2', 'msg 3', 'msg 4']);
  });

  it('getByLevel filters correctly', () => {
    const mem = new MemoryTransport();
    const logger = createLogger({
      name: 'level-q',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: new JsonFormatter(),
    });
    logger.debug('d1');
    logger.info('i1');
    logger.warn('w1');
    const warns = mem.getByLevel(LogLevel.Warn);
    expect(warns).toHaveLength(1);
    expect(warns[0]?.entry.message).toBe('w1');
  });

  it('search finds by substring', () => {
    const mem = new MemoryTransport();
    const logger = createLogger({
      name: 'search',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: new JsonFormatter(),
    });
    logger.info('user logged in');
    logger.info('payment processed');
    const results = mem.search('payment');
    expect(results).toHaveLength(1);
    expect(results[0]?.entry.message).toContain('payment');
  });
});

// ── JsonFormatter ────────────────────────────────────────────────────────────

describe('JsonFormatter', () => {
  it('produces valid JSON', () => {
    const fmt = new JsonFormatter();
    const mem = new MemoryTransport();
    const logger = createLogger({
      name: 'json',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: fmt,
    });
    logger.info('hello', { x: 1 });
    const formatted = mem.getAll()[0]?.formatted ?? '';
    const parsed = JSON.parse(formatted);
    expect(parsed.message).toBe('hello');
    expect(parsed.level).toBe('info');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('includes error details', () => {
    const fmt = new JsonFormatter();
    const mem = new MemoryTransport();
    const logger = createLogger({
      name: 'json-err',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: fmt,
    });
    logger.error('oops', new Error('boom'));
    const formatted = mem.getAll()[0]?.formatted ?? '';
    const parsed = JSON.parse(formatted);
    expect(parsed.error.message).toBe('boom');
  });
});

// ── PrettyFormatter ──────────────────────────────────────────────────────────

describe('PrettyFormatter', () => {
  it('produces a string containing the message', () => {
    const fmt = new PrettyFormatter(false);
    const mem = new MemoryTransport();
    const logger = createLogger({
      name: 'pretty',
      level: LogLevel.Trace,
      transports: [mem],
      formatter: fmt,
    });
    logger.info('pretty message');
    const formatted = mem.getAll()[0]?.formatted ?? '';
    expect(formatted).toContain('pretty message');
    expect(formatted).toContain('INFO');
  });
});

// ── Transport management ─────────────────────────────────────────────────────

describe('Logger - transport management', () => {
  it('adds and removes transports', () => {
    const { logger, mem } = makeLogger();
    const mem2 = new MemoryTransport({ name: 'mem2' });
    logger.addTransport(mem2);
    logger.info('both');
    expect(mem.size).toBe(1);
    expect(mem2.size).toBe(1);
    const removed = logger.removeTransport('mem2');
    expect(removed).toBe(true);
    logger.info('only first');
    expect(mem.size).toBe(2);
    expect(mem2.size).toBe(1); // not incremented
  });
});
