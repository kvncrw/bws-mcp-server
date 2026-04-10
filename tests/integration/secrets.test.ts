/**
 * Integration tests for secret operations against REAL BSM.
 */

import { afterEach, describe, expect, test } from '@jest/globals';
import {
  createSecret,
  deleteSecret,
  editSecret,
  getSecret,
  listSecrets,
} from '../../src/bws/client.js';
import {
  integrationEnabled,
  integrationEnv,
  logSkipReason,
} from './helpers.js';

const maybe = integrationEnabled() ? describe : describe.skip;

maybe('real BSM — secret round trip', () => {
  const created: string[] = [];

  afterEach(async () => {
    const { config } = integrationEnv('cleanup-secrets');
    while (created.length > 0) {
      const id = created.pop()!;
      try {
        await deleteSecret(config, id);
      } catch {
        // Already gone — swallow.
      }
    }
  });

  test('create → get → edit → list → delete round trip', async () => {
    const { config, projectId, keyPrefix } = integrationEnv('crud');
    const secret = await createSecret(
      config,
      `${keyPrefix}_KEY`,
      'initial-value',
      projectId,
      'integration test note',
    );
    created.push(secret.id);
    expect(secret.key).toBe(`${keyPrefix}_KEY`);
    expect(secret.value).toBe('initial-value');

    const fetched = await getSecret(config, secret.id);
    expect(fetched.id).toBe(secret.id);

    const edited = await editSecret(config, {
      id: secret.id,
      value: 'updated-value',
    });
    expect(edited.value).toBe('updated-value');

    const secrets = await listSecrets(config, projectId);
    expect(secrets.some((s) => s.id === secret.id)).toBe(true);

    await deleteSecret(config, secret.id);
    created.pop();
  });
});

if (!integrationEnabled()) {
  logSkipReason('secrets integration');
}
