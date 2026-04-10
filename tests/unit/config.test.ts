/**
 * Unit tests for env-based config loading. No mocks, no subprocesses —
 * we just feed synthetic env objects into loadConfig directly.
 */

import { describe, expect, test } from '@jest/globals';
import { buildSpawnEnv, loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  test('returns undefined for all fields when env is empty', () => {
    const cfg = loadConfig({});
    expect(cfg.accessToken).toBeUndefined();
    expect(cfg.serverUrl).toBeUndefined();
    expect(cfg.defaultProjectId).toBeUndefined();
    expect(cfg.stateFile).toBeUndefined();
    expect(cfg.bwsBinary).toBe('bws');
  });

  test('reads BWS_ACCESS_TOKEN, BWS_SERVER_URL, BWS_DEFAULT_PROJECT_ID', () => {
    const cfg = loadConfig({
      BWS_ACCESS_TOKEN: 'tok_abc',
      BWS_SERVER_URL: 'https://self.hosted/api',
      BWS_DEFAULT_PROJECT_ID: 'proj-uuid',
    });
    expect(cfg.accessToken).toBe('tok_abc');
    expect(cfg.serverUrl).toBe('https://self.hosted/api');
    expect(cfg.defaultProjectId).toBe('proj-uuid');
  });

  test('BWS_BINARY override is honored', () => {
    const cfg = loadConfig({ BWS_BINARY: '/opt/bws/bws' });
    expect(cfg.bwsBinary).toBe('/opt/bws/bws');
  });
});

describe('buildSpawnEnv', () => {
  test('forwards only the bws-relevant vars plus PATH and HOME', () => {
    const cfg = loadConfig({
      BWS_ACCESS_TOKEN: 'tok',
      BWS_SERVER_URL: 'https://x',
    });
    const env = buildSpawnEnv(cfg, {
      PATH: '/usr/bin',
      HOME: '/home/tester',
      UNRELATED: 'leak-me',
      SECRET: 'nope',
    });
    expect(env['PATH']).toBe('/usr/bin');
    expect(env['HOME']).toBe('/home/tester');
    expect(env['BWS_ACCESS_TOKEN']).toBe('tok');
    expect(env['BWS_SERVER_URL']).toBe('https://x');
    expect(env['UNRELATED']).toBeUndefined();
    expect(env['SECRET']).toBeUndefined();
  });

  test('omits optional vars when unset', () => {
    const cfg = loadConfig({});
    const env = buildSpawnEnv(cfg, {
      PATH: '/usr/bin',
      HOME: '/home/tester',
    });
    expect(env['BWS_ACCESS_TOKEN']).toBeUndefined();
    expect(env['BWS_SERVER_URL']).toBeUndefined();
    expect(env['BWS_STATE_FILE']).toBeUndefined();
  });

  test('forwards BWS_STATE_FILE when set', () => {
    const cfg = loadConfig({ BWS_STATE_FILE: '/var/lib/bws/state' });
    const env = buildSpawnEnv(cfg, { PATH: '/usr/bin', HOME: '/home/x' });
    expect(env['BWS_STATE_FILE']).toBe('/var/lib/bws/state');
  });
});
