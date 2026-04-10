/**
 * bws_run — execute a shell command with selected secrets injected as env vars.
 *
 * This is the most powerful tool we expose. It's a thin wrapper around
 * `bws run` which hands the child process an environment populated from
 * the BSM project. We gate every call behind `confirm: true` because the
 * model could ask us to run anything.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { runWithSecrets } from '../bws/client.js';
import {
  errorResult,
  okResult,
  requireConfirm,
  type ToolHandlerResult,
} from './types.js';

export const runSchema = z.object({
  command: z.string().min(1, 'command is required'),
  project_id: z.string().optional(),
  no_inherit_env: z.boolean().optional().default(false),
  confirm: z.literal(true, {
    errorMap: () => ({
      message: 'confirm must be true to run a shell command via bws run',
    }),
  }),
});

export const runTool: Tool = {
  name: 'bws_run',
  description:
    'Execute a shell command with project secrets injected as environment variables, using `bws run`. EXECUTION — requires { "confirm": true }. The model can invoke arbitrary commands through this tool, so treat it like `bash` in terms of blast radius. Use project_id to scope which secrets get injected; set no_inherit_env: true to start from a clean environment. Returns stdout, stderr, and exit code.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description:
          'Shell command to execute (passed to `sh -c`). Example: "deploy.sh --env staging" or "psql -c \\"SELECT 1\\"".',
      },
      project_id: {
        type: 'string',
        description:
          'Optional project UUID. If set, only secrets from that project are injected.',
      },
      no_inherit_env: {
        type: 'boolean',
        description:
          'When true, does not inherit the MCP server process environment — only the injected secrets are passed.',
      },
      confirm: {
        type: 'boolean',
        description:
          'Must be literally true to authorize command execution.',
      },
    },
    required: ['command', 'confirm'],
    additionalProperties: false,
  },
};

export async function handleRun(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  const gate = requireConfirm(args, 'bws_run');
  if (gate) return gate;

  const parsed = runSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }

  try {
    const input: {
      command: string;
      projectId?: string;
      noInheritEnv?: boolean;
    } = { command: parsed.data.command };
    if (parsed.data.project_id !== undefined) {
      input.projectId = parsed.data.project_id;
    }
    if (parsed.data.no_inherit_env) {
      input.noInheritEnv = true;
    }
    const result = await runWithSecrets(loadConfig(), input);
    return okResult({
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    return errorResult(err);
  }
}
