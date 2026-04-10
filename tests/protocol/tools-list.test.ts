/**
 * Protocol E2E: tools/list returns all 12 tools with valid schemas.
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

interface ListedTool {
  name: string;
  description: string;
  inputSchema: { type: string; properties?: unknown; required?: string[] };
}

describe('tools/list', () => {
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

  test('returns exactly 12 tools, all prefixed bws_', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const resp = await harness.request('tools/list');
    expect(resp.error).toBeUndefined();
    const result = resp.result as { tools: ListedTool[] };
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools).toHaveLength(12);

    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'bws_project_create',
        'bws_project_delete',
        'bws_project_edit',
        'bws_project_get',
        'bws_project_list',
        'bws_run',
        'bws_secret_create',
        'bws_secret_delete',
        'bws_secret_edit',
        'bws_secret_get',
        'bws_secret_list',
        'bws_status',
      ].sort(),
    );

    for (const tool of result.tools) {
      expect(tool.name.startsWith('bws_')).toBe(true);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  test('destructive tools require confirm in their schema', async () => {
    harness = new McpHarness();
    await harness.start();
    await harness.initialize();

    const resp = await harness.request('tools/list');
    const result = resp.result as { tools: ListedTool[] };
    const destructive = result.tools.filter((t) =>
      ['bws_project_delete', 'bws_secret_delete', 'bws_run'].includes(t.name),
    );
    expect(destructive).toHaveLength(3);
    for (const tool of destructive) {
      expect(tool.inputSchema.required).toContain('confirm');
    }
  });
});
