/**
 * Protocol E2E: initialize handshake.
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals';
import { existsSync } from 'fs';
import { McpHarness, DIST_ENTRY } from './harness.js';

describe('MCP initialize handshake', () => {
  beforeAll(() => {
    if (!existsSync(DIST_ENTRY)) {
      throw new Error(
        `dist/index.js not found at ${DIST_ENTRY}. Run 'npm run build' before protocol tests.`,
      );
    }
  });

  let harness: McpHarness;

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  afterAll(async () => {
    if (harness) await harness.stop();
  });

  test('server responds to initialize with tools capability', async () => {
    harness = new McpHarness();
    await harness.start();

    const resp = await harness.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });

    expect(resp.error).toBeUndefined();
    expect(resp.result).toBeDefined();
    const result = resp.result as {
      serverInfo: { name: string; version: string };
      capabilities: { tools?: unknown };
    };
    expect(result.serverInfo.name).toBe('bws-mcp-server');
    expect(result.serverInfo.version).toBe('0.1.0');
    expect(result.capabilities.tools).toBeDefined();
  });

  test('initialized notification does not error', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    // If notifications/initialized errored, the next request would fail.
    const resp = await harness.request('tools/list');
    expect(resp.error).toBeUndefined();
  });
});
