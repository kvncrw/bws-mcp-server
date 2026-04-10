/**
 * Protocol E2E: tools/call against the real server process using a
 * real stub bws binary (tests/protocol/fixtures/bws-stub.sh). Every
 * case exercises the full round trip: JSON-RPC over stdio → handler
 * → spawn(bws) → parsed result → JSON-RPC response.
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

interface CallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

describe('tools/call against stub bws', () => {
  let harness: McpHarness;

  beforeAll(() => {
    if (!existsSync(DIST_ENTRY)) {
      throw new Error(
        `dist/index.js not found. Run 'npm run build' before protocol tests.`,
      );
    }
  });

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  afterAll(async () => {
    if (harness) await harness.stop();
  });

  async function call(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<CallResult> {
    const resp = await harness.request('tools/call', {
      name,
      arguments: args,
    });
    if (resp.error) {
      throw new Error(`rpc error: ${resp.error.message}`);
    }
    return resp.result as CallResult;
  }

  test('bws_status reports version and project count', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_status');
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(payload['token_set']).toBe(true);
    expect(payload['bws_version']).toBe('bws 99.99.99-stub');
    expect(payload['api_reachable']).toBe(true);
    expect(payload['visible_project_count']).toBe(1);
  });

  test('bws_project_list returns the stub project array', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_project_list');
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]!.text) as Array<{
      id: string;
      name: string;
    }>;
    expect(payload).toHaveLength(1);
    expect(payload[0]?.id).toBe('proj-stub-1');
  });

  test('bws_project_get forwards id to bws', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_project_get', { id: 'proj-stub-1' });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]!.text) as { id: string };
    expect(payload.id).toBe('proj-stub-1');
  });

  test('bws_project_create returns a project', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_project_create', { name: 'new-proj' });
    expect(result.isError).toBeFalsy();
  });

  test('bws_project_delete without confirm is rejected', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_project_delete', { id: 'proj-stub-1' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('confirm');
  });

  test('bws_project_delete with confirm=true passes through', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_project_delete', {
      id: 'proj-stub-1',
      confirm: true,
    });
    expect(result.isError).toBeFalsy();
  });

  test('bws_secret_list redacts values by default', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_secret_list');
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]!.text) as Array<{
      value: string;
      note: string;
    }>;
    expect(payload[0]?.value).toBe('[REDACTED]');
    expect(payload[0]?.note).toBe('[REDACTED]');
  });

  test('bws_secret_list with include_values=true returns real values', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_secret_list', { include_values: true });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]!.text) as Array<{
      value: string;
    }>;
    expect(payload[0]?.value).toBe('stub-value');
  });

  test('bws_secret_create requires key, value, project_id', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const bad = await call('bws_secret_create', { key: 'K' });
    expect(bad.isError).toBe(true);

    const good = await call('bws_secret_create', {
      key: 'STUB_KEY',
      value: 'v',
      project_id: 'proj-stub-1',
    });
    expect(good.isError).toBeFalsy();
  });

  test('bws_secret_edit requires at least one field', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const bad = await call('bws_secret_edit', { id: 'sec-stub-1' });
    expect(bad.isError).toBe(true);

    const good = await call('bws_secret_edit', {
      id: 'sec-stub-1',
      value: 'new',
    });
    expect(good.isError).toBeFalsy();
  });

  test('bws_secret_delete without confirm is rejected', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_secret_delete', { id: 'sec-stub-1' });
    expect(result.isError).toBe(true);
  });

  test('bws_secret_delete with confirm=true passes', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_secret_delete', {
      id: 'sec-stub-1',
      confirm: true,
    });
    expect(result.isError).toBeFalsy();
  });

  test('bws_run without confirm is rejected', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_run', { command: 'echo hi' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('confirm');
  });

  test('bws_run with confirm runs the command through the stub', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const result = await call('bws_run', {
      command: 'echo stub-ok',
      confirm: true,
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]!.text) as {
      stdout: string;
      exit_code: number;
    };
    expect(payload.exit_code).toBe(0);
    expect(payload.stdout).toContain('stub-ok');
  });

  test('unknown tool returns an error response, not a crash', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const resp = await harness.request('tools/call', {
      name: 'bws_does_not_exist',
      arguments: {},
    });
    const result = resp.result as CallResult;
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Unknown tool');
  });

  test('bws_status with BWS_ACCESS_TOKEN unset reports token_set=false', async () => {
    harness = new McpHarness();
    await harness.start({ BWS_ACCESS_TOKEN: undefined });
    await harness.initialize();

    const result = await call('bws_status');
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(payload['token_set']).toBe(false);
    expect(payload['api_reachable']).toBe(false);
  });
});
