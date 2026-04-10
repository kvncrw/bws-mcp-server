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
  argv: z
    .array(z.string())
    .min(1, 'argv must contain at least one element (the program to run)'),
  project_id: z.string().optional(),
  no_inherit_env: z.boolean().optional().default(false),
  confirm: z.literal(true, {
    errorMap: () => ({
      message: 'confirm must be true to execute a command via bws run',
    }),
  }),
});

export const runTool: Tool = {
  name: 'bws_run',
  description:
    'Execute a command with project secrets injected as environment variables, using `bws run`. EXECUTION — requires { "confirm": true }. ' +
    'The argv is passed DIRECTLY to the child process (no shell, no eval, no /bin/sh). ' +
    'To run a shell pipeline, pass `["sh", "-c", "your | pipeline"]` explicitly. ' +
    'Use project_id to scope which secrets get injected; set no_inherit_env: true to start from a clean environment. ' +
    'Returns stdout, stderr, and exit code.',
  inputSchema: {
    type: 'object',
    properties: {
      argv: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        description:
          'Argv array: program followed by arguments. Example: ["deploy.sh", "--env", "staging"] or ["psql", "-c", "SELECT 1"]. To run a shell pipeline, pass ["sh", "-c", "cmd1 | cmd2"]. No implicit shell wrapping.',
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
    required: ['argv', 'confirm'],
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
      argv: readonly string[];
      projectId?: string;
      noInheritEnv?: boolean;
    } = { argv: parsed.data.argv };
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
