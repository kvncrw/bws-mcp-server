/**
 * Integration-test helpers. These run against a REAL Bitwarden Secrets
 * Manager project — gated behind env vars so CI and local unit runs
 * don't accidentally call out.
 *
 * Required env:
 *   BWS_ACCESS_TOKEN_TEST  — machine token scoped to a test-only project
 *   BWS_TEST_PROJECT_ID    — project UUID (existing, disposable)
 *
 * Optional env:
 *   BWS_SERVER_URL         — for self-hosted Bitwarden
 */

import { randomUUID } from 'crypto';
import { loadConfig, type BwsConfig } from '../../src/config.js';

export interface IntegrationEnv {
  config: BwsConfig;
  projectId: string;
  keyPrefix: string;
}

export function integrationEnabled(): boolean {
  return Boolean(
    process.env['BWS_ACCESS_TOKEN_TEST'] && process.env['BWS_TEST_PROJECT_ID'],
  );
}

let skipReasonLogged = false;

export function logSkipReason(testName: string): void {
  if (integrationEnabled()) return;
  // Jest silences console.log inside test files unless --verbose is set,
  // but process.stderr.write is always flushed. Only log once per run
  // so we don't spam the reporter with the same message per file.
  if (!skipReasonLogged) {
    process.stderr.write(
      `\n[integration:skip] ${testName} and siblings are skipped — set BWS_ACCESS_TOKEN_TEST and BWS_TEST_PROJECT_ID to run against real BSM\n`,
    );
    skipReasonLogged = true;
  }
}

export function integrationEnv(testName: string): IntegrationEnv {
  const token = process.env['BWS_ACCESS_TOKEN_TEST'];
  const projectId = process.env['BWS_TEST_PROJECT_ID'];
  if (!token || !projectId) {
    throw new Error(
      'integrationEnv called without BWS_ACCESS_TOKEN_TEST / BWS_TEST_PROJECT_ID set',
    );
  }
  // Build a config that uses the test token, not the ambient one.
  const config = loadConfig({
    ...process.env,
    BWS_ACCESS_TOKEN: token,
  });
  const keyPrefix = `mcp-test-${randomUUID().slice(0, 8)}-${testName.replace(/[^a-z0-9]/gi, '-')}`;
  return { config, projectId, keyPrefix };
}
