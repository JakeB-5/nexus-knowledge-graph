// Test helper utilities: timeouts, polling, temp dirs, console capture, mock server

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';

// ── withTimeout ────────────────────────────────────────────────────────────

/**
 * Fail the test if `fn` takes longer than `ms` milliseconds.
 */
export async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Test timed out after ${ms}ms`)),
      ms
    );

    fn().then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); reject(err as Error); }
    );
  });
}

// ── eventually ────────────────────────────────────────────────────────────

/**
 * Poll `fn` every `intervalMs` until it returns true or `timeoutMs` elapses.
 * Throws if the condition is never met.
 */
export async function eventually(
  fn: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 50
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return;
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

// ── Temp directory ─────────────────────────────────────────────────────────

/**
 * Create a unique temporary directory and return its path.
 */
export function createTempDir(prefix = 'nexus-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Recursively remove a temporary directory.
 * Safe to call even if the directory no longer exists.
 */
export function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── captureConsole ─────────────────────────────────────────────────────────

export interface ConsoleCapture {
  logs: string[];
  errors: string[];
  warns: string[];
  infos: string[];
  restore: () => void;
}

/**
 * Intercept console output for the duration of a test.
 * Call `restore()` in afterEach to undo.
 */
export function captureConsole(): ConsoleCapture {
  const capture: ConsoleCapture = {
    logs: [],
    errors: [],
    warns: [],
    infos: [],
    restore: () => {},
  };

  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalInfo = console.info.bind(console);

  console.log = (...args: unknown[]) => { capture.logs.push(args.map(String).join(' ')); };
  console.error = (...args: unknown[]) => { capture.errors.push(args.map(String).join(' ')); };
  console.warn = (...args: unknown[]) => { capture.warns.push(args.map(String).join(' ')); };
  console.info = (...args: unknown[]) => { capture.infos.push(args.map(String).join(' ')); };

  capture.restore = () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  };

  return capture;
}

// ── createMockServer ───────────────────────────────────────────────────────

export interface MockRoute {
  method: string;
  path: string;
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  handler?: (req: IncomingMessage, res: ServerResponse) => void;
}

export interface MockServer {
  url: string;
  port: number;
  close: () => Promise<void>;
  requests: Array<{ method: string; path: string; body: string }>;
}

/**
 * Spin up a lightweight HTTP server for integration testing.
 * Routes are matched in order; unmatched requests return 404.
 */
export async function createMockServer(routes: MockRoute[]): Promise<MockServer> {
  const requests: Array<{ method: string; path: string; body: string }> = [];

  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString();

    requests.push({
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      body,
    });

    const route = routes.find(
      (r) =>
        r.method.toUpperCase() === (req.method ?? 'GET').toUpperCase() &&
        r.path === req.url
    );

    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (route.handler) {
      route.handler(req, res);
      return;
    }

    const responseHeaders = {
      'content-type': 'application/json',
      ...(route.headers ?? {}),
    };

    res.writeHead(route.status ?? 200, responseHeaders);
    res.end(route.body !== undefined ? JSON.stringify(route.body) : '');
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('Failed to get server port'));
      }
    });
  });

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// ── waitFor ────────────────────────────────────────────────────────────────

/**
 * Alias for `eventually` with a more test-idiomatic name.
 */
export const waitFor = eventually;

// ── sleep ─────────────────────────────────────────────────────────────────

/** Simple promise-based delay. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
