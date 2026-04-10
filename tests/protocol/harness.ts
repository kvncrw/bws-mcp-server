/**
 * Minimal JSON-RPC-over-stdio harness for talking to a built
 * bws-mcp-server subprocess. No SDK client dependency — we speak
 * the protocol directly so the tests also validate wire format.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { chmodSync } from 'fs';
import { resolve } from 'path';

// Jest runs from the repo root; resolve relative to cwd so we don't
// have to mess with import.meta vs __dirname polyfills.
const repoRoot = process.cwd();

export const DIST_ENTRY = resolve(repoRoot, 'dist', 'index.js');
export const STUB_DIR = resolve(
  repoRoot,
  'tests',
  'protocol',
  'fixtures',
);
export const STUB_PATH = resolve(STUB_DIR, 'bws-stub.sh');

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpHarness {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private pending = new Map<
    number | string,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }
  >();
  private nextId = 1;

  async start(
    env: Record<string, string | undefined> = {},
  ): Promise<void> {
    // Ensure the stub is executable (git may preserve the bit, but
    // protocol tests should not rely on that assumption).
    try {
      chmodSync(STUB_PATH, 0o755);
    } catch {
      // Best effort — if it fails, the spawn will show the real error.
    }

    // Prepend the stub dir to PATH so `bws` resolves to our script.
    // We also export BWS_BINARY to the stub path directly so the client
    // wrapper picks it up without needing a named file on PATH.
    const base: Record<string, string> = {
      PATH: `${STUB_DIR}:${process.env['PATH'] ?? '/usr/bin'}`,
      HOME: process.env['HOME'] ?? '/tmp',
      BWS_BINARY: STUB_PATH,
      BWS_ACCESS_TOKEN: 'stub-token',
    };
    // Overrides: explicit undefined removes the key entirely.
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) {
        delete base[k];
      } else {
        base[k] = v;
      }
    }
    const mergedEnv = base;

    this.child = spawn('node', [DIST_ENTRY], {
      env: mergedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      this.drain();
    });

    this.child.stderr.on('data', (chunk: Buffer) => {
      // Swallow — server logs "running on stdio" here.
      void chunk;
    });

    this.child.on('exit', () => {
      for (const [, p] of this.pending) {
        p.reject(new Error('server exited before response'));
      }
      this.pending.clear();
    });
  }

  private drain(): void {
    // The MCP SDK's stdio transport is newline-delimited JSON (one
    // JSON-RPC message per line).
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line.length === 0) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line) as JsonRpcResponse;
      } catch {
        continue;
      }
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        p.resolve(msg);
      }
    }
  }

  request(method: string, params?: unknown): Promise<JsonRpcResponse> {
    if (!this.child) {
      return Promise.reject(new Error('harness not started'));
    }
    const id = this.nextId++;
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };
    const payload = JSON.stringify(req) + '\n';
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child!.stdin.write(payload);
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`request ${method} timed out`));
        }
      }, 10000);
      timer.unref();
    });
  }

  notify(method: string, params?: unknown): void {
    if (!this.child) return;
    const msg = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    };
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }

  async initialize(): Promise<void> {
    const resp = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'bws-mcp-test-harness', version: '0.0.0' },
    });
    if (resp.error) {
      throw new Error(`initialize failed: ${resp.error.message}`);
    }
    this.notify('notifications/initialized');
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    this.child.stdin.end();
    await new Promise<void>((resolve) => {
      this.child!.on('exit', () => resolve());
      const killTimer = setTimeout(() => {
        try {
          this.child?.kill('SIGKILL');
        } catch {
          // Nothing to do.
        }
        resolve();
      }, 2000);
      killTimer.unref();
    });
    this.child = null;
  }
}
