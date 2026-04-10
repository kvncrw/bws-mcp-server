/**
 * Project tools: list, get, create, edit, delete.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import {
  createProject,
  deleteProject,
  editProject,
  getProject,
  listProjects,
} from '../bws/client.js';
import {
  errorResult,
  okResult,
  requireConfirm,
  type ToolHandlerResult,
} from './types.js';

// Schemas — exported so the unit tests can exercise them directly.

export const projectGetSchema = z.object({
  id: z.string().min(1, 'project id is required'),
});

export const projectCreateSchema = z.object({
  name: z.string().min(1, 'project name is required'),
});

export const projectEditSchema = z.object({
  id: z.string().min(1, 'project id is required'),
  name: z.string().min(1, 'new project name is required'),
});

export const projectDeleteSchema = z.object({
  id: z.string().min(1, 'project id is required'),
  confirm: z.literal(true, {
    errorMap: () => ({
      message: 'confirm must be true to delete a project',
    }),
  }),
});

// Tool definitions

export const projectListTool: Tool = {
  name: 'bws_project_list',
  description:
    'List every Bitwarden Secrets Manager project the configured machine token can see. Returns an array of { id, organizationId, name, creationDate, revisionDate }.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

export const projectGetTool: Tool = {
  name: 'bws_project_get',
  description: 'Get a single project by id.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Project UUID' },
    },
    required: ['id'],
    additionalProperties: false,
  },
};

export const projectCreateTool: Tool = {
  name: 'bws_project_create',
  description:
    'Create a new project in the organization the machine token belongs to.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Human-readable project name' },
    },
    required: ['name'],
    additionalProperties: false,
  },
};

export const projectEditTool: Tool = {
  name: 'bws_project_edit',
  description: 'Rename an existing project.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Project UUID' },
      name: { type: 'string', description: 'New project name' },
    },
    required: ['id', 'name'],
    additionalProperties: false,
  },
};

export const projectDeleteTool: Tool = {
  name: 'bws_project_delete',
  description:
    'Delete a project by id. DESTRUCTIVE — requires { "confirm": true }. Deleting a project may cascade to the secrets inside it; double-check before running.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Project UUID' },
      confirm: {
        type: 'boolean',
        description:
          'Must be literally true to authorize the destructive operation.',
      },
    },
    required: ['id', 'confirm'],
    additionalProperties: false,
  },
};

// Handlers

export async function handleProjectList(): Promise<ToolHandlerResult> {
  try {
    const projects = await listProjects(loadConfig());
    return okResult(projects);
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleProjectGet(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  const parsed = projectGetSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }
  try {
    const project = await getProject(loadConfig(), parsed.data.id);
    return okResult(project);
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleProjectCreate(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  const parsed = projectCreateSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }
  try {
    const project = await createProject(loadConfig(), parsed.data.name);
    return okResult(project);
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleProjectEdit(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  const parsed = projectEditSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }
  try {
    const project = await editProject(
      loadConfig(),
      parsed.data.id,
      parsed.data.name,
    );
    return okResult(project);
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleProjectDelete(
  args: Record<string, unknown> | undefined,
): Promise<ToolHandlerResult> {
  // Gate first, before any schema parse, so the error message is clear.
  const gate = requireConfirm(args, 'bws_project_delete');
  if (gate) return gate;

  const parsed = projectDeleteSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult(parsed.error.issues.map((i) => i.message).join('; '));
  }
  try {
    const result = await deleteProject(loadConfig(), parsed.data.id);
    return okResult(result ?? { deleted: parsed.data.id });
  } catch (err) {
    return errorResult(err);
  }
}

export const projectTools = [
  projectListTool,
  projectGetTool,
  projectCreateTool,
  projectEditTool,
  projectDeleteTool,
];
