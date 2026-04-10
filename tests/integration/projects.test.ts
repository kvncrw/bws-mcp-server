/**
 * Integration tests for project operations against REAL BSM.
 *
 * These are skipped unless BWS_ACCESS_TOKEN_TEST is set. On CI this
 * happens via the `integration.yml` workflow, pulling the token from
 * GitHub secrets.
 */

import { afterAll, describe, expect, test } from '@jest/globals';
import {
  createProject,
  deleteProject,
  editProject,
  getProject,
  listProjects,
} from '../../src/bws/client.js';
import {
  integrationEnabled,
  integrationEnv,
  logSkipReason,
} from './helpers.js';

const maybe = integrationEnabled() ? describe : describe.skip;

maybe('real BSM — project round trip', () => {
  const createdProjectIds: string[] = [];

  afterAll(async () => {
    const { config } = integrationEnv('cleanup-projects');
    for (const id of createdProjectIds) {
      try {
        await deleteProject(config, id);
      } catch {
        // Best effort.
      }
    }
  });

  test('list returns the configured test project', async () => {
    const { config, projectId } = integrationEnv('list');
    const projects = await listProjects(config);
    const found = projects.find((p) => p.id === projectId);
    expect(found).toBeDefined();
  });

  test('create → get → edit → delete round trip', async () => {
    const { config, keyPrefix } = integrationEnv('crud');
    const name = `${keyPrefix}-proj`;
    const created = await createProject(config, name);
    createdProjectIds.push(created.id);
    expect(created.name).toBe(name);

    const fetched = await getProject(config, created.id);
    expect(fetched.id).toBe(created.id);

    const renamed = await editProject(config, created.id, `${name}-renamed`);
    expect(renamed.name).toBe(`${name}-renamed`);

    await deleteProject(config, created.id);
    createdProjectIds.pop();
  });
});

if (!integrationEnabled()) {
  logSkipReason('projects integration');
}
