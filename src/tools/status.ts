/**
 * bws_status — verify the binary, the token, and basic API reachability.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../config.js';
import { bwsVersion, listProjects } from '../bws/client.js';
import {
  BwsError,
  BwsMissingTokenError,
  BwsNotInstalledError,
} from '../bws/errors.js';
import type { ToolHandlerResult } from './types.js';

export const statusTool: Tool = {
  name: 'bws_status',
  description:
    'Check that the bws CLI is installed, that BWS_ACCESS_TOKEN is set, and that the token can reach the Bitwarden Secrets Manager API. Safe to call at any time. Returns bws version, whether a token is configured, and the project count the token can see.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

export async function handleStatus(): Promise<ToolHandlerResult> {
  const config = loadConfig();
  const report: Record<string, unknown> = {
    bws_binary: config.bwsBinary,
    token_set: Boolean(config.accessToken),
    server_url: config.serverUrl ?? '(default)',
  };

  try {
    report['bws_version'] = await bwsVersion(config);
  } catch (err) {
    if (err instanceof BwsNotInstalledError) {
      return {
        content: [{ type: 'text', text: err.message }],
        isError: true,
      };
    }
    report['bws_version_error'] =
      err instanceof Error ? err.message : String(err);
  }

  if (!config.accessToken) {
    report['api_reachable'] = false;
    report['api_error'] =
      'No BWS_ACCESS_TOKEN set, skipped API reachability check';
    return {
      content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
    };
  }

  try {
    const projects = await listProjects(config);
    report['api_reachable'] = true;
    report['visible_project_count'] = projects.length;
  } catch (err) {
    report['api_reachable'] = false;
    if (err instanceof BwsError || err instanceof BwsMissingTokenError) {
      report['api_error'] = err.message;
    } else {
      report['api_error'] = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
  };
}
