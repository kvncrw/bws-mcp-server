/**
 * MCP server bootstrap. Registers the tool list + call handlers
 * against the official SDK's Server class.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { allTools, toolHandlers } from './tools/index.js';

export const SERVER_NAME = 'bws-mcp-server';
export const SERVER_VERSION = '0.1.0';

export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;
      const handler = toolHandlers[name];
      if (!handler) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        } as CallToolResult;
      }
      try {
        const result = await handler(
          args as Record<string, unknown> | undefined,
        );
        return result as unknown as CallToolResult;
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        } as CallToolResult;
      }
    },
  );

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep stdout pristine — logs go to stderr.
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}
