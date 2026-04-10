/**
 * Secret tools: list, get, create, edit, delete.
 *
 * `bws_secret_list` is default-safe — it strips values and notes
 * from the response unless the caller explicitly sets
 * `include_values: true`.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import {
  createSecret,
  deleteSecret,
  editSecret,
  getSecret,
  listSecrets,
} from '../bws/client.js';
import type { BwsSecret, BwsSecretSummary } from '../bws/types.js';
import {
  errorResult,
  okResult,
  requireConfirm,
  type ToolHandlerResult,
} from './types.js';

// Schemas

export const secretListSchema = z.object({
  project_id: z.string().optional(),
  include_values: z.boolean().optional().default(false),
});

export const secretGetSchema = z.object({
  id: z.string().min(1, 'secret id is required'),
});

export const secretCreateSchema = z.object({
  key: z.string().min(1, 'secret key is required'),
  value: z.string(),
  project_id: z.string().min(1, 'project_id is required'),
  note: z.string().optional(),
});

export const secretEditSchema = z
  .object({
    id: z.string().min(1, 'secret id is required'),
    key: z.string().optional(),
    value: z.string().optional(),
    note: z.string().optional(),
    project_id: z.string().optional(),
  })
  .refine(
    (data) =>
      data.key !== undefined ||
      data.value !== undefined ||
      data.note !== undefined ||
      data.project_id !== undefined,
    {
      message:
        'at least one of key, value, note, or project_id must be provided',
    },
  );

export const secretDeleteSchema = z.object({
  id: z.string().min(1, 'secret id is required'),
  confirm: z.literal(true, {
    errorMap: () => ({
      message: 'confirm must be true to delete a secret',
    }),
  }),
});

// Redaction helper

export function redactSecrets(secrets: BwsSecret[]): BwsSecretSummary[] {
  return secrets.map((s) => ({
    ...s,
    value: '[REDACTED]' as const,
    note: '[REDACTED]' as const,
  }));
}

// Tool definitions

export const secretListTool: Tool = {
  name: 'bws_secret_list',
  description:
    'List secrets in a project (or every secret the token can see, if project_id is omitted). Default-safe: values and notes are redacted unless you set include_values: true. Only opt in when you actually need the plaintext — returned values will appear in conversation history.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description:
          'Optional project UUID to filter by. If omitted, lists all secrets the token can see.',
      },
      include_values: {
        type: 'boolean',
        description:
          'Default false. When true, returns actual secret values and notes. Use sparingly.',
      },
    },
    additionalProperties: false,
  },
};

export const secretGetTool: Tool = {
  name: 'bws_secret_get',
  description:
    'Get one secret by id, including its value. The value will appear in the response and be visible to the model.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Secret UUID' },
    },
    required: ['id'],
    additionalProperties: false,
  },
};

export const secretCreateTool: Tool = {
  name: 'bws_secret_create',
  description: 'Create a new secret inside a project.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Secret key (env-var style name)' },
      value: { type: 'string', description: 'Secret value' },
      project_id: {
        type: 'string',
        description: 'UUID of the project to create the secret in',
      },
      note: { type: 'string', description: 'Optional note' },
    },
    required: ['key', 'value', 'project_id'],
    additionalProperties: false,
  },
};

export const secretEditTool: Tool = {
  name: 'bws_secret_edit',
  description:
    'Edit an existing secret. At least one of key / value / note / project_id must be provided.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Secret UUID' },
      key: { type: 'string' },
      value: { type: 'string' },
      note: { type: 'string' },
      project_id: { type: 'string', description: 'Move secret to a new project' },
    },
    required: ['id'],
    additionalProperties: false,
  },
};

export const secretDeleteTool: Tool = {
  name: 'bws_secret_delete',
  description:
    'Delete a secret by id. DESTRUCTIVE — requires { "confirm": true }.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Secret UUID' },
      confirm: {
        type: 'boolean',
        description: 'Must be literally true to authorize deletion.',
      },
    },
    required: ['id', 'confirm'],
    additionalProperties: false,
  },
};

// Handlers

export async function handleSecretList(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  const parsed = secretListSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }
  try {
    const config = loadConfig();
    const secrets = await listSecrets(config, parsed.data.project_id);
    if (parsed.data.include_values) {
      return okResult(secrets);
    }
    return okResult(redactSecrets(secrets));
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleSecretGet(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  const parsed = secretGetSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }
  try {
    const secret = await getSecret(loadConfig(), parsed.data.id);
    return okResult(secret);
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleSecretCreate(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  const parsed = secretCreateSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }
  try {
    const secret = await createSecret(
      loadConfig(),
      parsed.data.key,
      parsed.data.value,
      parsed.data.project_id,
      parsed.data.note,
    );
    return okResult(secret);
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleSecretEdit(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  const parsed = secretEditSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }
  try {
    const input: {
      id: string;
      key?: string;
      value?: string;
      note?: string;
      projectId?: string;
    } = { id: parsed.data.id };
    if (parsed.data.key !== undefined) input.key = parsed.data.key;
    if (parsed.data.value !== undefined) input.value = parsed.data.value;
    if (parsed.data.note !== undefined) input.note = parsed.data.note;
    if (parsed.data.project_id !== undefined)
      input.projectId = parsed.data.project_id;
    const secret = await editSecret(loadConfig(), input);
    return okResult(secret);
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleSecretDelete(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  const gate = requireConfirm(args, 'bws_secret_delete');
  if (gate) return gate;

  const parsed = secretDeleteSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }
  try {
    const result = await deleteSecret(loadConfig(), parsed.data.id);
    return okResult(result ?? { deleted: parsed.data.id });
  } catch (err) {
    return errorResult(err);
  }
}

export const secretTools = [
  secretListTool,
  secretGetTool,
  secretCreateTool,
  secretEditTool,
  secretDeleteTool,
];
