/**
 * Integration tests for `bws run` against REAL BSM.
 */

import { afterEach, describe, expect, test } from '@jest/globals';
import {
  createSecret,
  deleteSecret,
  runWithSecrets,
} from '../../src/bws/client.js';
import {
  integrationEnabled,
  integrationEnv,
  logSkipReason,
} from './helpers.js';

const maybe = integrationEnabled() ? describe : describe.skip;

maybe('real BSM — bws run', () => {
  const created: string[] = [];

  afterEach(async () => {
    const { config } = integrationEnv('cleanup-run');
    while (created.length > 0) {
      const id = created.pop()!;
      try {
        await deleteSecret(config, id);
      } catch {
        // swallow
      }
    }
  });

  test('bws run injects a freshly-created secret as an env var', async () => {
    const { config, projectId, keyPrefix } = integrationEnv('run-inject');
    // Secret keys in bws run become env var names — make sure it's a
    // valid POSIX identifier.
    const envKey = keyPrefix.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const secret = await createSecret(
      config,
      envKey,
      'injected-value-42',
      projectId,
    );
    created.push(secret.id);

    // Use `printenv VAR` directly — no shell, no eval. This is the safest
    // way to read a single env var and matches the new argv-only API of
    // runWithSecrets / bws_run.
    const result = await runWithSecrets(config, {
      argv: ['printenv', envKey],
      projectId,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('injected-value-42');
  });

  test('bws run with no_inherit_env still gets the injected secret', async () => {
    const { config, projectId, keyPrefix } = integrationEnv('run-clean-env');
    const envKey = keyPrefix.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const secret = await createSecret(
      config,
      envKey,
      'clean-env-marker',
      projectId,
    );
    created.push(secret.id);

    const result = await runWithSecrets(config, {
      argv: ['printenv', envKey],
      projectId,
      noInheritEnv: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('clean-env-marker');
  });
});

if (!integrationEnabled()) {
  logSkipReason('run integration');
}
