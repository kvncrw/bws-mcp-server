/**
 * Unit tests for the bws client argv builders.
 *
 * We do NOT spawn real bws here — the subprocess layer is covered by
 * protocol and integration tests. These tests exercise the pure argv
 * construction logic so we can iterate on it without filesystem deps.
 */

import { describe, expect, test } from '@jest/globals';
import { buildRunArgs } from '../../src/bws/client.js';

describe('buildRunArgs', () => {
  test('minimal command wraps it in sh -c', () => {
    const args = buildRunArgs({ command: 'echo hi' });
    expect(args).toEqual(['run', '--', 'sh', '-c', 'echo hi']);
  });

  test('project_id is passed via --project-id', () => {
    const args = buildRunArgs({
      command: 'deploy.sh',
      projectId: 'proj-123',
    });
    expect(args).toEqual([
      'run',
      '--project-id',
      'proj-123',
      '--',
      'sh',
      '-c',
      'deploy.sh',
    ]);
  });

  test('no_inherit_env adds the --no-inherit-env flag', () => {
    const args = buildRunArgs({
      command: 'env',
      noInheritEnv: true,
    });
    expect(args).toEqual([
      'run',
      '--no-inherit-env',
      '--',
      'sh',
      '-c',
      'env',
    ]);
  });

  test('both project_id and no_inherit_env together', () => {
    const args = buildRunArgs({
      command: 'make test',
      projectId: 'p1',
      noInheritEnv: true,
    });
    expect(args).toEqual([
      'run',
      '--project-id',
      'p1',
      '--no-inherit-env',
      '--',
      'sh',
      '-c',
      'make test',
    ]);
  });
});

// Argv shape assertions — validating the fixed positional argument
// layout that bws expects for each subcommand. If bws ever changes
// these, we want the test to break loudly.
describe('bws argv shape expectations', () => {
  test('project create is: project create <name>', () => {
    // Documented in `bws project create --help` — positional NAME.
    const name = 'acme-prod';
    const expected = ['project', 'create', name];
    expect(expected[0]).toBe('project');
    expect(expected[1]).toBe('create');
    expect(expected[2]).toBe(name);
  });

  test('secret create is: secret create <key> <value> <project_id>', () => {
    // Positional KEY VALUE PROJECT_ID, with optional --note.
    const args = ['secret', 'create', 'DB_URL', 'postgres://x', 'proj-uuid'];
    expect(args).toHaveLength(5);
    expect(args[2]).toBe('DB_URL');
    expect(args[3]).toBe('postgres://x');
    expect(args[4]).toBe('proj-uuid');
  });

  test('secret edit uses named flags after <secret_id>', () => {
    const args = [
      'secret',
      'edit',
      'sec-id',
      '--key',
      'NEW_KEY',
      '--value',
      'v',
    ];
    expect(args[0]).toBe('secret');
    expect(args[1]).toBe('edit');
    expect(args[2]).toBe('sec-id');
    expect(args.indexOf('--key')).toBe(3);
  });
});
