/**
 * Aggregates every tool exposed by the server.
 *
 * The order here matches the order `tools/list` returns them in.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { statusTool, handleStatus } from './status.js';
import {
  projectListTool,
  projectGetTool,
  projectCreateTool,
  projectEditTool,
  projectDeleteTool,
  handleProjectList,
  handleProjectGet,
  handleProjectCreate,
  handleProjectEdit,
  handleProjectDelete,
} from './projects.js';
import {
  secretListTool,
  secretGetTool,
  secretCreateTool,
  secretEditTool,
  secretDeleteTool,
  handleSecretList,
  handleSecretGet,
  handleSecretCreate,
  handleSecretEdit,
  handleSecretDelete,
} from './secrets.js';
import { runTool, handleRun } from './run.js';
import type { ToolHandlerResult } from './types.js';

export const allTools: Tool[] = [
  statusTool,
  projectListTool,
  projectGetTool,
  projectCreateTool,
  projectEditTool,
  projectDeleteTool,
  secretListTool,
  secretGetTool,
  secretCreateTool,
  secretEditTool,
  secretDeleteTool,
  runTool,
];

export type ToolHandler = (
  args: Record<string, unknown> | undefined,
) => Promise<ToolHandlerResult>;

export const toolHandlers: Record<string, ToolHandler> = {
  bws_status: async () => handleStatus(),
  bws_project_list: async () => handleProjectList(),
  bws_project_get: handleProjectGet,
  bws_project_create: handleProjectCreate,
  bws_project_edit: handleProjectEdit,
  bws_project_delete: handleProjectDelete,
  bws_secret_list: handleSecretList,
  bws_secret_get: handleSecretGet,
  bws_secret_create: handleSecretCreate,
  bws_secret_edit: handleSecretEdit,
  bws_secret_delete: handleSecretDelete,
  bws_run: handleRun,
};
