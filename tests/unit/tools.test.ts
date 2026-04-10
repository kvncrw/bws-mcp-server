/**
 * Unit tests for tool-level schema validation and the confirm gate.
 *
 * These tests never spawn bws. They exercise the zod schemas and the
 * requireConfirm helper directly.
 */

import { describe, expect, test } from '@jest/globals';
import {
  projectDeleteSchema,
  projectEditSchema,
  projectCreateSchema,
} from '../../src/tools/projects.js';
import {
  secretCreateSchema,
  secretEditSchema,
  secretDeleteSchema,
  secretListSchema,
  redactSecrets,
} from '../../src/tools/secrets.js';
import { runSchema } from '../../src/tools/run.js';
import { requireConfirm } from '../../src/tools/types.js';
import { allTools } from '../../src/tools/index.js';
import type { BwsSecret } from '../../src/bws/types.js';

describe('requireConfirm gate', () => {
  test('blocks when confirm is missing', () => {
    const result = requireConfirm({}, 'bws_secret_delete');
    expect(result).not.toBeNull();
    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain('confirm');
  });

  test('blocks when confirm is false', () => {
    const result = requireConfirm({ confirm: false }, 'bws_secret_delete');
    expect(result).not.toBeNull();
    expect(result?.isError).toBe(true);
  });

  test('blocks when confirm is the string "true"', () => {
    const result = requireConfirm({ confirm: 'true' }, 'bws_secret_delete');
    expect(result).not.toBeNull();
  });

  test('allows through when confirm is literally true', () => {
    const result = requireConfirm({ confirm: true }, 'bws_secret_delete');
    expect(result).toBeNull();
  });

  test('blocks on undefined args', () => {
    const result = requireConfirm(undefined, 'bws_project_delete');
    expect(result).not.toBeNull();
  });
});

describe('project schemas', () => {
  test('projectCreateSchema requires a name', () => {
    expect(projectCreateSchema.safeParse({}).success).toBe(false);
    expect(projectCreateSchema.safeParse({ name: '' }).success).toBe(false);
    expect(projectCreateSchema.safeParse({ name: 'ok' }).success).toBe(true);
  });

  test('projectEditSchema requires id and name', () => {
    expect(
      projectEditSchema.safeParse({ id: 'a', name: 'b' }).success,
    ).toBe(true);
    expect(projectEditSchema.safeParse({ id: 'a' }).success).toBe(false);
    expect(projectEditSchema.safeParse({ name: 'b' }).success).toBe(false);
  });

  test('projectDeleteSchema rejects confirm=false', () => {
    expect(
      projectDeleteSchema.safeParse({ id: 'a', confirm: false }).success,
    ).toBe(false);
    expect(
      projectDeleteSchema.safeParse({ id: 'a', confirm: true }).success,
    ).toBe(true);
  });
});

describe('secret schemas', () => {
  test('secretCreateSchema requires key, value, project_id', () => {
    expect(
      secretCreateSchema.safeParse({
        key: 'K',
        value: 'V',
        project_id: 'P',
      }).success,
    ).toBe(true);
    expect(
      secretCreateSchema.safeParse({ key: 'K', value: 'V' }).success,
    ).toBe(false);
  });

  test('secretEditSchema requires at least one field to change', () => {
    expect(secretEditSchema.safeParse({ id: 'a' }).success).toBe(false);
    expect(
      secretEditSchema.safeParse({ id: 'a', key: 'K' }).success,
    ).toBe(true);
    expect(
      secretEditSchema.safeParse({ id: 'a', value: 'V' }).success,
    ).toBe(true);
    expect(
      secretEditSchema.safeParse({ id: 'a', project_id: 'P' }).success,
    ).toBe(true);
  });

  test('secretDeleteSchema rejects missing confirm', () => {
    expect(secretDeleteSchema.safeParse({ id: 'a' }).success).toBe(false);
    expect(
      secretDeleteSchema.safeParse({ id: 'a', confirm: true }).success,
    ).toBe(true);
  });

  test('secretListSchema defaults include_values to false', () => {
    const parsed = secretListSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.include_values).toBe(false);
    }
  });

  test('redactSecrets wipes value and note', () => {
    const input: BwsSecret[] = [
      {
        object: 'secret',
        id: 'sec-1',
        organizationId: 'org',
        projectId: 'proj',
        key: 'DB_URL',
        value: 'postgres://real:secret@host/db',
        note: 'prod credentials',
        creationDate: '2026-01-01T00:00:00Z',
        revisionDate: '2026-01-01T00:00:00Z',
      },
    ];
    const out = redactSecrets(input);
    expect(out[0]?.value).toBe('[REDACTED]');
    expect(out[0]?.note).toBe('[REDACTED]');
    expect(out[0]?.key).toBe('DB_URL');
  });
});

describe('run schema', () => {
  test('requires argv and confirm=true', () => {
    expect(runSchema.safeParse({ argv: ['echo'] }).success).toBe(false);
    expect(
      runSchema.safeParse({ argv: ['echo'], confirm: false }).success,
    ).toBe(false);
    expect(
      runSchema.safeParse({ argv: ['echo'], confirm: true }).success,
    ).toBe(true);
  });

  test('empty argv is rejected', () => {
    expect(
      runSchema.safeParse({ argv: [], confirm: true }).success,
    ).toBe(false);
  });

  test('argv must be an array of strings', () => {
    expect(
      runSchema.safeParse({ argv: 'echo hi', confirm: true }).success,
    ).toBe(false);
    expect(
      runSchema.safeParse({ argv: [1, 2, 3], confirm: true }).success,
    ).toBe(false);
  });

  test('optional fields parse when provided', () => {
    const parsed = runSchema.safeParse({
      argv: ['deploy', '--env', 'prod'],
      project_id: 'p1',
      no_inherit_env: true,
      confirm: true,
    });
    expect(parsed.success).toBe(true);
  });

  test('legacy command field is rejected (additionalProperties: false)', () => {
    // Old callers that still pass `command:` instead of `argv:` should
    // get a clean validation failure, not a silent accept.
    expect(
      runSchema.safeParse({ command: 'echo', confirm: true }).success,
    ).toBe(false);
  });
});

describe('tool registry', () => {
  test('exports exactly 12 tools', () => {
    expect(allTools).toHaveLength(12);
  });

  test('all tool names follow the bws_ prefix', () => {
    for (const tool of allTools) {
      expect(tool.name.startsWith('bws_')).toBe(true);
    }
  });

  test('destructive tools declare confirm in their input schema', () => {
    const destructive = [
      'bws_project_delete',
      'bws_secret_delete',
      'bws_run',
    ];
    for (const name of destructive) {
      const tool = allTools.find((t) => t.name === name);
      expect(tool).toBeDefined();
      const required = (
        tool?.inputSchema as { required?: string[] }
      ).required;
      expect(required).toContain('confirm');
    }
  });
});
